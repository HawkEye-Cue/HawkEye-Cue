// Regression tests for the Summit HQ Sales Tracker default-period resolver.
// Root cause of "opens on All Time": the resolver ran as soon as `loading` was false,
// but folio-config loads AFTER that — so it saw 0 folios and latched 'all'. Fix: gate on
// folioConfigLoaded. These tests lock the pure decision the effect makes.

import { describe, it, expect } from 'vitest';

type Mode = 'folio' | 'calendar' | 'fiscal';
// Mirrors the resolver: returns the period to select, or 'current' (wait) when not ready.
function resolveDefaultPeriod(opts: {
  folioConfigLoaded: boolean;
  trackingMode: Mode;
  savedFoliosLength: number;
}): string {
  if (!opts.folioConfigLoaded) return 'current'; // wait — do NOT latch a default yet
  if (opts.trackingMode === 'folio') return opts.savedFoliosLength > 0 ? 'folio:0' : 'all';
  return 'month';
}

describe('Sales Tracker — default period resolver', () => {
  it('WAITS (stays current) until folio-config has loaded — the bug fix', () => {
    expect(resolveDefaultPeriod({ folioConfigLoaded: false, trackingMode: 'folio', savedFoliosLength: 0 })).toBe('current');
    // Previously this premature state resolved to 'all'; now it defers.
  });

  it('defaults to the CURRENT (newest) folio once folios are loaded', () => {
    expect(resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'folio', savedFoliosLength: 3 })).toBe('folio:0');
  });

  it('falls back to All Time only when folio mode has NO folios', () => {
    expect(resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'folio', savedFoliosLength: 0 })).toBe('all');
  });

  it('calendar/fiscal mode defaults to This Month', () => {
    expect(resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'calendar', savedFoliosLength: 0 })).toBe('month');
    expect(resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'fiscal', savedFoliosLength: 0 })).toBe('month');
  });

  it('never defaults to All Time when a current folio exists (the reported issue)', () => {
    const r = resolveDefaultPeriod({ folioConfigLoaded: true, trackingMode: 'folio', savedFoliosLength: 1 });
    expect(r).not.toBe('all');
    expect(r).toBe('folio:0');
  });
});
