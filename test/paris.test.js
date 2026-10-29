// -----------------------------------------------------------------------------
// The street lifts and escalators of the City of Paris, against the real
// answer of opendata.paris.fr (2026-10-29): parsing, one device per district,
// states, triggers, widget, scene action, and an outage of one source that
// never holds the other back.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { districtChoices, normalizeConfig } from '../src/config.js';
import {
  PARIS_URL,
  districtName,
  parisKindOf,
  parisStateOf,
  prettyPlace,
  readParis,
} from '../src/paris.js';
import { TRIGGERS } from '../src/service.js';
import {
  action,
  create,
  createFetch,
  createWorld,
  cycle,
  discovered,
  featureId,
  setParisState,
  setState,
} from './helpers/world.js';

const CARDINET_B = 'Ascenseur - 147 rue Cardinet (B)';
const featureOf = (device, name) => device.features.find((f) => f.name === name)?.external_id;

test('Paris: states, kinds, places and district names from the real values', () => {
  assert.deepEqual(
    ['En fonctionnement', 'En panne', 'Non télé-surveillé', 'EN PANNE ', '', null].map(
      parisStateOf,
    ),
    ['ok', 'ko', 'unknown', 'ko', 'unknown', 'unknown'],
  );
  assert.deepEqual(
    ['ASCENSEUR VOIE PUBLIQUE', 'ESCALIER VOIE PUBLIQUE', 'EPMR VOIE PUBLIQUE', 'BANC'].map(
      parisKindOf,
    ),
    ['elevator', 'escalator', 'elevator', 'other'],
  );
  assert.equal(prettyPlace("66 AVENUE D'IVRY/RUE DU DISQUE"), "66 avenue d'Ivry/rue du Disque");
  assert.equal(prettyPlace('QUAI DE BERCY'), 'Quai de Bercy');
  assert.equal(prettyPlace('PARC CLICHY BATIGNOLLES'), 'Parc Clichy Batignolles');
  assert.deepEqual([1, 13].map(districtName), ['Paris 1er', 'Paris 13e']);
  assert.deepEqual(districtChoices(['17', '13', '13', '21', 'x', 1]), ['1', '13', '17']);
  assert.deepEqual(districtChoices('["15","12"]'), ['12', '15']);
  assert.deepEqual(districtChoices('13; 7'), ['7', '13']);
  assert.deepEqual(districtChoices(undefined), []);
  assert.deepEqual(normalizeConfig({}).parisDistricts, []);
});

test('Paris: only the remotely monitored equipment of the districts asked, one request', async () => {
  const network = createFetch();
  const readings = await readParis(network.fetch, ['paris-13', 'paris-14', 'paris-17', 'bad']);
  assert.deepEqual([...readings.keys()], ['paris-13', 'paris-14', 'paris-17']);
  assert.deepEqual(
    network.calls.map((c) => c.url),
    [PARIS_URL],
  );
  // 13e: 15 records, one not monitored. 14e: one record, not monitored.
  assert.equal(readings.get('paris-13').length, 14);
  assert.equal(readings.get('paris-14').length, 0);
  assert.deepEqual(readings.get('paris-17'), [
    {
      id: '17802_a',
      label: 'Ascenseur - 147 rue Cardinet (A)',
      location: 'Parc Clichy Batignolles',
      kind: 'elevator',
      state: 'ok',
    },
    {
      id: '17802_b',
      label: CARDINET_B,
      location: 'Parc Clichy Batignolles',
      kind: 'elevator',
      state: 'ko',
    },
    {
      id: '17802_c',
      label: 'Ascenseur - 147 rue Cardinet (C)',
      location: 'Parc Clichy Batignolles',
      kind: 'elevator',
      state: 'ok',
    },
    {
      id: '17802_d',
      label: 'Ascenseur - 147 rue Cardinet (D)',
      location: 'Parc Clichy Batignolles',
      kind: 'elevator',
      state: 'ok',
    },
  ]);
  const escalator = readings.get('paris-13').find((item) => item.id === '13904_b');
  assert.equal(escalator.label, "Escalator - 66 avenue d'Ivry/rue du Disque (B)");
  assert.equal(escalator.location, 'Paris 13e');
  assert.ok(readings.get('paris-13').every((item) => item.id !== '13907'));
  // Nothing asked: no request.
  const idle = createFetch();
  assert.equal((await readParis(idle.fetch, [])).size, 0);
  assert.equal(idle.calls.length, 0);
});

test('Paris: one device per district chosen, none for a district without monitored equipment', async (t) => {
  const world = await createWorld({ config: { paris_districts: ['13', '14', '17'] } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices.map((d) => d.name).sort(), [
    'Paris 13e · ascenseurs et escalators',
    'Paris 17e · ascenseurs et escalators',
  ]);
  // No station typed: the SNCF portal is never read.
  assert.deepEqual(
    world.network.calls.map((c) => c.url),
    [PARIS_URL],
  );
  const device = discovered(world, '17e');
  assert.equal(device.external_id, 'ext:test-integration:paris:17');
  assert.deepEqual(device.params, [{ name: 'paris_district', value: '17' }]);
  assert.equal(device.should_poll, false);
  assert.equal(device.features.length, 3 + 4);
  assert.ok(featureId(device, 'eq-17802_b'));
  const message = await action(world, 'status');
  assert.match(message.fr, /■ Paris 13e : 14 ascenseurs ou escalators télésurveillés/);
  assert.match(message.fr, /■ Paris 14e : aucun ascenseur ni escalator télésurveillé/);
  assert.match(message.fr, /Ville de Paris : dernière lecture il y a 0 min/);
  assert.doesNotMatch(message.fr, /Aucune gare saisie/);
  assert.doesNotMatch(message.en, /^Last reading/m);
});

test('Paris: states of a district added, then a lift back in service fires the trigger', async (t) => {
  const world = await createWorld({ config: { paris_districts: ['17'] } });
  t.after(() => world.app.stop());
  const device = await create(world, '17e');
  const last = (id) => world.fake.lastState(id);
  assert.equal(last(featureId(device, 'out_of_order')), 1);
  assert.equal(last(featureId(device, 'unknown')), 0);
  assert.equal(last(featureId(device, 'all_ok')), 0);
  assert.equal(last(featureOf(device, CARDINET_B)), 0);
  assert.deepEqual(world.fake.widgetRefreshes, ['station']);

  setParisState(world, '17802_B', 'En fonctionnement');
  await cycle(world);
  assert.equal(last(featureId(device, 'all_ok')), 1);
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: TRIGGERS.BACK,
      data: {
        station: device.external_id,
        kind: 'elevator',
        station_name: 'Paris 17e',
        equipment_name: CARDINET_B,
        location: 'Parc Clichy Batignolles',
        out_of_order: 0,
        total: 4,
      },
    },
  ]);

  const summary = await world.fake.sceneAction('summary', {});
  assert.equal(summary.success, true);
  assert.equal(summary.data.outputs.sentence, 'Paris 17e : les 4 équipements sont en service.');
  assert.equal(summary.data.outputs.all_ok, 1);
});

test('Paris: a device known only by its external id is still followed', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  await world.fake.deviceCreated({
    external_id: 'ext:test-integration:paris:15',
    name: 'Petite Ceinture',
    features: [],
  });
  assert.equal(world.service.readings.get('paris-15').length, 3);
  const summary = await world.fake.sceneAction('summary', {});
  assert.match(summary.data.outputs.sentence, /^Paris 15e : 3 équipements sur 3 en panne/);
});

test('Paris down: SNCF still read and fired, the Paris widget says its data is old', async (t) => {
  const world = await createWorld({
    config: { stations: 'Toulouse Matabiau', paris_districts: ['17'] },
  });
  t.after(() => world.app.stop());
  const station = await create(world, 'Matabiau');
  const district = await create(world, '17e');
  world.network.routes[PARIS_URL] = 503;
  await cycle(world, 4 * 3600);
  setState(world, 'Ascenseur - Métro / Parvis côté gare', 'KO');
  setParisState(world, '17802_A', 'En panne');
  await cycle(world);
  // SNCF: read, its trigger fired. Paris: nothing new, last states kept.
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => [e.key, e.data.station]),
    [[TRIGGERS.DOWN, station.external_id]],
  );
  assert.equal(world.fake.lastState(featureId(district, 'out_of_order')), 1);
  assert.equal(world.service.readings.get('paris-17').length, 4);

  const paris = await world.fake.widgetGet('station', {
    language: 'fr',
    settings: { station: district.external_id },
  });
  assert.deepEqual(validateWidgetContent(paris.data.content), []);
  assert.ok(
    paris.data.content.components.some(
      (c) => c.text === 'Données de plus de 3 h : portail de la Ville de Paris injoignable.',
    ),
  );
  const sncf = await world.fake.widgetGet('station', {
    language: 'fr',
    settings: { station: station.external_id },
  });
  assert.ok(!sncf.data.content.components.some((c) => c.type === 'text' && /3 h/.test(c.text)));

  const message = await action(world, 'status');
  assert.match(message.fr, /Ville de Paris, dernière erreur : opendata.paris.fr: HTTP 503/);
  assert.doesNotMatch(message.fr, /^Dernière erreur/m);

  // Back: no stale trigger for a change hidden by hours of outage.
  world.network.routes[PARIS_URL] = () => world.network.state.paris;
  await cycle(world);
  assert.equal(world.fake.sceneEvents.length, 1);
  assert.equal(world.fake.lastState(featureId(district, 'out_of_order')), 2);
});

test('Paris: an empty answer is a failure, the last states stay', async (t) => {
  const world = await createWorld({ config: { paris_districts: ['13'] } });
  t.after(() => world.app.stop());
  const device = await create(world, '13e');
  world.network.routes[PARIS_URL] = [];
  await cycle(world);
  assert.equal(world.service.readings.get('paris-13').length, 14);
  assert.equal(world.fake.lastState(featureId(device, 'out_of_order')), 11);
  assert.match((await action(world, 'status')).en, /City of Paris, last error: .*empty answer/);
});
