// -----------------------------------------------------------------------------
// The integration at runtime: the stations typed in the configuration, the
// last states of their equipment, the refresh timer, the devices offered in
// the Discover tab, the states of the stations added to Gladys, and the scene
// triggers.
//
// Two sources: the SNCF portal (stations) and the City of Paris (the street
// equipment of the districts chosen, src/paris.js). A "site" is either: a
// station UUID or a district ("paris-13"); each source has its own reading
// time and error, an outage of one never holds the other back.
//
// Data flow: the station list of the portal (read once a day) turns the names
// typed into station ids. Every station found, plus every station added to
// Gladys, is read at the configured pace, all in one request. The stations
// found are offered in the Discover tab; the ones the user adds are the
// "followed" stations: states, widget, triggers and scene action.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DEFAULT_CONFIG, normalizeConfig } from './config.js';
import { STATION_TYPE, buildStationDevice, counts, siteIds, stationStates } from './devices.js';
import { REPORTS, lines, render } from './messages.js';
import {
  PARIS_TYPE,
  districtName,
  districtOf,
  isDistrict,
  isParisSite,
  parisSite,
  readParis,
} from './paris.js';
import {
  STATES,
  isStationId,
  readEquipment,
  readEquipped,
  readStations,
  resolveQuery,
} from './sncf.js';

const logger = createLogger({ name: 'ascenseurs-gares' });

// The station list changes a few times a year.
export const LIST_TTL_MS = 24 * 3600 * 1000;
// Unchanged states (a station always in order) are sent again this often, or
// the dashboard shows "no recent value" after 48 hours.
export const HEARTBEAT_MS = 12 * 3600 * 1000;
// States older than this (the portal down for hours) are flagged in the widget.
export const STALE_MS = 3 * 3600 * 1000;

export const SOURCES = { SNCF: 'sncf', PARIS: 'paris' };
export const sourceOf = (siteId) => (isParisSite(siteId) ? SOURCES.PARIS : SOURCES.SNCF);

// The lines of the status action, per source.
const STATUS_KEYS = {
  [SOURCES.SNCF]: { waiting: 'waiting', read: 'read', error: 'error' },
  [SOURCES.PARIS]: { waiting: 'parisWaiting', read: 'parisRead', error: 'parisError' },
};

export const TRIGGERS = {
  DOWN: 'equipment_down',
  BACK: 'equipment_back',
};

export class Stations {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] false in the tests: they call refresh()
   */
  constructor({ gladys, fetch = globalThis.fetch, now = Date.now, timers = true }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.now = now;
    this.useTimers = timers;
    this.config = normalizeConfig(DEFAULT_CONFIG);
    this.list = null; // { stations, equipped, at }
    this.listError = null;
    this.resolved = []; // resolveQuery results, one per name typed
    this.resolvedFor = null;
    this.readings = new Map(); // station id → equipment[]
    this.lastKnown = new Map(); // equipment id → last state known: "ok" or "ko"
    this.names = new Map(); // station id → station name
    // Per source: last good reading, the one before, last error.
    this.sources = Object.fromEntries(
      Object.values(SOURCES).map((name) => [name, { okAt: null, previousOkAt: null, error: null }]),
    );
    this.discoveredSignature = null;
    this.publishFailed = false;
    this.discoveryFailed = false;
    this.fireFailed = false;
    this.timer = null;
    this.stopped = false;
    this.refreshing = null;
    this.loading = Promise.resolve();
  }

  // --- lifecycle --------------------------------------------------------------

  async start(config) {
    this.config = config;
    this.schedule();
    logger.info(
      `Started: ${config.stations.length} station name(s) typed, ${config.parisDistricts.length} district(s) of Paris, ${this.watched().length} device(s) added`,
    );
    // The first reading in the background: the widget and the scene action
    // wait for it.
    this.loading = this.refresh({ discover: true });
  }

  /** Gladys restarted: everything again, the states included. */
  async resync(config) {
    this.config = config;
    this.gladys.forgetPublishedStates?.();
    await this.refresh({ discover: true });
  }

  async reconfigure(config) {
    this.config = config;
    this.schedule();
    await this.refresh({ discover: true });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.refreshing;
  }

  schedule() {
    if (!this.useTimers || this.stopped) {
      return;
    }
    clearTimeout(this.timer);
    // A callback still running when the schedule changes must not start a
    // second chain: each chain only continues while it is the current one.
    this.generation = (this.generation ?? 0) + 1;
    const generation = this.generation;
    const tick = () => {
      this.timer = setTimeout(async () => {
        await this.refresh();
        if (!this.stopped && this.generation === generation) {
          tick();
        }
      }, this.config.refreshSeconds * 1000);
      this.timer.unref?.();
    };
    tick();
  }

  // --- devices ----------------------------------------------------------------

  deviceId(stationId) {
    return siteIds(this.gladys, stationId).device;
  }

  /** The site of a device created in Gladys (station UUID or "paris-13"), from its params or its external id. */
  stationOfDevice(device) {
    const params = device?.params?.find ? device.params : [];
    const param = params.find((p) => p.name === 'station_id')?.value;
    if (isStationId(param)) {
      return param.toLowerCase();
    }
    const district = params.find((p) => p.name === 'paris_district')?.value;
    if (isDistrict(district)) {
      return parisSite(district);
    }
    const externalId = String(device?.external_id ?? '');
    const id = externalId.split(`:${STATION_TYPE}:`)[1];
    if (isStationId(id)) {
      return id.toLowerCase();
    }
    const fromId = externalId.split(`:${PARIS_TYPE}:`)[1];
    return isDistrict(fromId) ? parisSite(fromId) : null;
  }

  /** The sites added to Gladys: `{ deviceId, stationId, name }[]`. */
  watched() {
    return (this.gladys.devices ?? [])
      .map((device) => ({
        deviceId: device.external_id,
        stationId: this.stationOfDevice(device),
        name: device.name,
      }))
      .filter((entry) => entry.stationId);
  }

  /** The sites found: stations for the names typed, then the districts chosen. `{ id, name }[]`. */
  foundStations() {
    const found = new Map();
    for (const result of this.resolved) {
      for (const station of result.stations) {
        found.set(station.id, station);
      }
    }
    for (const district of this.config.parisDistricts ?? []) {
      found.set(parisSite(district), { id: parisSite(district), name: districtName(district) });
    }
    return [...found.values()];
  }

  /** The name of a site for the sentences and the triggers. */
  siteName(siteId, fallback) {
    const district = districtOf(siteId);
    return district ? districtName(district) : (this.names.get(siteId) ?? fallback);
  }

  /** The stations to read: the ones found, and the ones added to Gladys. */
  activeIds() {
    return [
      ...new Set([
        ...this.foundStations().map((station) => station.id),
        ...this.watched().map((entry) => entry.stationId),
      ]),
    ];
  }

  /** The station of a device: `{ stationId, name, equipment }`, equipment null if not read. */
  lookup(deviceId) {
    const entry = this.watched().find((w) => w.deviceId === deviceId);
    if (!entry) {
      return null;
    }
    return {
      stationId: entry.stationId,
      name: this.siteName(entry.stationId, entry.name),
      equipment: this.readings.get(entry.stationId) ?? null,
    };
  }

  /** Waits for the first reading (at most `ms`), for a widget or a scene action asked at start. */
  async firstReading(ms = 10000) {
    let timer;
    await Promise.race([
      this.loading,
      new Promise((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
    clearTimeout(timer);
  }

  async publishDiscovered({ force = false } = {}) {
    const devices = [];
    for (const station of this.foundStations()) {
      const equipment = this.readings.get(station.id);
      if (equipment?.length > 0) {
        devices.push(buildStationDevice(this.gladys, station, equipment, this.config.language));
      }
    }
    const signature = JSON.stringify(devices.map((d) => [d.external_id, d.name, d.features]));
    if (!force && signature === this.discoveredSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discoveredSignature = signature;
      if (this.discoveryFailed) {
        this.discoveryFailed = false;
        logger.info('Discovered stations published again');
      }
    } catch (err) {
      if (!this.discoveryFailed) {
        logger.warn(`Cannot publish the discovered stations: ${err.message}`);
      }
      this.discoveryFailed = true;
    }
  }

  async publish(states) {
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (this.publishFailed) {
        this.publishFailed = false;
        logger.info('States published again');
      }
    } catch (err) {
      // Gladys restarting: said once, the next refresh sends them again.
      if (!this.publishFailed) {
        logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
      }
      this.publishFailed = true;
    }
  }

  /** A device was just added in Gladys: its states, all of them, now. */
  async onDeviceCreated(device) {
    const found = this.lookup(device?.external_id);
    if (!found?.equipment) {
      // Never read yet (a station added from another source): read it now.
      await this.refresh();
      return;
    }
    await this.publish(stationStates(this.gladys, found.stationId, found.equipment));
    this.requestWidgetRefresh();
  }

  requestWidgetRefresh() {
    this.gladys.requestWidgetRefresh?.('station')?.catch?.(() => {});
  }

  // --- refresh ------------------------------------------------------------------

  /** One read of every active station; concurrent calls share it. */
  refresh({ discover = false } = {}) {
    if (!this.refreshing) {
      this.refreshing = this.refreshAll(discover)
        .catch((err) => logger.warn(`Refresh failed: ${err.message}`))
        .finally(() => {
          this.refreshing = null;
        });
      return this.refreshing;
    }
    // A discovery asked during a refresh (names just typed) reads again
    // right after it: the running one may not include the new stations.
    return discover ? this.refreshing.then(() => this.refresh({ discover })) : this.refreshing;
  }

  async refreshAll(forceDiscovery) {
    await this.resolve();
    const ids = this.activeIds();
    let events = [];
    if (ids.length > 0) {
      events = this.changes(await this.readStates(ids));
    }
    await this.publishDiscovered({ force: forceDiscovery });
    const states = [];
    for (const entry of this.watched()) {
      const equipment = this.readings.get(entry.stationId);
      if (equipment) {
        states.push(...stationStates(this.gladys, entry.stationId, equipment));
      }
    }
    await this.publish(states);
    for (const { key, data } of events) {
      await this.fire(key, data);
    }
  }

  /** The names typed → station ids, with the station list of the portal (read once a day). */
  async resolve() {
    const queries = this.config.stations;
    const fresh = this.list && this.now() - this.list.at < LIST_TTL_MS;
    if (queries.length === 0) {
      this.resolved = [];
      this.resolvedFor = null;
    }
    // The list also names the stations added to Gladys, for the sentences.
    const unnamed = this.watched().some(
      (entry) => isStationId(entry.stationId) && !this.names.has(entry.stationId),
    );
    if (queries.length === 0 && !unnamed) {
      return;
    }
    if (!fresh) {
      try {
        const [stations, equipped] = await Promise.all([
          readStations(this.fetch),
          readEquipped(this.fetch),
        ]);
        this.list = { stations, equipped, at: this.now() };
        this.resolvedFor = null;
        if (this.listError) {
          logger.info('Station list back');
        }
        this.listError = null;
        logger.debug(`${stations.length} stations, ${equipped.size} with equipment`);
      } catch (err) {
        if (!this.listError) {
          logger.warn(`Station list unavailable: ${err.message}`);
        }
        this.listError = err.message;
        // A list older than a day still resolves the names; without any,
        // the stations found before (if any) are still read.
        if (!this.list) {
          return;
        }
      }
    }
    for (const entry of this.watched()) {
      const station = this.list.stations.find((s) => s.id === entry.stationId);
      if (station) {
        this.names.set(station.id, station.name);
      }
    }
    const key = JSON.stringify(queries);
    if (queries.length === 0 || this.resolvedFor === key) {
      return;
    }
    this.resolved = queries.map((query) =>
      resolveQuery(query, this.list.stations, this.list.equipped),
    );
    this.resolvedFor = key;
    for (const station of this.foundStations()) {
      this.names.set(station.id, station.name);
    }
  }

  /**
   * Reads the states of the sites, each source on its own; a failure is
   * logged once, until it works again, and keeps the last states of its
   * sites. Resolves the sources read.
   * @returns {Promise<Set<string>>}
   */
  async readStates(ids) {
    const groups = {
      [SOURCES.SNCF]: ids.filter(isStationId),
      [SOURCES.PARIS]: ids.filter(isParisSite),
    };
    const fresh = new Map();
    const read = new Set();
    await Promise.all(
      Object.entries(groups)
        .filter(([, list]) => list.length > 0)
        .map(async ([name, list]) => {
          const readings = await this.readSource(name, list);
          if (readings) {
            read.add(name);
            for (const [id, equipment] of readings) {
              fresh.set(id, equipment);
            }
          }
        }),
    );
    const readings = new Map();
    for (const id of ids) {
      const equipment = fresh.get(id) ?? this.readings.get(id);
      if (equipment) {
        readings.set(id, equipment);
      }
    }
    this.readings = readings;
    return read;
  }

  /** One source: Map site → equipment[], or null on failure. */
  async readSource(name, ids) {
    const source = this.sources[name];
    try {
      const readings =
        name === SOURCES.PARIS
          ? await readParis(this.fetch, ids)
          : await readEquipment(this.fetch, ids);
      // A site that had equipment and suddenly has none is a glitch of
      // the portal (an empty answer), not a site without lifts.
      const hadAny = ids.some((id) => this.readings.get(id)?.length > 0);
      if (hadAny && [...readings.values()].every((list) => list.length === 0)) {
        throw new Error(
          `${name === SOURCES.PARIS ? 'opendata.paris.fr' : 'ressources.data.sncf.com'}: empty answer`,
        );
      }
      for (const [id, list] of readings) {
        if (list.length === 0 && this.readings.get(id)?.length > 0) {
          readings.set(id, this.readings.get(id));
        }
      }
      source.previousOkAt = source.okAt;
      source.okAt = this.now();
      if (source.error) {
        logger.info(name === SOURCES.PARIS ? 'Paris data back' : 'SNCF data back');
      }
      source.error = null;
      logger.debug(`${ids.length} site(s) read from ${name}`);
      return readings;
    } catch (err) {
      if (!source.error) {
        logger.warn(
          `${name === SOURCES.PARIS ? 'Paris' : 'SNCF'} data unavailable: ${err.message}`,
        );
      }
      source.error = err.message;
      return null;
    }
  }

  /**
   * The trigger events of the new readings, against the last state known
   * (OK or KO) of each equipment: an unknown state in between neither fires
   * nor hides a change (KO → unknown → KO fires nothing, KO → unknown → OK
   * fires "back").
   */
  changes(read) {
    // A comparison with a reading hours old (a portal back after an outage)
    // would fire changes that are no longer news.
    const isRecent = ({ okAt, previousOkAt }) =>
      previousOkAt !== null && okAt - previousOkAt <= 2 * this.config.refreshSeconds * 1000 + 5000;
    const watched = new Map(this.watched().map((entry) => [entry.stationId, entry]));
    const events = [];
    for (const [stationId, after] of this.readings) {
      // A source not read this time: its states are the old ones.
      if (!read.has(sourceOf(stationId))) {
        continue;
      }
      const recent = isRecent(this.sources[sourceOf(stationId)]);
      const entry = watched.get(stationId);
      const { ko, total } = counts(after);
      for (const item of after) {
        if (item.state === STATES.UNKNOWN) {
          continue;
        }
        const known = this.lastKnown.get(item.id);
        this.lastKnown.set(item.id, item.state);
        if (!recent || !entry || !known || known === item.state) {
          continue;
        }
        events.push({
          key: item.state === STATES.KO ? TRIGGERS.DOWN : TRIGGERS.BACK,
          data: {
            station: entry.deviceId,
            kind: item.kind,
            station_name: this.siteName(stationId, entry.name),
            equipment_name: item.label,
            location: item.location,
            out_of_order: ko,
            total,
          },
        });
      }
    }
    return events;
  }

  /** True when the last good reading of the source of a site is hours old (or there is none). */
  isStale(siteId) {
    const { okAt } = this.sources[sourceOf(siteId)];
    return okAt === null || this.now() - okAt > STALE_MS;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      if (this.fireFailed) {
        this.fireFailed = false;
        logger.info('Scene triggers fired again');
      }
    } catch (err) {
      if (!this.fireFailed) {
        logger.warn(`Cannot fire the ${key} trigger: ${err.message}`);
      }
      this.fireFailed = true;
    }
  }

  // --- configuration action -----------------------------------------------------

  status() {
    const blocks = [];
    const districts = this.config.parisDistricts ?? [];
    if (this.config.stations.length === 0 && districts.length === 0) {
      blocks.push(render(REPORTS, 'noStation'));
    }
    if (this.listError && this.config.stations.length > 0) {
      blocks.push(render(REPORTS, 'listError', { error: this.listError }));
    }
    for (const result of this.resolved) {
      if (result.stations.length > 0) {
        const names = result.stations.map((station) => station.name).join(', ');
        blocks.push(render(REPORTS, 'found', { query: result.query, names }));
        if (result.more) {
          blocks.push(render(REPORTS, 'more'));
        }
      } else {
        blocks.push(render(REPORTS, result.noEquipment ? 'noEquipment' : 'none', result));
      }
    }
    const paris = this.sources[SOURCES.PARIS];
    for (const district of districts) {
      const equipment = this.readings.get(parisSite(district));
      if (paris.okAt !== null && equipment) {
        const name = districtName(district);
        blocks.push(
          equipment.length > 0
            ? render(REPORTS, 'district', { name, count: equipment.length })
            : render(REPORTS, 'noDistrictEquipment', { name }),
        );
      }
    }
    const active = this.activeIds();
    for (const name of Object.values(SOURCES)) {
      if (!active.some((id) => sourceOf(id) === name)) {
        continue;
      }
      const { okAt, error } = this.sources[name];
      const keys = STATUS_KEYS[name];
      blocks.push(
        okAt === null
          ? render(REPORTS, keys.waiting)
          : render(REPORTS, keys.read, { age: Math.round((this.now() - okAt) / 60000) }),
      );
      if (error) {
        blocks.push(render(REPORTS, keys.error, { error }));
      }
    }
    blocks.push(render(REPORTS, 'watched', { count: this.watched().length }));
    return lines(...blocks);
  }
}
