// -----------------------------------------------------------------------------
// The SNCF portal client: parsing of the real answers, name matching, the
// filtered query.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stationQueries } from '../src/config.js';
import {
  equipmentUrl,
  kindOf,
  normalizeName,
  readEquipment,
  readEquipped,
  readStations,
  resolveQuery,
  stateOf,
} from '../src/sncf.js';
import { STATION, createFetch, idsOfQuery } from './helpers/world.js';

test('states and kinds from the portal values', () => {
  assert.deepEqual(['OK', 'KO', 'INCONNU', 'ko ', '', null].map(stateOf), [
    'ok',
    'ko',
    'unknown',
    'ko',
    'unknown',
    'unknown',
  ]);
  assert.deepEqual(
    [
      'Ascenseur - 11 Sortie Londres',
      'ascenseur - Quai 1',
      'ASC.PMR 3097 Voie 1 Quai 2',
      'Esc mec - Hall 1',
      'Trottoir roul - Hall 2',
      'Monte-charge',
    ].map(kindOf),
    ['elevator', 'elevator', 'elevator', 'escalator', 'walkway', 'other'],
  );
});

test('names are compared without accents, case, hyphens, and with "St" for "Saint"', () => {
  assert.equal(normalizeName('  Paris St-Lazare '), 'paris saint lazare');
  assert.equal(normalizeName('Méru'), 'meru');
  assert.deepEqual(stationQueries('Méru ;  Toulouse Matabiau\nméru,, '), [
    'Méru',
    'Toulouse Matabiau',
  ]);
});

test('the real answers are read: stations, equipped stations, equipment', async () => {
  const { fetch } = createFetch();
  const stations = await readStations(fetch);
  const equipped = await readEquipped(fetch);
  assert.ok(stations.some((s) => s.id === STATION.MATABIAU && s.name === 'Toulouse Matabiau'));
  assert.equal(equipped.get(STATION.MATABIAU), 25);
  const equipment = await readEquipment(fetch, [STATION.MATABIAU, 'not-an-id']);
  assert.deepEqual([...equipment.keys()], [STATION.MATABIAU]);
  const list = equipment.get(STATION.MATABIAU);
  assert.equal(list.length, 25);
  assert.deepEqual(
    Object.keys(list[0]).sort(),
    ['id', 'kind', 'label', 'location', 'state'].sort(),
  );
  assert.deepEqual(
    list.map((e) => e.label),
    [...list.map((e) => e.label)].sort((a, b) => a.localeCompare(b, 'fr')),
  );
});

test('resolution: exact name, partial name, UIC code, id, unequipped, nothing', async () => {
  const { fetch } = createFetch();
  const stations = await readStations(fetch);
  const equipped = await readEquipped(fetch);
  const names = (query) => resolveQuery(query, stations, equipped).stations.map((s) => s.name);
  assert.deepEqual(names('toulouse-matabiau'), ['Toulouse Matabiau']);
  assert.deepEqual(names('Paris St Lazare'), ['Paris Saint-Lazare']);
  assert.deepEqual(names('Saint-Lazare'), ['Haussmann Saint-Lazare', 'Paris Saint-Lazare']);
  assert.deepEqual(names('Matab'), ['Toulouse Matabiau']);
  assert.deepEqual(names('87611004'), ['Toulouse Matabiau']);
  assert.deepEqual(names('0087611004'), ['Toulouse Matabiau']);
  assert.deepEqual(names(STATION.MATABIAU.toUpperCase()), ['Toulouse Matabiau']);
  assert.deepEqual(names('Nulle part'), []);
  assert.equal(resolveQuery('Marseille-en-Beauvaisis', stations, equipped).noEquipment, true);
  assert.equal(resolveQuery('Nulle part', stations, equipped).noEquipment, false);
});

test('resolution: ten stations at most, the rest is flagged', () => {
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const stations = Array.from({ length: 12 }, (_, n) => ({
    id: id(n),
    name: `Lyon ${n}`,
    uic: [],
  }));
  const equipped = new Map(stations.map((s) => [s.id, 1]));
  const result = resolveQuery('Lyon', stations, equipped);
  assert.equal(result.stations.length, 10);
  assert.equal(result.more, true);
});

test('the equipment query is filtered on the stations, never the whole dataset', () => {
  const url = equipmentUrl([STATION.SAINT_LAZARE, STATION.MATABIAU, '") or ("1"="1']);
  assert.match(url, /\/etat-fonctionnement-elevatique-gare\/exports\/json\?where=/);
  assert.deepEqual(idsOfQuery(url), [STATION.MATABIAU, STATION.SAINT_LAZARE]);
});
