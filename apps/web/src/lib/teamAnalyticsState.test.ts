// Logic tests for the shared team-sales dashboard helpers. These encode the core of the
// "$0" bug fix: a 402/SUMMIT_INACTIVE must map to 'summit_inactive' (never a silent $0),
// any other failure maps to 'error', and a SUCCESS — even a genuine $0 total — maps to
// 'ok'. Also: both dashboards must resolve the folio window identically.

import { describe, it, expect } from 'vitest';
import {
  isSummitInactiveError,
  mapAnalyticsOutcome,
  resolveFolioWindow,
} from './teamAnalyticsState';

// Mirror the shape ApiClient throws (ApiError { status, code }).
function apiError(status: number, code: string) {
  return { name: 'ApiError', status, code, message: `status ${status}` };
}

describe('isSummitInactiveError', () => {
  it('true for HTTP 402', () => {
    expect(isSummitInactiveError(apiError(402, 'SUMMIT_INACTIVE'))).toBe(true);
  });
  it('true when code is SUMMIT_INACTIVE even without a 402 status', () => {
    expect(isSummitInactiveError({ code: 'SUMMIT_INACTIVE' })).toBe(true);
  });
  it('false for other API errors (403/404/500)', () => {
    expect(isSummitInactiveError(apiError(403, 'NOT_ADMIN'))).toBe(false);
    expect(isSummitInactiveError(apiError(404, 'TEAM_NOT_FOUND'))).toBe(false);
    expect(isSummitInactiveError(apiError(500, 'INTERNAL_ERROR'))).toBe(false);
  });
  it('false for a plain Error or null', () => {
    expect(isSummitInactiveError(new Error('network'))).toBe(false);
    expect(isSummitInactiveError(null)).toBe(false);
  });
});

describe('mapAnalyticsOutcome — a genuine $0 is ok, not an error', () => {
  it('success maps to ok (even though the payload could be a $0 total)', () => {
    expect(mapAnalyticsOutcome({ ok: true })).toBe('ok');
  });
  it('402 / SUMMIT_INACTIVE maps to summit_inactive (NOT $0)', () => {
    expect(mapAnalyticsOutcome({ ok: false, error: apiError(402, 'SUMMIT_INACTIVE') })).toBe('summit_inactive');
  });
  it('any other throw maps to error', () => {
    expect(mapAnalyticsOutcome({ ok: false, error: apiError(500, 'INTERNAL_ERROR') })).toBe('error');
    expect(mapAnalyticsOutcome({ ok: false, error: new Error('boom') })).toBe('error');
  });
});

describe('resolveFolioWindow — consistent window for BOTH dashboards', () => {
  it('uses the configured folio when folioStart/folioEnd are present', () => {
    const win = resolveFolioWindow({ folioStart: '2026-11-01', folioEnd: '2026-11-30', folioName: 'Nov Folio' });
    expect(win).toEqual({ start: '2026-11-01', end: '2026-11-30', name: 'Nov Folio' });
  });

  it('defaults name to "Current Folio" when the config has no name', () => {
    const win = resolveFolioWindow({ folioStart: '2026-11-01', folioEnd: '2026-11-30' });
    expect(win.start).toBe('2026-11-01');
    expect(win.end).toBe('2026-11-30');
    expect(win.name).toBe('Current Folio');
  });

  it('falls back to the current calendar month when no folio config', () => {
    const now = new Date(2026, 10, 15); // Nov 15 2026 (month index 10)
    const win = resolveFolioWindow(null, now);
    expect(win.start).toBe('2026-11-01');
    expect(win.end).toBe('2026-11-30');
  });

  it('is DETERMINISTIC: both surfaces passing the same config get the same window', () => {
    const cfg = { folioStart: '2026-11-01', folioEnd: '2026-11-30', folioName: 'Nov Folio' };
    const summitHq = resolveFolioWindow(cfg);
    const todayCard = resolveFolioWindow(cfg);
    expect(summitHq).toEqual(todayCard);
  });

  it('calendar-month fallback is also identical across surfaces (same clock)', () => {
    const now = new Date(2026, 10, 1);
    expect(resolveFolioWindow(null, now)).toEqual(resolveFolioWindow(undefined, now));
  });
});
