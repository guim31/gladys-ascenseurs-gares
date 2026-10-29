// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// - summary: the state of the lifts and escalators of the followed stations
//   (all of them, or the ones picked), as numbers for a "Continue only if"
//   step and as a sentence ready for a message or a speaker ("Toulouse
//   Matabiau : 1 équipement sur 25 en panne (Ascenseur - Voie A).").
//
// A scene action does not receive the user's language: the sentence follows
// the `language` of the configuration. Outputs are numbers, never booleans:
// the core's "Continue only if" compares with ===.
// -----------------------------------------------------------------------------

import { counts } from './devices.js';
import { TEXT, say } from './messages.js';
import { STATES } from './sncf.js';

export class SceneError extends Error {}

const chosenIds = (value) =>
  (Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean);

export const SCENE_ACTIONS = {
  async summary(service, { fields }) {
    const language = service.config.language;
    // Asked right at start: the first reading, not "not known yet".
    await service.firstReading();
    const watched = service.watched().map((entry) => entry.deviceId);
    if (watched.length === 0) {
      throw new SceneError(say(TEXT, language, 'noStation'));
    }
    const picked = chosenIds(fields?.stations);
    const chosen = picked.filter((id) => watched.includes(id));
    if (picked.length > 0 && chosen.length === 0) {
      throw new SceneError(say(TEXT, language, 'gone'));
    }
    const totals = { total: 0, ko: 0, unknown: 0 };
    const sentences = [];
    for (const deviceId of chosen.length > 0 ? chosen : watched) {
      const { name, equipment } = service.lookup(deviceId);
      if (!equipment || equipment.length === 0) {
        sentences.push(say(TEXT, language, 'noData', { name }));
        continue;
      }
      const count = counts(equipment);
      totals.total += count.total;
      totals.ko += count.ko;
      totals.unknown += count.unknown;
      const labels = equipment.filter((e) => e.state === STATES.KO).map((e) => e.label);
      sentences.push(say(TEXT, language, 'sentence', { name, ...count, labels }));
    }
    return {
      sentence: sentences.join(' '),
      out_of_order: totals.ko,
      unknown: totals.unknown,
      total: totals.total,
      all_ok: totals.total > 0 && totals.ko === 0 && totals.unknown === 0 ? 1 : 0,
    };
  },
};
