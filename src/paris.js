// -----------------------------------------------------------------------------
// The street lifts and escalators of the City of Paris (opendata.paris.fr,
// Opendatasoft Explore v2.1, no account, no key):
//
//   ascenseurs-escalators-tele-surveillance-temps-reel
//       the lifts, escalators and platform lifts of the public streets
//       (parks, viaducts, Petite Ceinture…), ~35 records, with the state the
//       remote monitoring reports ("En fonctionnement" / "En panne") and the
//       time of the last change. The equipment not remotely monitored
//       ("Non télé-surveillé") never has a state: left out.
//
// The whole dataset is one small request (~10 kB): read at every cycle when
// at least one district is chosen. One Gladys device per district
// ("Paris 13e"), the same features as a station.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { HttpError, getJson } from './http.js';
import { STATES } from './sncf.js';

export const PARIS_URL =
  'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/ascenseurs-escalators-tele-surveillance-temps-reel/exports/json?select=identifiant%2Cnom_equipement%2Carrondissement%2Cadresse%2Cequipement%2Cequipement_telesurveille%2Cstatut';

// Device type of a district, and the site ids the service uses for it
// ("paris-13"), next to the station UUIDs of SNCF.
const logger = createLogger({ name: 'ascenseurs-gares' });

export const PARIS_TYPE = 'paris';
export const DISTRICTS = Array.from({ length: 20 }, (_, i) => String(i + 1));
const SITE = /^paris-([1-9]|1[0-9]|20)$/;

export const isDistrict = (value) => DISTRICTS.includes(String(value ?? ''));
export const isParisSite = (value) => SITE.test(String(value ?? ''));
export const parisSite = (district) => `paris-${Number(district)}`;
export const districtOf = (site) => SITE.exec(String(site ?? ''))?.[1] ?? null;

/** "Paris 1er", "Paris 13e": the usual name of a district, never translated. */
export const districtName = (district) =>
  `Paris ${Number(district)}${Number(district) === 1 ? 'er' : 'e'}`;

/** Lowercase, no accents, single spaces. */
const plain = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

/**
 * "ok", "ko" or "unknown" from "En fonctionnement" / "En panne", and the
 * likely variants ("En panne - intervention", "Hors service", "A l'arrêt").
 */
export function parisStateOf(value) {
  const text = plain(value);
  if (text.startsWith('en fonctionnement')) {
    return STATES.OK;
  }
  return /^(en panne|hors service|a l'arret|arret)/.test(text) ? STATES.KO : STATES.UNKNOWN;
}

/** The district of a record: "13", "13e", "1er" or a postcode "75013". */
export function districtOfRecord(value) {
  let n = Number(/\d+/.exec(String(value ?? ''))?.[0]);
  if (n >= 75001 && n <= 75020) {
    n -= 75000;
  }
  return isDistrict(n) ? String(n) : null;
}

const SEVERITY = { [STATES.KO]: 2, [STATES.UNKNOWN]: 1, [STATES.OK]: 0 };
const unrecognised = new Set();

/** The kind of an equipment from its name ("ASCENSEUR…", "ESCALIER…", "EPMR…" a platform lift). */
export function parisKindOf(name) {
  const text = String(name ?? '')
    .trim()
    .toUpperCase();
  if (text.startsWith('ASC') || text.startsWith('EPMR')) {
    return 'elevator';
  }
  return text.startsWith('ESC') ? 'escalator' : 'other';
}

const KIND_LABELS = { elevator: 'Ascenseur', escalator: 'Escalator', other: 'Équipement' };
const LOWER = new Set([
  'rue',
  'avenue',
  'boulevard',
  'quai',
  'place',
  'square',
  'passage',
  'impasse',
  'allee',
  'allée',
  'villa',
  'cours',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'et',
  'sur',
  'aux',
  'au',
]);

/** "66 AVENUE D'IVRY/RUE DU DISQUE" → "66 avenue d'Ivry/rue du Disque". */
export function prettyPlace(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[\p{L}]+/gu, (word, offset, all) => {
      const elided = /^[dl]$/.test(word) && all[offset + 1] === "'";
      if (elided || (LOWER.has(word) && offset > 0)) {
        return word;
      }
      return word[0].toUpperCase() + word.slice(1);
    });
}

/**
 * The remotely monitored equipment of the chosen districts: Map site id →
 * `{ id, label, location, kind, state }[]`, sorted by label. A district
 * chosen without any record is in the map with an empty list.
 * @param {typeof fetch} fetchImpl
 * @param {string[]} sites "paris-13"…
 */
export async function readParis(fetchImpl, sites) {
  const result = new Map(sites.filter(isParisSite).map((site) => [site, []]));
  if (result.size === 0) {
    return result;
  }
  const records = await getJson(fetchImpl, PARIS_URL, { maxBytes: 2e6 });
  if (!Array.isArray(records) || records.length === 0) {
    throw new HttpError('opendata.paris.fr: empty answer');
  }
  const seen = new Map(); // site → Map id → item
  for (const record of records) {
    const district = districtOfRecord(record?.arrondissement);
    const site = district ? parisSite(district) : null;
    const id = String(record?.identifiant ?? '').trim();
    const flag = plain(record?.equipement_telesurveille);
    const status = plain(record?.statut);
    // Not monitored: no state, ever. A missing flag with a state is monitored.
    const monitored = flag
      ? flag === 'tele-surveille'
      : Boolean(status) && !status.startsWith('non tele');
    if (!result.has(site) || !/^[\w-]{1,40}$/.test(id) || !monitored) {
      continue;
    }
    const state = parisStateOf(record.statut);
    if (state === STATES.UNKNOWN && !unrecognised.has(status)) {
      unrecognised.add(status);
      logger.debug(`Paris: unrecognised statut "${status}"`);
    }
    // The same identifiant twice would give two features with one external
    // id: kept once, with the worst state.
    const known = seen.get(site) ?? new Map();
    seen.set(site, known);
    const twin = known.get(id.toLowerCase());
    if (twin) {
      if (SEVERITY[state] > SEVERITY[twin.state]) {
        twin.state = state;
      }
      continue;
    }
    const kind = parisKindOf(record.nom_equipement);
    const address = prettyPlace(record.adresse);
    // Two lifts at one address are "12804_A" and "12804_B".
    const suffix = /_([A-Z0-9])$/i.exec(id)?.[1]?.toUpperCase();
    const place = address || id;
    const item = {
      id: id.toLowerCase(),
      label: `${KIND_LABELS[kind]} - ${place}${suffix ? ` (${suffix})` : ''}`,
      location: prettyPlace(record.equipement) || districtName(district),
      kind,
      state,
    };
    known.set(item.id, item);
    result.get(site).push(item);
  }
  for (const list of result.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label, 'fr') || a.id.localeCompare(b.id));
  }
  return result;
}
