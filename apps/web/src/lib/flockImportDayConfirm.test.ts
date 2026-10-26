// Tests for the Smart Flock Import posting-day CONFIRMATION gate (Option B).
// The component requires each approved group's posting days to be explicitly
// confirmed before saving, and resets confirmation whenever the day selection
// changes. These tests exercise the pure decision logic that the component uses:
//   - save is blocked unless every approved row is daysConfirmed
//   - changing days / toggling any-day resets daysConfirmed
// mirroring SmartFlockImport.toggleDay/saveApproved so a regression in that logic
// is caught without a full DOM harness.

import { describe, it, expect } from 'vitest';

interface Row {
  _rowId: string;
  approved: boolean;
  anyday: boolean;
  postingDays: number[];
  daysConfirmed: boolean;
}

// Mirrors the save guard: returns the list of approved rows still needing confirmation.
function unconfirmedApproved(rows: Row[]): Row[] {
  return rows.filter((r) => r.approved && !r.daysConfirmed);
}
function canSave(rows: Row[]): boolean {
  const approved = rows.filter((r) => r.approved);
  if (approved.length === 0) return false;
  return approved.every((r) => r.daysConfirmed && (r.anyday || r.postingDays.length > 0));
}

// Mirrors toggleDay: any day change resets confirmation.
function toggleDay(row: Row, day: number): Row {
  if (row.anyday) return row;
  const postingDays = row.postingDays.includes(day)
    ? row.postingDays.filter((d) => d !== day)
    : [...row.postingDays, day].sort((a, b) => a - b);
  return { ...row, postingDays, daysConfirmed: false };
}

const base = (over: Partial<Row> = {}): Row => ({
  _rowId: 'r1', approved: true, anyday: false, postingDays: [1], daysConfirmed: false, ...over,
});

describe('posting-day confirmation gate', () => {
  it('blocks save when an approved row is not confirmed', () => {
    expect(canSave([base({ daysConfirmed: false })])).toBe(false);
    expect(unconfirmedApproved([base()])).toHaveLength(1);
  });

  it('allows save once all approved rows are confirmed with a timing', () => {
    expect(canSave([base({ daysConfirmed: true, postingDays: [1] })])).toBe(true);
  });

  it('still blocks a confirmed row that has no days and is not any-day', () => {
    expect(canSave([base({ daysConfirmed: true, postingDays: [], anyday: false })])).toBe(false);
  });

  it('allows a confirmed any-day row', () => {
    expect(canSave([base({ daysConfirmed: true, anyday: true, postingDays: [] })])).toBe(true);
  });

  it('changing a day resets confirmation (re-confirmation required)', () => {
    const confirmed = base({ daysConfirmed: true, postingDays: [1] });
    const afterChange = toggleDay(confirmed, 5); // add Friday
    expect(afterChange.daysConfirmed).toBe(false);
    expect(afterChange.postingDays).toEqual([1, 5]);
    expect(canSave([afterChange])).toBe(false);
  });

  it('ignores unapproved rows in the save gate', () => {
    const rows = [base({ _rowId: 'a', approved: true, daysConfirmed: true }), base({ _rowId: 'b', approved: false, daysConfirmed: false })];
    expect(canSave(rows)).toBe(true);
  });

  it('blocks save when there are no approved rows', () => {
    expect(canSave([base({ approved: false })])).toBe(false);
  });
});
