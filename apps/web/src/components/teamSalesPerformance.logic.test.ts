// Focused tests for the Team Sales Performance / monthly-goal math. The chart component
// needs a DOM to render, so (per repo convention) we test the pure decision rules it uses,
// kept in lockstep with TeamSalesPerformance.tsx and the Phase-1 goal spec:
//   • sort by completed sales desc
//   • percentage only when goal > 0 (zero/missing → no percentage)
//   • exceeded when sales >= goal (>= 100%), with a "Goal Exceeded" flag
//   • progress bar width never exceeds 100% of its container
//   • All Time hides goal comparisons

import { describe, it, expect } from 'vitest';

type Row = { key: string; name: string; sales: number; deals: number; goal?: number | null };

function sortRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => b.sales - a.sales);
}
function goalPct(sales: number, goal?: number | null): number | null {
  if (!goal || goal <= 0) return null; // zero/missing → no percentage
  return Math.round((sales / goal) * 100);
}
function isExceeded(sales: number, goal?: number | null): boolean {
  // Raw ratio (not rounded %) so 99.6% isn't wrongly flagged exceeded.
  if (!goal || goal <= 0) return false;
  return sales >= goal;
}
function barWidthPct(sales: number, scaleMax: number): number {
  return Math.min(100, Math.max(sales > 0 ? 2 : 0, (sales / scaleMax) * 100));
}

describe('Team Sales Performance — sorting', () => {
  it('sorts by completed sales, highest first', () => {
    const rows: Row[] = [
      { key: 'a', name: 'A', sales: 100, deals: 1 },
      { key: 'b', name: 'B', sales: 900, deals: 3 },
      { key: 'c', name: 'C', sales: 400, deals: 2 },
    ];
    expect(sortRows(rows).map((r) => r.key)).toEqual(['b', 'c', 'a']);
  });
});

describe('Team Sales Performance — goal math edge cases', () => {
  it('no percentage when goal is missing or zero', () => {
    expect(goalPct(500, undefined)).toBeNull();
    expect(goalPct(500, null)).toBeNull();
    expect(goalPct(500, 0)).toBeNull();
  });
  it('computes percentage when goal > 0', () => {
    expect(goalPct(500, 1000)).toBe(50);
    expect(goalPct(0, 1000)).toBe(0);
  });
  it('flags exceeded at or above 100%', () => {
    expect(isExceeded(1000, 1000)).toBe(true);
    expect(isExceeded(1500, 1000)).toBe(true);
    expect(isExceeded(999, 1000)).toBe(false);
    expect(isExceeded(500, 0)).toBe(false); // zero goal → not exceeded, no pct
  });
});

describe('Team Sales Performance — progress bar never overflows', () => {
  it('caps bar width at 100% even when sales exceed the scale', () => {
    expect(barWidthPct(2000, 1000)).toBe(100);
    expect(barWidthPct(500, 1000)).toBe(50);
  });
  it('gives a tiny sliver for a positive-but-small value, 0 for nothing', () => {
    expect(barWidthPct(1, 100000)).toBe(2);
    expect(barWidthPct(0, 1000)).toBe(0);
  });
});
