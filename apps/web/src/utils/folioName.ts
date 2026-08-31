/**
 * Shared folio-name resolution used across the whole app.
 *
 * A user can nickname their current folio (e.g. "September 26 Folio").
 * We persist a map of "folio range string" -> "nickname" in localStorage
 * so that ANY place showing a folio (Sales history, Summit, dropdowns,
 * recap references) can display the friendly name instead of raw dates.
 */

const MAP_KEY = 'hawkeye_folio_names_map';

export interface FolioNameMap {
  [range: string]: string; // "2026-08-19 to 2026-09-18" -> "September 26 Folio"
}

export function getFolioNameMap(): FolioNameMap {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY) || '{}');
  } catch {
    return {};
  }
}

/** Save/associate a nickname with a folio date range. */
export function setFolioName(range: string, name: string) {
  if (!range) return;
  const map = getFolioNameMap();
  if (name && name.trim()) {
    map[range] = name.trim();
  } else {
    delete map[range];
  }
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
}

/** Build the canonical range string for a start/end pair. */
export function folioRange(start?: string, end?: string): string {
  if (!start || !end) return '';
  return `${start} to ${end}`;
}

/**
 * Resolve a folio range string to its display label.
 * Returns the nickname if one exists, otherwise a prettified date range.
 */
export function folioDisplayName(range: string): string {
  if (!range) return 'Current Folio';
  const map = getFolioNameMap();
  if (map[range]) return map[range];
  // Prettify "2026-08-19 to 2026-09-18" -> "Aug 19, 2026 → Sep 18, 2026"
  const parts = range.split(' to ');
  if (parts.length === 2) {
    return `${pretty(parts[0])} → ${pretty(parts[1])}`;
  }
  return range;
}

function pretty(s: string): string {
  if (!s) return '—';
  try {
    const d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
}
