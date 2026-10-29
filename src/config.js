// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

import { DISTRICTS } from './paris.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Seconds between two readings of the portal. SNCF recomputes the states
// every hour: ten minutes is enough to see a change soon after it is
// published. The integration drives its own timer (devices are published
// with should_poll: false, the core only polls up to one minute).
export const REFRESH_INTERVALS = ['600', '900', '1800'];

export const MAX_STATIONS = 10;

export const DEFAULT_CONFIG = {
  stations: '',
  paris_districts: [],
  language: 'fr',
  refresh_interval: '900',
};

/** The station names typed: one per line, or separated by ";" or ",". */
export function stationQueries(value) {
  const text = Array.isArray(value) ? value.join('\n') : String(value ?? '');
  const seen = new Set();
  const queries = [];
  for (const part of text.split(/[\n;,]+/)) {
    const query = part.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (query && !seen.has(query.toLowerCase())) {
      seen.add(query.toLowerCase());
      queries.push(query);
    }
  }
  return queries.slice(0, MAX_STATIONS);
}

/**
 * The districts of Paris chosen (multi_select): "1" to "20", sorted, without
 * duplicates. An array, or (a value stored as text) a JSON array or a list.
 */
export function districtChoices(value) {
  let list = value;
  if (!Array.isArray(list)) {
    const text = String(value ?? '').trim();
    try {
      list = text.startsWith('[') ? JSON.parse(text) : text.split(/[\s;,]+/);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) {
    return [];
  }
  const chosen = new Set(
    list.map((item) => String(Number(item))).filter((d) => DISTRICTS.includes(d)),
  );
  return DISTRICTS.filter((district) => chosen.has(district));
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const interval = REFRESH_INTERVALS.includes(String(source.refresh_interval))
    ? String(source.refresh_interval)
    : DEFAULT_CONFIG.refresh_interval;
  return {
    stations: stationQueries(source.stations),
    parisDistricts: districtChoices(source.paris_districts),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
    refreshSeconds: Number(interval),
  };
}
