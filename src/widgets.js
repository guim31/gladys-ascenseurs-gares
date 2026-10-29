// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+).
//
// - station: the lifts and escalators of one followed station (or district
//   of Paris), one status
//   row each ("Ascenseur - Voie A" / "en panne"), out of order first (red),
//   then unknown (grey), then in service (green). Ten rows at most, the
//   others counted in a text line, replaced by a warning when the data is
//   hours old. A setting hides the equipment in service.
//
// Budget of the core: 8 components, 2 texts, 1 status (10 rows).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { clip } from './devices.js';
import { TEXT, say } from './messages.js';
import { isParisSite } from './paris.js';
import { STATES } from './sncf.js';

export const MAX_ROWS = 10;
const MAX_LABEL = 40;

const ORDER = { [STATES.KO]: 0, [STATES.UNKNOWN]: 1, [STATES.OK]: 2 };
const COLORS = {
  [STATES.KO]: WIDGET_COLORS.DANGER,
  [STATES.UNKNOWN]: WIDGET_COLORS.NEUTRAL,
  [STATES.OK]: WIDGET_COLORS.SUCCESS,
};

const staleKey = (siteId) => (isParisSite(siteId) ? 'staleParis' : 'stale');
const isOn = (value) => value === true || value === 'true' || value === 1;

async function stationContent(service, { settings, language }) {
  await service.firstReading();
  const ttl = Math.max(60, Math.min(900, service.config.refreshSeconds));
  const text = (key, params) => ({
    ttl_seconds: ttl,
    components: [{ type: 'text', text: say(TEXT, language, key, params) }],
  });
  const watched = service.watched();
  const picked = settings?.station ? String(settings.station) : null;
  const entry = picked ? watched.find((w) => w.deviceId === picked) : watched[0];
  if (!entry) {
    return text(picked ? 'gone' : 'pickStation');
  }
  const { equipment } = service.lookup(entry.deviceId);
  if (!equipment || equipment.length === 0) {
    return text('waiting');
  }
  const sorted = [...equipment].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const candidates = isOn(settings?.only_problems)
    ? sorted.filter((item) => item.state !== STATES.OK)
    : sorted;
  if (candidates.length === 0) {
    return text(service.isStale(entry.stationId) ? staleKey(entry.stationId) : 'allOk');
  }
  const shown = candidates.slice(0, MAX_ROWS);
  const components = [
    {
      type: 'status',
      items: shown.map((item) => ({
        label: clip(item.label, MAX_LABEL),
        value: say(TEXT, language, item.state),
        color: COLORS[item.state],
      })),
    },
  ];
  // One body text per card: the age of the data matters more than the count.
  if (service.isStale(entry.stationId)) {
    components.push({ type: 'text', text: say(TEXT, language, staleKey(entry.stationId)) });
  } else if (candidates.length > shown.length) {
    const left = candidates.length - shown.length;
    components.push({ type: 'text', text: say(TEXT, language, 'more', { count: left }) });
  }
  return { ttl_seconds: ttl, components };
}

export const WIDGETS = {
  station: { get: stationContent },
};
