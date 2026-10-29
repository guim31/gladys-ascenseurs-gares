// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake `fetch` serving the
// real answers of the SNCF portal (captured on 2026-10-29, see
// test/fixtures/sncf/), a manual clock, and the integration wired on top
// through registerHandlers. Nothing touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { EQUIPPED_URL, STATIONS_URL } from '../../src/sncf.js';

process.env.LOG_LEVEL ??= 'silent';

export const fixtureJson = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/sncf/${name}`, import.meta.url), 'utf8'));

// 2026-10-29 17:13 in Paris, the time of the capture.
export const FIXTURE_TIME = Date.parse('2026-10-29T16:13:00Z');

export const STATION = {
  SAINT_LAZARE: '9525725e-3b2c-4d63-9fa9-236a4ae26fee',
  MATABIAU: '876acd6d-c67b-47fd-95ee-f2b13b33508e',
};

/** The station ids of an equipment query (`where=gareid in ("…","…")`). */
export const idsOfQuery = (url) =>
  [...decodeURIComponent(new URL(url).searchParams.get('where') ?? '').matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  );

/**
 * The portal: the station list, the stations with equipment, and the
 * equipment states served from `world.network.equipment` (a copy of the
 * fixture the tests may change), filtered on the stations asked.
 */
function portalRoutes(state) {
  return {
    [STATIONS_URL]: fixtureJson('stations.json'),
    [EQUIPPED_URL]: fixtureJson('equipped.json'),
    equipment: (url) => {
      const ids = idsOfQuery(url);
      return state.equipment.filter((record) => ids.includes(record.gareid));
    },
  };
}

/**
 * A fake `fetch`: `routes[url]` is a JSON value, a status number, a Response,
 * an Error (network failure) or a function of the request returning one of them.
 * The equipment queries go to `routes.equipment`. Every call is recorded in `calls`.
 */
export function createFetch(overrides = {}) {
  const state = { equipment: fixtureJson('equipment.json') };
  const routes = { ...portalRoutes(state), ...overrides };
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} });
    let route = url.includes('/exports/json?where=') ? routes.equipment : routes[url];
    if (typeof route === 'function') {
      route = await route(url, init);
    }
    if (route instanceof Error) {
      throw route;
    }
    if (route === undefined) {
      return new Response('not found', { status: 404 });
    }
    if (route instanceof Response) {
      return route;
    }
    if (typeof route === 'number') {
      return new Response('error', { status: route });
    }
    return new Response(JSON.stringify(route), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, calls, routes, state };
}

/** A manual clock. */
export function createClock(start = FIXTURE_TIME) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {object} [options.network] from createFetch
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  config = { stations: 'Toulouse Matabiau; Paris Saint-Lazare' },
  network = createFetch(),
  devices = [],
  connect = true,
  clock = createClock(),
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, { fetch: network.fetch, timers: false, now: clock.now });
  const world = { gladys, fake: gladys.fake, app, service: app.service, network, clock };
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.service.loading;
  }
  return world;
}

/** Run a configuration action; resolves with its message (multi-language). */
export async function action(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (!ack.success) {
    throw new Error(`${key} failed: ${ack.error}`);
  }
  return ack.data.message;
}

/** The device published for a name part or a predicate, from the last discovery list. */
export const discovered = (world, predicate) =>
  world.fake.discoveredDevices.find(
    typeof predicate === 'function' ? predicate : (d) => d.name.includes(predicate),
  );

/** Create a discovered device in Gladys, as the user would. */
export async function create(world, predicate) {
  const device = discovered(world, predicate);
  if (!device) {
    throw new Error(`${predicate} is not in the discovered devices`);
  }
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** One refresh cycle, `seconds` later. */
export async function cycle(world, seconds = 900) {
  world.clock.advance(seconds * 1000);
  await world.service.refresh();
}

/** Changes the state of equipment records (matched on their label) served by the portal. */
export function setState(world, label, state) {
  let found = 0;
  for (const record of world.network.state.equipment) {
    if (record.libelle === label) {
      record.etat_de_fonctionnement = state;
      found += 1;
    }
  }
  if (found === 0) {
    throw new Error(`no equipment labelled ${label}`);
  }
}

/** Captures what the integration logs, at a level. */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
