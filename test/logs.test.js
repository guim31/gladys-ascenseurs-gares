// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, the portal lost and back), never one line per reading; a failure
// that repeats at every cycle is logged once, plus one line when it is over.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLogs, create, createWorld, cycle } from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(lines.map(strip), [
    '[INFO] [ascenseurs-gares] Started: 2 station name(s) typed, 0 station(s) added',
  ]);
});

test('a normal reading cycle writes nothing at info, one line at debug', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, 'Matabiau');
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 5; i += 1) {
    await cycle(world);
  }
  assert.deepEqual(lines, []);
  const debug = captureLogs(t, 'debug');
  await cycle(world);
  assert.deepEqual(debug.map(strip), ['[DEBUG] [ascenseurs-gares] 2 station(s) read']);
});

test('a portal down at every cycle: one warning, then one line at recovery', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, 'Matabiau');
  const saved = world.network.routes.equipment;
  const lines = captureLogs(t, 'info');
  world.network.routes.equipment = new TypeError('fetch failed');
  for (let i = 0; i < 4; i += 1) {
    await cycle(world);
  }
  world.network.routes.equipment = saved;
  await cycle(world);
  assert.deepEqual(lines.map(strip), [
    '[WARN] [ascenseurs-gares] SNCF data unavailable: ressources.data.sncf.com: fetch failed',
    '[INFO] [ascenseurs-gares] SNCF data back',
  ]);
});
