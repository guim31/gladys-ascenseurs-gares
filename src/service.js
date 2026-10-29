// -----------------------------------------------------------------------------
// The integration at runtime: the stations typed in the configuration, the
// last states of their equipment, the refresh timer, the devices offered in
// the Discover tab, the states of the stations added to Gladys, and the scene
// triggers.
//
// Data flow: the station list of the portal (read once a day) turns the names
// typed into station ids. Every station found, plus every station added to
// Gladys, is read at the configured pace, all in one request. The stations
// found are offered in the Discover tab; the ones the user adds are the
// "followed" stations: states, widget, triggers and scene action.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DEFAULT_CONFIG, normalizeConfig } from './config.js';
import { STATION_TYPE, buildStationDevice, counts, stationStates } from './devices.js';
import { REPORTS, lines, render } from './messages.js';
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
export const HEARTBEAT_MS = 6 * 3600 * 1000;

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
    this.names = new Map(); // station id → station name
    this.okAt = null;
    this.previousOkAt = null;
    this.error = null;
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
      `Started: ${config.stations.length} station name(s) typed, ${this.watched().length} station(s) added`,
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
    return this.gladys.externalIds(STATION_TYPE, stationId).device;
  }

  /** The station id of a device created in Gladys, from its params or its external id. */
  stationOfDevice(device) {
    const param = device?.params?.find?.((p) => p.name === 'station_id')?.value;
    if (isStationId(param)) {
      return param.toLowerCase();
    }
    const id = String(device?.external_id ?? '').split(`:${STATION_TYPE}:`)[1];
    return isStationId(id) ? id.toLowerCase() : null;
  }

  /** The stations added to Gladys: `{ deviceId, stationId, name }[]`. */
  watched() {
    return (this.gladys.devices ?? [])
      .map((device) => ({
        deviceId: device.external_id,
        stationId: this.stationOfDevice(device),
        name: device.name,
      }))
      .filter((entry) => entry.stationId);
  }

  /** The stations found for the names typed: `{ id, name }[]`, without duplicates. */
  foundStations() {
    const found = new Map();
    for (const result of this.resolved) {
      for (const station of result.stations) {
        found.set(station.id, station);
      }
    }
    return [...found.values()];
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
      name: this.names.get(entry.stationId) ?? entry.name,
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
    const previous = this.readings;
    const ids = this.activeIds();
    let events = [];
    if (ids.length > 0 && (await this.readStates(ids))) {
      events = this.changes(previous);
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
    const unnamed = this.watched().some((entry) => !this.names.has(entry.stationId));
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
        // The stations found before (if any) are still read.
        return;
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

  /** Reads the states of the stations; a failure is logged once, until it works again. */
  async readStates(ids) {
    try {
      this.readings = await readEquipment(this.fetch, ids);
      this.previousOkAt = this.okAt;
      this.okAt = this.now();
      if (this.error) {
        logger.info('SNCF data back');
      }
      this.error = null;
      logger.debug(`${ids.length} station(s) read`);
      return true;
    } catch (err) {
      if (!this.error) {
        logger.warn(`SNCF data unavailable: ${err.message}`);
      }
      this.error = err.message;
      return false;
    }
  }

  /** The trigger events between the previous and the new readings. */
  changes(previous) {
    // A comparison with a reading hours old (a portal back after an outage)
    // would fire changes that are no longer news.
    const recent =
      this.previousOkAt !== null &&
      this.okAt - this.previousOkAt <= 2 * this.config.refreshSeconds * 1000 + 5000;
    if (!recent) {
      return [];
    }
    const events = [];
    for (const entry of this.watched()) {
      const before = previous.get(entry.stationId);
      const after = this.readings.get(entry.stationId);
      if (!before || !after) {
        continue;
      }
      const name = this.names.get(entry.stationId) ?? entry.name;
      const { ko, total } = counts(after);
      for (const item of after) {
        const old = before.find((e) => e.id === item.id);
        if (!old) {
          continue;
        }
        let key = null;
        if (old.state !== STATES.KO && item.state === STATES.KO) {
          key = TRIGGERS.DOWN;
        } else if (old.state === STATES.KO && item.state === STATES.OK) {
          key = TRIGGERS.BACK;
        }
        if (key) {
          events.push({
            key,
            data: {
              station: entry.deviceId,
              kind: item.kind,
              station_name: name,
              equipment_name: item.label,
              location: item.location,
              out_of_order: ko,
              total,
            },
          });
        }
      }
    }
    return events;
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
    if (this.config.stations.length === 0) {
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
    if (this.activeIds().length > 0) {
      blocks.push(
        this.okAt === null
          ? render(REPORTS, 'waiting')
          : render(REPORTS, 'read', { age: Math.round((this.now() - this.okAt) / 60000) }),
      );
    }
    if (this.error) {
      blocks.push(render(REPORTS, 'error', { error: this.error }));
    }
    blocks.push(render(REPORTS, 'watched', { count: this.watched().length }));
    return lines(...blocks);
  }
}
