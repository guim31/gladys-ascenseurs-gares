// -----------------------------------------------------------------------------
// The SNCF open data portal (Opendatasoft Explore v2.1, no account, no key):
//
//   gares-de-voyageurs                 the passenger stations: id, name, UIC
//                                      codes (the names behind `gareid`)
//   etat-fonctionnement-elevatique-gare
//                                      every lift, escalator and moving walkway
//                                      of the stations managed by SNCF Gares &
//                                      Connexions, with its state (OK / KO /
//                                      INCONNU), recomputed every hour
//
// The station list (~2,800 stations, 340 kB) and the list of the stations
// that have equipment (~600) are read once a day, to resolve the names typed
// in the configuration. The states are read with one request per cycle,
// filtered on the stations followed (never the whole dataset).
// -----------------------------------------------------------------------------

import { HttpError, getJson } from './http.js';

export const BASE = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets';
export const STATIONS_URL = `${BASE}/gares-de-voyageurs/exports/json?select=id%2Cnom%2Ccodes_uic`;
export const EQUIPPED_URL = `${BASE}/etat-fonctionnement-elevatique-gare/records?select=gareid%2Ccount(*)%20as%20n&group_by=gareid&limit=-1`;

// The ids of the portal are UUIDs: checked before they go into a query.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isStationId = (value) => UUID.test(String(value ?? ''));

/** The URL of the states of the equipment of some stations (one request). */
export function equipmentUrl(stationIds) {
  const ids = [...new Set(stationIds)].filter(isStationId).sort();
  const where = `gareid in (${ids.map((id) => `"${id}"`).join(',')})`;
  return `${BASE}/etat-fonctionnement-elevatique-gare/exports/json?where=${encodeURIComponent(where)}`;
}

export const STATES = { OK: 'ok', KO: 'ko', UNKNOWN: 'unknown' };

/** "ok", "ko" or "unknown" from the portal's OK / KO / INCONNU (anything else is unknown). */
export function stateOf(value) {
  const text = String(value ?? '')
    .trim()
    .toUpperCase();
  if (text === 'OK') {
    return STATES.OK;
  }
  return text === 'KO' ? STATES.KO : STATES.UNKNOWN;
}

/**
 * The kind of an equipment, from the start of its name ("Ascenseur - …",
 * "ASC.PMR …", "Esc mec - …", "Trottoir roul - …").
 * @returns {'elevator'|'escalator'|'walkway'|'other'}
 */
export function kindOf(label) {
  const text = String(label ?? '')
    .trim()
    .toLowerCase();
  if (text.startsWith('asc')) {
    return 'elevator';
  }
  if (text.startsWith('esc')) {
    return 'escalator';
  }
  return text.startsWith('trottoir') ? 'walkway' : 'other';
}

/** Lowercase, no accents, no punctuation, "st" → "saint": for matching names. */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => ({ st: 'saint', ste: 'sainte' })[word] ?? word)
    .join(' ');
}

/** The passenger stations: `{ id, name, uic: string[] }[]`. */
export async function readStations(fetchImpl) {
  const records = await getJson(fetchImpl, STATIONS_URL, { maxBytes: 5e6 });
  if (!Array.isArray(records)) {
    throw new HttpError('ressources.data.sncf.com: unexpected station list');
  }
  return records
    .filter((record) => isStationId(record?.id) && typeof record.nom === 'string')
    .map((record) => ({
      id: record.id.toLowerCase(),
      name: record.nom.trim(),
      uic: String(record.codes_uic ?? '')
        .split(';')
        .map((code) => code.trim())
        .filter(Boolean),
    }));
}

/** The stations with equipment: Map station id → number of equipment. */
export async function readEquipped(fetchImpl) {
  const document = await getJson(fetchImpl, EQUIPPED_URL, { maxBytes: 2e6 });
  if (!Array.isArray(document?.results)) {
    throw new HttpError('ressources.data.sncf.com: unexpected equipment count');
  }
  return new Map(
    document.results
      .filter((row) => isStationId(row?.gareid))
      .map((row) => [row.gareid.toLowerCase(), Number(row.n) || 0]),
  );
}

/**
 * The equipment of some stations: Map station id → `{ id, label, location,
 * kind, state }[]`, sorted by label. A station of the list without any
 * record is in the map with an empty list.
 */
export async function readEquipment(fetchImpl, stationIds) {
  const ids = [...new Set(stationIds)].filter(isStationId).map((id) => id.toLowerCase());
  const result = new Map(ids.map((id) => [id, []]));
  if (ids.length === 0) {
    return result;
  }
  const records = await getJson(fetchImpl, equipmentUrl(ids), { maxBytes: 5e6 });
  if (!Array.isArray(records)) {
    throw new HttpError('ressources.data.sncf.com: unexpected equipment list');
  }
  for (const record of records) {
    const stationId = String(record?.gareid ?? '').toLowerCase();
    if (!result.has(stationId) || !isStationId(record.id)) {
      continue;
    }
    const label = String(record.libelle ?? '').trim();
    result.get(stationId).push({
      id: record.id.toLowerCase(),
      label: label || record.id,
      location: String(record.localisationdescriptive ?? '').trim(),
      kind: kindOf(label),
      state: stateOf(record.etat_de_fonctionnement),
    });
  }
  for (const list of result.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label, 'fr') || a.id.localeCompare(b.id));
  }
  return result;
}

export const MAX_MATCHES = 10;

/**
 * The stations a name typed by the user stands for.
 *   - a station id (UUID) or a UIC code: that station;
 *   - a name equal to a station's (accents, case, hyphens and "St" ignored):
 *     that station;
 *   - otherwise every station with equipment whose name holds all the words
 *     ("Marseille" → Marseille Saint-Charles, Marseille Blancarde…), 10 at most.
 * @returns {{ query: string, stations: {id: string, name: string}[], more: boolean, noEquipment: boolean }}
 */
export function resolveQuery(query, stations, equipped) {
  const text = String(query ?? '').trim();
  const result = { query: text, stations: [], more: false, noEquipment: false };
  const pick = (list) => {
    const withEquipment = list.filter((station) => equipped.has(station.id));
    result.noEquipment = list.length > 0 && withEquipment.length === 0;
    result.more = withEquipment.length > MAX_MATCHES;
    result.stations = withEquipment.slice(0, MAX_MATCHES).map(({ id, name }) => ({ id, name }));
    return result;
  };
  if (isStationId(text)) {
    const id = text.toLowerCase();
    const station = stations.find((s) => s.id === id) ?? { id, name: text };
    return pick([station]);
  }
  const digits = text.replace(/\s+/g, '');
  if (/^\d{8,10}$/.test(digits)) {
    const uic = digits.slice(-8).padStart(8, '0');
    return pick(stations.filter((s) => s.uic.some((code) => code.slice(-8) === uic)));
  }
  const wanted = normalizeName(text);
  if (!wanted) {
    return result;
  }
  const exact = stations.filter((s) => normalizeName(s.name) === wanted);
  if (exact.length > 0) {
    return pick(exact);
  }
  const words = wanted.split(' ');
  const partial = stations
    .filter((s) => {
      const name = normalizeName(s.name).split(' ');
      return words.every((word) => name.some((part) => part.startsWith(word)));
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return pick(partial);
}
