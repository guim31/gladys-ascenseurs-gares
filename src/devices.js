// -----------------------------------------------------------------------------
// The Gladys device of a station and its states:
//   out_of_order    counter-sensor/integer  equipment out of order
//   unknown         counter-sensor/integer  equipment whose state SNCF does
//                                           not know right now
//   all_ok          input/binary            1 = every equipment in service
//   eq-<uuid>       input/binary            one per lift, escalator or moving
//                                           walkway: 1 = in service,
//                                           0 = out of order
//
// The equipment features are named after the SNCF label ("Ascenseur - 11
// Sortie Londres"), which is a place name: never translated. An equipment
// whose state is unknown gets no state (the last known one stays, the
// "unknown" counter says it).
//
// Read-only, no polling: the integration reads the portal on its own timer
// (src/service.js), Gladys never polls (`should_poll: false`).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
} from '@gladysassistant/integration-sdk';
import { NAMES } from './messages.js';
import { STATES } from './sncf.js';

export const STATION_TYPE = 'station';
export const MAX_DEVICE_NAME = 80;
export const MAX_FEATURE_NAME = 100;
export const SUMMARY_KEYS = ['out_of_order', 'unknown', 'all_ok'];

/** Shortens a text to `max` characters, with an ellipsis. */
export function clip(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** The feature key of an equipment. */
export const equipmentKey = (equipment) => `eq-${equipment.id}`;

/** Display bound of the counters: the number of equipment rounded up to ten. */
export const countMax = (count) => Math.max(10, Math.ceil((count ?? 0) / 10) * 10);

/** The device name of a station: "Toulouse Matabiau · ascenseurs et escalators". */
export const stationDeviceName = (name, language) =>
  clip(`${name} · ${(NAMES[language] ?? NAMES.en).device}`, MAX_DEVICE_NAME);

/**
 * The feature names of the equipment of a station: their SNCF label, made
 * unique on the device ("… (2)") since two equipment may share one.
 * @returns {Map<string, string>} equipment id → name
 */
export function equipmentNames(equipment) {
  const names = new Map();
  const used = new Set();
  for (const item of equipment) {
    const base = clip(item.label, MAX_FEATURE_NAME - 4);
    let name = base;
    for (let n = 2; used.has(name); n += 1) {
      name = `${base} (${n})`;
    }
    used.add(name);
    names.set(item.id, name);
  }
  return names;
}

/**
 * The device of a station.
 * @param {object} gladys
 * @param {{ id: string, name: string }} station
 * @param {object[]} equipment from readEquipment
 * @param {string} language
 */
export function buildStationDevice(gladys, station, equipment, language) {
  const ids = gladys.externalIds(STATION_TYPE, station.id);
  const names = NAMES[language] ?? NAMES.en;
  const max = countMax(equipment.length);
  const binary = { category: C.INPUT, type: T.SENSOR.BINARY, min: 0, max: 1 };
  const counter = { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max };
  const labels = equipmentNames(equipment);
  const features = [
    { key: 'out_of_order', name: names.out_of_order, ...counter },
    { key: 'unknown', name: names.unknown, ...counter },
    { key: 'all_ok', name: names.all_ok, ...binary },
    ...equipment.map((item) => ({ key: equipmentKey(item), name: labels.get(item.id), ...binary })),
  ];
  return {
    name: stationDeviceName(station.name, language),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: 'station_id', value: station.id }],
    features: features.map(({ key, ...feature }) => ({
      ...feature,
      external_id: ids.feature(key),
      read_only: true,
      has_feedback: false,
    })),
  };
}

/** The counts of a station: `{ total, ok, ko, unknown }`. */
export function counts(equipment) {
  const result = { total: equipment.length, ok: 0, ko: 0, unknown: 0 };
  for (const item of equipment) {
    if (item.state === STATES.OK) {
      result.ok += 1;
    } else if (item.state === STATES.KO) {
      result.ko += 1;
    } else {
      result.unknown += 1;
    }
  }
  return result;
}

/** The states of a station device. */
export function stationStates(gladys, stationId, equipment) {
  const ids = gladys.externalIds(STATION_TYPE, stationId);
  if (equipment.length === 0) {
    return [];
  }
  const { ok, ko, unknown, total } = counts(equipment);
  const states = [
    { device_feature_external_id: ids.feature('out_of_order'), state: ko },
    { device_feature_external_id: ids.feature('unknown'), state: unknown },
    { device_feature_external_id: ids.feature('all_ok'), state: ok === total ? 1 : 0 },
  ];
  for (const item of equipment) {
    if (item.state !== STATES.UNKNOWN) {
      states.push({
        device_feature_external_id: ids.feature(equipmentKey(item)),
        state: item.state === STATES.OK ? 1 : 0,
      });
    }
  }
  return states;
}
