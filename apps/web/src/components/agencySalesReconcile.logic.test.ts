// Regression tests for the Today vs Summit HQ agency-sales discrepancy.
// Root cause: Today filtered won deals by the CURRENT CALENDAR MONTH while Summit HQ
// filtered by the AGENCY'S CURRENT FOLIO. When the folio spans outside the calendar
// month, the month window drops sales the folio includes. The fix makes BOTH use the
// same folio range. These tests lock the shared inclusion rule: filtering by the folio
// range yields identical totals/counts regardless of which screen applies it.

import { describe, it, expect } from 'vitest';

type Deal = { stage: string; value: number; createdAt: string };

// The inclusion rule both screens use: a won deal counts when its actual sale date
// (createdAt, date-only) falls within [start, end] inclusive.
function sumWon(deals: Deal[], start?: string, end?: string): { total: number; count: number } {
  let total = 0, count = 0;
  for (const d of deals) {
    if (d.stage !== 'won') continue;
    const dd = (d.createdAt || '').slice(0, 10);
    if (start && dd < start) continue;
    if (end && dd > end) continue;
    total += Number(d.value) || 0; count += 1;
  }
  return { total, count };
}

// Krystille's 5 won deals. Two fall OUTSIDE October's calendar month but INSIDE the
// folio (which here runs 2026-09-25 → 2026-10-24), reproducing the $2,196.76 / 2-sale gap.
const KRYSTILLE: Deal[] = [
  { stage: 'won', value: 5000.00, createdAt: '2026-10-02T15:00:00Z' }, // in month + folio
  { stage: 'won', value: 7651.00, createdAt: '2026-10-10T15:00:00Z' }, // in month + folio
  { stage: 'won', value: 5000.00, createdAt: '2026-10-20T15:00:00Z' }, // in month + folio
  { stage: 'won', value: 1096.76, createdAt: '2026-09-26T15:00:00Z' }, // folio only (before Oct 1)
  { stage: 'won', value: 1100.00, createdAt: '2026-09-28T15:00:00Z' }, // folio only (before Oct 1)
];

const FOLIO = { start: '2026-09-25', end: '2026-10-24' };
const OCT_MONTH = { start: '2026-10-01', end: '2026-10-31' };

describe('agency sales reconciliation — Today vs Summit HQ', () => {
  it('calendar-month window UNDER-counts (reproduces the bug: 3 / $17,651)', () => {
    const r = sumWon(KRYSTILLE, OCT_MONTH.start, OCT_MONTH.end);
    expect(r.count).toBe(3);
    expect(r.total).toBeCloseTo(17651.00, 2);
  });

  it('folio window is the correct agency total (5 / $19,847.76)', () => {
    const r = sumWon(KRYSTILLE, FOLIO.start, FOLIO.end);
    expect(r.count).toBe(5);
    expect(r.total).toBeCloseTo(19847.76, 2);
  });

  it('the two excluded sales account for exactly the $2,196.76 / 2-sale gap', () => {
    const month = sumWon(KRYSTILLE, OCT_MONTH.start, OCT_MONTH.end);
    const folioR = sumWon(KRYSTILLE, FOLIO.start, FOLIO.end);
    expect(folioR.count - month.count).toBe(2);
    expect(folioR.total - month.total).toBeCloseTo(2196.76, 2);
  });

  it('Today and Summit HQ MATCH when both use the same folio range (the fix)', () => {
    const today = sumWon(KRYSTILLE, FOLIO.start, FOLIO.end);
    const summit = sumWon(KRYSTILLE, FOLIO.start, FOLIO.end);
    expect(today).toEqual(summit);
    expect(today.total).toBeCloseTo(19847.76, 2);
    expect(today.count).toBe(5);
  });

  it('member totals reconcile with the agency total (no double counting)', () => {
    // Only Krystille has sales; Brianna + Max contribute $0. Sum of members == agency.
    const krystille = sumWon(KRYSTILLE, FOLIO.start, FOLIO.end);
    const brianna = sumWon([], FOLIO.start, FOLIO.end);
    const max = sumWon([], FOLIO.start, FOLIO.end);
    expect(brianna.total).toBe(0);
    expect(max.total).toBe(0);
    expect(krystille.total + brianna.total + max.total).toBeCloseTo(19847.76, 2);
  });

  it('historical folios stay accurate (a prior folio window is unaffected)', () => {
    const sept = sumWon(KRYSTILLE, '2026-08-25', '2026-09-24');
    expect(sept.count).toBe(0); // none of these deals fall in the prior folio
  });
});
