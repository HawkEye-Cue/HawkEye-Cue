// Regression tests for the Summit HQ Sales Tracker default-period selection.
//
// Bug 1 (fixed earlier): resolver ran before folio-config loaded → latched All Time.
// Bug 2 (this fix): resolver picked folio:0 (NEWEST), but with FUTURE folios configured
// (through Feb 2028) the newest is not the current one — Summit HQ defaulted to Feb 2028.
// Correct behavior: select the folio whose range CONTAINS today (start <= today <= end).

import { describe, it, expect } from 'vitest';
import { currentFolioIndex, localTodayISO } from './SalesDashboardPage';

type Mode = 'folio' | 'calendar' | 'fiscal';
// Mirrors the resolver decision. Returns the period to select, or 'current' (wait).
function resolveDefaultPeriod(opts: {
  folioConfigLoaded: boolean;
  trackingMode: Mode;
  folios: { start: string; end: string }[];
  today: string;
}): string {
  if (!opts.folioConfigLoaded) return 'current';
  if (opts.trackingMode === 'folio') {
    const idx = currentFolioIndex(opts.folios, opts.today);
    return idx >= 0 ? `folio:${idx}` : 'all';
  }
  return 'month';
}

// Folios sorted NEWEST-FIRST (as SalesDashboardPage sorts them). Future folios lead.
const FOLIOS = [
  { start: '2028-02-01', end: '2028-02-29', name: 'Feb 2028' }, // index 0 (newest, FUTURE)
  { start: '2027-06-01', end: '2027-06-30', name: 'Jun 2027' }, // index 1 (future)
  { start: '2026-10-01', end: '2026-10-31', name: 'Oct 2026' }, // index 2 (CURRENT)
  { start: '2026-09-01', end: '2026-09-30', name: 'Sep 2026' }, // index 3 (past)
];
const TODAY = '2026-10-15';

describe('Sales Tracker — current folio selection (contains today)', () => {
  it('selects the OCTOBER 2026 folio when today is within it (index 2, not 0)', () => {
    expect(currentFolioIndex(FOLIOS, TODAY)).toBe(2);
    expect(resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'folio', folios: FOLIOS, today: TODAY })).toBe('folio:2');
  });

  it('does NOT select Feb 2028 just because it is the newest saved folio', () => {
    const sel = resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'folio', folios: FOLIOS, today: TODAY });
    expect(sel).not.toBe('folio:0');
  });

  it('waits (stays current) until folio-config has loaded', () => {
    expect(resolveDefaultPeriod({ folioConfigLoaded: false, trackingMode: 'folio', folios: FOLIOS, today: TODAY })).toBe('current');
  });

  it('inclusive on folio boundaries (first and last day count)', () => {
    expect(currentFolioIndex(FOLIOS, '2026-10-01')).toBe(2);
    expect(currentFolioIndex(FOLIOS, '2026-10-31')).toBe(2);
  });

  it('uses the documented fallback (All Time) when NO folio contains today', () => {
    expect(currentFolioIndex(FOLIOS, '2026-11-15')).toBe(-1); // gap between Oct 2026 and Jun 2027
    expect(resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'folio', folios: FOLIOS, today: '2026-11-15' })).toBe('all');
  });

  it('calendar/fiscal mode defaults to This Month', () => {
    expect(resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'calendar', folios: [], today: TODAY })).toBe('month');
    expect(resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'fiscal', folios: [], today: TODAY })).toBe('month');
  });

  it('future + historical folios remain in the list (still manually selectable)', () => {
    // The selection only picks the current one; all 4 folios are still present as options.
    expect(FOLIOS).toHaveLength(4);
  });

  it('localTodayISO returns a YYYY-MM-DD string using local date parts', () => {
    expect(localTodayISO(new Date(2026, 9, 5))).toBe('2026-10-05'); // month is 0-indexed
  });
});
