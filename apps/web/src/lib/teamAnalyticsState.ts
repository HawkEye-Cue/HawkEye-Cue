// Pure helpers for team-sales dashboards so Summit HQ (TeamPage) and the Today card
// (YourSalesThisMonth) behave IDENTICALLY — the root cause of the "$0" bug was each
// surface silently swallowing a 402 and rendering a null/0 total. These helpers make the
// outcome explicit and the folio window resolution shared, with no side effects.

// Explicit analytics outcome the dashboards render distinct UI for. A genuine $0 total is
// 'ok' — NOT 'error'/null — so a real zero never looks like a failure, and a gated/lapsed
// team shows a reactivation prompt instead of a misleading $0.
export type AnalyticsState = 'idle' | 'loading' | 'ok' | 'summit_inactive' | 'error';

// ApiClient throws an ApiError carrying { status, code }. A 402 OR a SUMMIT_INACTIVE code
// means the team's Summit subscription is not active (owner's sub lapsed / not entitled).
export function isSummitInactiveError(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  const code = (e as { code?: string } | null)?.code;
  return status === 402 || code === 'SUMMIT_INACTIVE';
}

// Map a fetch outcome to an AnalyticsState.
//   • success (any value, including a genuine $0)      → 'ok'
//   • 402 / SUMMIT_INACTIVE                            → 'summit_inactive'
//   • any other throw / non-2xx                        → 'error'
// `ok` is passed as true on success; on failure pass the caught error so the 402 can be
// distinguished from a generic error.
export function mapAnalyticsOutcome(result: { ok: true } | { ok: false; error: unknown }): AnalyticsState {
  if (result.ok) return 'ok';
  return isSummitInactiveError(result.error) ? 'summit_inactive' : 'error';
}

export interface FolioWindow {
  start: string;
  end: string;
  name: string;
}

// A raw folio config as returned by GET /sales/folio-config (fields optional).
export interface FolioConfigLike {
  folioStart?: string | null;
  folioEnd?: string | null;
  folioName?: string | null;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function calendarMonthName(now: Date): string {
  return now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// Resolve the current folio window IDENTICALLY for both surfaces: prefer the configured
// folio (folio-config); otherwise fall back to the current calendar month. This is the
// client-side window both dashboards pass as folioStart/folioEnd to /team/analytics so
// their totals match. Server-side folio math is unchanged.
export function resolveFolioWindow(cfg: FolioConfigLike | null | undefined, now: Date = new Date()): FolioWindow {
  if (cfg && cfg.folioStart && cfg.folioEnd) {
    return {
      start: cfg.folioStart,
      end: cfg.folioEnd,
      name: (cfg.folioName || 'Current Folio').trim() || 'Current Folio',
    };
  }
  const start = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { start, end, name: calendarMonthName(now) };
}
