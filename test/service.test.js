// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the real
// answers of the SNCF portal: name resolution, discovery, states, triggers,
// widget, scene action, the integration's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_COLORS, validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { TRIGGERS } from '../src/service.js';
import { EQUIPPED_URL, STATIONS_URL } from '../src/sncf.js';
import {
  STATION,
  action,
  create,
  createFetch,
  createWorld,
  cycle,
  discovered,
  featureId,
  idsOfQuery,
  setState,
} from './helpers/world.js';

const KO_MATABIAU = 'Ascenseur - Souterrain / Voies 6 et 7 (côté Sud)';
const OK_MATABIAU = 'Ascenseur - Métro / Parvis côté gare';
const UNKNOWN_MATABIAU = 'Ascenseur - Concessionnaires';

const equipmentFeature = (device, label) =>
  device.features.find((feature) => feature.name === label)?.external_id;

test('the stations typed are offered with their equipment, read in one filtered request', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const names = world.fake.discoveredDevices.map((d) => d.name).sort();
  assert.deepEqual(names, [
    'Paris Saint-Lazare · ascenseurs et escalators',
    'Toulouse Matabiau · ascenseurs et escalators',
  ]);
  const matabiau = discovered(world, 'Matabiau');
  assert.equal(matabiau.should_poll, false);
  assert.equal(matabiau.poll_frequency, undefined);
  assert.equal(matabiau.features.length, 3 + 25);
  assert.deepEqual(matabiau.params, [{ name: 'station_id', value: STATION.MATABIAU }]);
  const urls = world.network.calls.map((call) => call.url);
  assert.deepEqual(urls.slice(0, 2).sort(), [EQUIPPED_URL, STATIONS_URL].sort());
  assert.equal(urls.length, 3);
  assert.deepEqual(idsOfQuery(urls[2]), [STATION.MATABIAU, STATION.SAINT_LAZARE]);
});

test('names: a city lists its equipped stations, a UIC code works, an unknown name says so', async (t) => {
  const world = await createWorld({
    config: { stations: 'Marseille; 87313668; Nulle-Part; Marseille-en-Beauvaisis' },
  });
  t.after(() => world.app.stop());
  const message = await action(world, 'status');
  assert.match(message.fr, /« Marseille » : Marseille Blancarde, Marseille Saint-Charles/);
  assert.match(message.fr, /« 87313668 » : Méru/);
  assert.match(message.fr, /« Nulle-Part » : aucune gare trouvée/);
  assert.match(message.fr, /« Marseille-en-Beauvaisis » : aucun ascenseur ni escalator/);
  assert.match(message.en, /Last reading 0 min ago/);
  // Marseille Blancarde has no equipment in the captured states: not offered.
  assert.deepEqual(world.fake.discoveredDevices.map((d) => d.name).sort(), [
    'Marseille Saint-Charles · ascenseurs et escalators',
    'Méru · ascenseurs et escalators',
  ]);
});

test('no station typed: nothing read, an empty discovery, the status says what to do', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.equal(world.network.calls.length, 0);
  const message = await action(world, 'status');
  assert.match(message.fr, /Aucune gare saisie/);
});

test('a station added gets all its states at once, then only the changes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, 'Matabiau');
  const last = (id) => world.fake.lastState(id);
  assert.equal(last(featureId(device, 'out_of_order')), 1);
  assert.equal(last(featureId(device, 'unknown')), 8);
  assert.equal(last(featureId(device, 'all_ok')), 0);
  assert.equal(last(equipmentFeature(device, KO_MATABIAU)), 0);
  assert.equal(last(equipmentFeature(device, OK_MATABIAU)), 1);
  // An unknown state is never published: the last known one stays.
  assert.equal(last(equipmentFeature(device, UNKNOWN_MATABIAU)), undefined);
  assert.deepEqual(world.fake.widgetRefreshes, ['station']);

  const before = world.fake.states.length;
  setState(world, KO_MATABIAU, 'OK');
  await cycle(world);
  const sent = world.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.deepEqual(sent.sort(), [
    equipmentFeature(device, KO_MATABIAU),
    featureId(device, 'out_of_order'),
  ]);
  assert.equal(last(featureId(device, 'out_of_order')), 0);
});

test('all in service: 1 only when every equipment is known to work', async (t) => {
  const world = await createWorld({ config: { stations: 'Méru' } });
  t.after(() => world.app.stop());
  const device = await create(world, 'Méru');
  assert.equal(world.fake.lastState(featureId(device, 'all_ok')), 0);
  for (const record of world.network.state.equipment) {
    record.etat_de_fonctionnement = 'OK';
  }
  await cycle(world);
  assert.equal(world.fake.lastState(featureId(device, 'all_ok')), 1);
  assert.equal(world.fake.lastState(featureId(device, 'out_of_order')), 0);
  assert.equal(world.fake.lastState(featureId(device, 'unknown')), 0);
});

test('triggers: out of order, back in service, with the kind and the station', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, 'Matabiau');
  setState(world, OK_MATABIAU, 'KO');
  setState(world, 'Esc mec 3 - Accès métro / Parvis', 'KO');
  await cycle(world);
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => [e.key, e.data.kind]),
    [
      [TRIGGERS.DOWN, 'elevator'],
      [TRIGGERS.DOWN, 'escalator'],
    ],
  );
  assert.deepEqual(world.fake.sceneEvents[0].data, {
    station: device.external_id,
    kind: 'elevator',
    station_name: 'Toulouse Matabiau',
    equipment_name: OK_MATABIAU,
    location: world.network.state.equipment.find((r) => r.libelle === OK_MATABIAU)
      .localisationdescriptive,
    out_of_order: 3,
    total: 25,
  });
  setState(world, OK_MATABIAU, 'OK');
  await cycle(world);
  assert.deepEqual(
    world.fake.sceneEvents.slice(2).map((e) => [e.key, e.data.equipment_name, e.data.out_of_order]),
    [[TRIGGERS.BACK, OK_MATABIAU, 2]],
  );
});

test('triggers: an unknown state in between neither fires nor hides a change', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, 'Matabiau');
  const keys = () => world.fake.sceneEvents.map((e) => [e.key, e.data.equipment_name]);
  // Never known (unknown since the start) → KO: nothing to compare with.
  setState(world, UNKNOWN_MATABIAU, 'KO');
  await cycle(world);
  assert.deepEqual(keys(), []);
  // KO → unknown → KO: still the same breakdown.
  setState(world, KO_MATABIAU, 'INCONNU');
  await cycle(world);
  setState(world, KO_MATABIAU, 'KO');
  await cycle(world);
  assert.deepEqual(keys(), []);
  // KO → unknown → OK: back in service.
  setState(world, KO_MATABIAU, 'INCONNU');
  await cycle(world);
  setState(world, KO_MATABIAU, 'OK');
  await cycle(world);
  // OK → unknown → KO: out of order.
  setState(world, OK_MATABIAU, 'INCONNU');
  await cycle(world);
  setState(world, OK_MATABIAU, 'KO');
  await cycle(world);
  assert.deepEqual(keys(), [
    [TRIGGERS.BACK, KO_MATABIAU],
    [TRIGGERS.DOWN, OK_MATABIAU],
  ]);
});

test('review fixes: an empty answer is a failure, the last states stay', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, 'Matabiau');
  const saved = world.network.state.equipment;
  world.network.state.equipment = [];
  await cycle(world);
  assert.equal(world.fake.discoveredDevices.length, 2);
  assert.match((await action(world, 'status')).en, /Last error: .*empty answer/);
  const result = await world.fake.sceneAction('summary', { stations: [device.external_id] });
  assert.equal(result.data.outputs.total, 25);
  world.network.state.equipment = saved;
  await cycle(world);
  assert.doesNotMatch((await action(world, 'status')).en, /Last error/);
});

test('review fixes: a station list older than a day still resolves new names', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.network.routes[STATIONS_URL] = 500;
  world.clock.advance(25 * 3600 * 1000);
  await world.fake.configUpdated({ stations: 'Méru' });
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.name),
    ['Méru · ascenseurs et escalators'],
  );
});

test('review fixes: the widget says when the data is hours old', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, 'Matabiau');
  world.network.routes.equipment = 503;
  await cycle(world, 4 * 3600);
  const { data } = await world.fake.widgetGet('station', { language: 'fr', settings: {} });
  assert.deepEqual(validateWidgetContent(data.content), []);
  assert.ok(
    data.content.components.some(
      (c) => c.text === 'Données de plus de 3 h : portail SNCF injoignable.',
    ),
  );
});

test('review fixes: a station added before any reading is read at once', async (t) => {
  const world = await createWorld({ config: { stations: 'Méru' } });
  t.after(() => world.app.stop());
  const before = world.network.calls.length;
  await world.fake.deviceCreated({
    external_id: `gladys-ascenseurs-gares:station:${STATION.MATABIAU}`,
    name: 'Toulouse',
    params: [{ name: 'station_id', value: STATION.MATABIAU }],
    features: [],
  });
  assert.ok(world.network.calls.length > before);
  assert.ok(world.service.readings.get(STATION.MATABIAU).length === 25);
});

test('triggers: nothing for a station not added, nor after an outage of the portal', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  setState(world, OK_MATABIAU, 'KO');
  await cycle(world);
  assert.deepEqual(world.fake.sceneEvents, []);
  await create(world, 'Matabiau');
  const saved = world.network.routes.equipment;
  world.network.routes.equipment = 503;
  await cycle(world);
  await cycle(world);
  world.network.routes.equipment = saved;
  setState(world, OK_MATABIAU, 'OK');
  await cycle(world);
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('widget: out of order first, ten rows, the others counted; valid content', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const lazare = await create(world, 'Saint-Lazare');
  await create(world, 'Matabiau');
  const { data } = await world.fake.widgetGet('station', {
    language: 'fr',
    settings: { station: lazare.external_id },
  });
  assert.deepEqual(validateWidgetContent(data.content), []);
  const [status, more] = data.content.components;
  assert.equal(status.items.length, 10);
  assert.deepEqual(
    status.items.slice(0, 6).map((item) => [item.value, item.color]),
    [
      ['en panne', WIDGET_COLORS.DANGER],
      ['en panne', WIDGET_COLORS.DANGER],
      ['état inconnu', WIDGET_COLORS.NEUTRAL],
      ['état inconnu', WIDGET_COLORS.NEUTRAL],
      ['état inconnu', WIDGET_COLORS.NEUTRAL],
      ['en service', WIDGET_COLORS.SUCCESS],
    ],
  );
  assert.ok(status.items.every((item) => item.label.length <= 40));
  assert.deepEqual(more, { type: 'text', text: '+ 25 autres' });

  const problems = await world.fake.widgetGet('station', {
    language: 'en',
    settings: { station: lazare.external_id, only_problems: true },
  });
  assert.equal(problems.data.content.components.length, 1);
  assert.equal(problems.data.content.components[0].items.length, 5);

  // No station picked: the first followed one.
  const first = await world.fake.widgetGet('station', { language: 'de', settings: {} });
  assert.deepEqual(validateWidgetContent(first.data.content), []);
  assert.equal(first.data.content.components[0].items[0].value, 'außer Betrieb');
});

test('widget: every equipment in service, a station gone, no station yet', async (t) => {
  const world = await createWorld({ config: { stations: 'Méru' } });
  t.after(() => world.app.stop());
  const none = await world.fake.widgetGet('station', { language: 'fr', settings: {} });
  assert.match(none.data.content.components[0].text, /Ajoutez une gare/);
  const meru = await create(world, 'Méru');
  for (const record of world.network.state.equipment) {
    record.etat_de_fonctionnement = 'OK';
  }
  await cycle(world);
  const ok = await world.fake.widgetGet('station', {
    language: 'es',
    settings: { station: meru.external_id, only_problems: true },
  });
  assert.equal(
    ok.data.content.components[0].text,
    'Todos los ascensores y escaleras mecánicas están en servicio.',
  );
  const gone = await world.fake.widgetGet('station', {
    language: 'en',
    settings: { station: 'gone' },
  });
  assert.equal(gone.data.content.components[0].text, 'This station is no longer followed.');
});

test('scene action: a sentence and the counts, for the stations picked or all', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const matabiau = await create(world, 'Matabiau');
  await create(world, 'Saint-Lazare');
  const one = await world.fake.sceneAction('summary', { stations: [matabiau.external_id] });
  assert.deepEqual(one.data.outputs, {
    sentence: `Toulouse Matabiau : 1 équipement sur 25 en panne (${KO_MATABIAU}).`,
    out_of_order: 1,
    unknown: 8,
    total: 25,
    all_ok: 0,
  });
  const all = await world.fake.sceneAction('summary', {});
  assert.equal(all.data.outputs.total, 60);
  assert.equal(all.data.outputs.out_of_order, 3);
  assert.match(
    all.data.outputs.sentence,
    /^Toulouse Matabiau : .+ Paris Saint-Lazare : 2 équipements sur 35 en panne/,
  );
  const gone = await world.fake.sceneAction('summary', { stations: ['gone'] });
  assert.equal(gone.success, false);
  assert.match(gone.error, /n'est plus suivie/);
});

test('scene action: no station followed is an error the scene shows', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const result = await world.fake.sceneAction('summary', {});
  assert.equal(result.success, false);
  assert.match(result.error, /Aucune gare n'est suivie/);
});

test('a station added and then removed from the names is still read, and named', async (t) => {
  const network = createFetch();
  const devices = [
    {
      external_id: `gladys-ascenseurs-gares:station:${STATION.MATABIAU}`,
      name: 'Ma gare',
      params: [{ name: 'station_id', value: STATION.MATABIAU }],
      features: [],
    },
  ];
  const world = await createWorld({ config: { stations: '' }, network, devices });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  const result = await world.fake.sceneAction('summary', {});
  assert.match(result.data.outputs.sentence, /^Toulouse Matabiau : /);
});

test('the station list unavailable: said in the status, read again at the next cycle', async (t) => {
  const network = createFetch({ [STATIONS_URL]: 500 });
  const world = await createWorld({ network });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  const message = await action(world, 'status');
  assert.match(message.en, /Station list unavailable: ressources\.data\.sncf\.com: HTTP 500/);
  delete network.routes[STATIONS_URL];
  network.routes[STATIONS_URL] = (await import('./helpers/world.js')).fixtureJson('stations.json');
  await cycle(world);
  assert.equal(world.fake.discoveredDevices.length, 2);
});

test('the station list is read once a day, the states at every cycle', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const listCalls = () => world.network.calls.filter((call) => call.url === STATIONS_URL).length;
  await cycle(world);
  await cycle(world);
  assert.equal(listCalls(), 1);
  await cycle(world, 24 * 3600);
  assert.equal(listCalls(), 2);
});

test('the integration reads on its own timer, at the configured pace', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const network = createFetch();
  const gladys = createFakeGladys({
    config: { stations: 'Toulouse Matabiau', refresh_interval: '600' },
  });
  const app = registerHandlers(gladys, { fetch: network.fetch });
  t.after(() => app.stop());
  await gladys.connect();
  await app.ready;
  await app.service.loading;
  const reads = () => network.calls.filter((call) => call.url.includes('where=')).length;
  assert.equal(reads(), 1);
  t.mock.timers.tick(600 * 1000);
  await app.service.refreshing;
  assert.equal(reads(), 2);
  t.mock.timers.tick(600 * 1000);
  await app.service.refreshing;
  assert.equal(reads(), 3);
});

test('names typed while a reading runs are read right after it', async (t) => {
  const world = await createWorld({ config: { stations: 'Méru' } });
  t.after(() => world.app.stop());
  const saved = world.network.routes.equipment;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  world.network.routes.equipment = async (url) => {
    await gate;
    return saved(url);
  };
  const running = world.service.refresh();
  const reconfigured = world.fake.configUpdated({ stations: 'Méru; Toulouse Matabiau' });
  release();
  await running;
  await reconfigured;
  assert.ok(world.fake.discoveredDevices.some((d) => d.name.startsWith('Toulouse Matabiau')));
});
