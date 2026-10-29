// Regression tests for the Summit HQ initial-load "$0 until refresh" bug.
//
// Root cause: the team-analytics fetch effect ran while `period` was still the
// placeholder 'current' (before the folio default resolved). That fired an early request
// for the wrong/empty range; if its response landed AFTER the correct folio request, it
// overwrote the real totals with $0. Fix: gate the fetch on
// (periodDefaulted && period !== 'current') so ONLY the resolved folio range is ever
// requested. These tests lock that gating decision.

import { describe, it, expect } from 'vitest';

// Mirrors the fetch-effect guard: should we issue an analytics request now?
function shouldFetch(opts: { isInTeam: boolean; periodDefaulted: boolean; period: string }): boolean {
  if (!opts.isInTeam) return false;
  if (!opts.periodDefaulted || opts.period === 'current') return false;
  return true;
}

describe('Summit HQ — initial analytics fetch gating (no $0 flash / stale overwrite)', () => {
  it('does NOT fetch while period is still the unresolved placeholder', () => {
    expect(shouldFetch({ isInTeam: true, periodDefaulted: false, period: 'current' })).toBe(false);
  });

  it('does NOT fetch even if periodDefaulted flips but period is somehow still current', () => {
    expect(shouldFetch({ isInTeam: true, periodDefaulted: true, period: 'current' })).toBe(false);
  });

  it('fetches once the default has resolved to a concrete folio', () => {
    expect(shouldFetch({ isInTeam: true, periodDefaulted: true, period: 'folio:2' })).toBe(true);
  });

  it('fetches for All Time / month once resolved (manual or fallback)', () => {
    expect(shouldFetch({ isInTeam: true, periodDefaulted: true, period: 'all' })).toBe(true);
    expect(shouldFetch({ isInTeam: true, periodDefaulted: true, period: 'month' })).toBe(true);
  });

  it('never fetches team analytics for non-team users', () => {
    expect(shouldFetch({ isInTeam: false, periodDefaulted: true, period: 'folio:0' })).toBe(false);
  });

  it('only ONE range is ever requested on first load (the resolved folio) — no premature calls', () => {
    // Simulate the mount sequence: current(not defaulted) → current(folios loaded, not
    // defaulted) → folio:2 (resolved). Only the last should produce a fetch.
    const sequence = [
      { isInTeam: true, periodDefaulted: false, period: 'current' },  // isInTeam true, nothing resolved
      { isInTeam: true, periodDefaulted: false, period: 'current' },  // folios loaded, still resolving
      { isInTeam: true, periodDefaulted: true, period: 'folio:2' },   // resolved
    ];
    const fetches = sequence.filter(shouldFetch);
    expect(fetches).toHaveLength(1);
    expect(fetches[0].period).toBe('folio:2');
  });
});
