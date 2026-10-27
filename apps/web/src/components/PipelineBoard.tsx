import { useState, useMemo } from 'react';
import type { Opportunity, OpportunityStatus } from '@social-lead-gen/shared';
import { displayCueAuthor } from '@social-lead-gen/shared';

/**
 * PipelineBoard — a CRM-style board + list view layered on top of the EXISTING
 * opportunities data and handlers. It is intentionally additive and reuses the
 * parent's persistence (handleUpdateStatus / moveToClient / openLogSale) and the
 * LeadProfilePopup detail panel via callbacks — no backend change, no new API.
 *
 * STAGE MODEL (no backend migration; see launch review):
 *   Stored status stays one of new | followed_up | converted | dismissed.
 *   The 3 middle CRM columns (CONTACTED / QUOTED / CLOSING) all persist as
 *   status=followed_up and carry a UI-only sub-stage kept in localStorage
 *   (mirrors the existing "perched" pattern). The stored `bucket` field — used
 *   elsewhere for lead-source categories — is left completely untouched.
 *
 *   NEW LEADS  -> status 'new'
 *   CONTACTED  -> status 'followed_up', substage 'contacted' (default)
 *   QUOTED     -> status 'followed_up', substage 'quoted'
 *   CLOSING    -> status 'followed_up', substage 'closing'
 *   CLIENTS    -> status 'converted'
 *
 * dismissed / perched / historical records are preserved and simply not shown in
 * the 5 active columns (never silently deleted — they remain reachable via the
 * existing filters on the page).
 */

export type PipelineStage = 'new' | 'contacted' | 'quoted' | 'closing' | 'clients';

export const STAGES: { key: PipelineStage; label: string; status: OpportunityStatus }[] = [
  { key: 'new', label: 'NEW LEADS', status: 'new' as OpportunityStatus },
  { key: 'contacted', label: 'CONTACTED', status: 'followed_up' as OpportunityStatus },
  { key: 'quoted', label: 'QUOTED', status: 'followed_up' as OpportunityStatus },
  { key: 'closing', label: 'CLOSING', status: 'followed_up' as OpportunityStatus },
  { key: 'clients', label: 'CLIENTS', status: 'converted' as OpportunityStatus },
];

function substageKey(userSub: string | undefined) {
  return `hawkeye_pipeline_substage_${userSub || 'default'}`;
}

/** Read the UI-only sub-stage map { opportunityId: 'contacted'|'quoted'|'closing' }. */
export function readSubstages(userSub: string | undefined): Record<string, PipelineStage> {
  try {
    return JSON.parse(localStorage.getItem(substageKey(userSub)) || '{}');
  } catch {
    return {};
  }
}

export function writeSubstage(userSub: string | undefined, oppId: string, stage: PipelineStage | null) {
  const map = readSubstages(userSub);
  if (stage) map[oppId] = stage;
  else delete map[oppId];
  localStorage.setItem(substageKey(userSub), JSON.stringify(map));
}

/** Resolve which visible column an opportunity belongs to.
 * Server-persisted `pipelineStage` (when the backend field is present) takes
 * precedence over the localStorage fallback, so stages survive across devices as
 * soon as the sandbox backend field ships. Until then, localStorage keeps it working
 * on the current device. */
export function stageForLead(lead: Opportunity, substages: Record<string, PipelineStage>): PipelineStage {
  if (lead.status === 'converted') return 'clients';
  if (lead.status === 'new') return 'new';
  if (lead.status === 'followed_up') {
    const server = (lead as any).pipelineStage as PipelineStage | undefined;
    const s = server || substages[lead.id];
    return s === 'quoted' || s === 'closing' ? s : 'contacted';
  }
  // dismissed or anything else is not an active column; treat as new for safety of display
  return 'new';
}

export interface PipelineBoardProps {
  leads: Opportunity[];
  userSub: string | undefined;
  updatingId: string | null;
  /** Persist a status change (reuses the page's existing handler). */
  onUpdateStatus: (id: string, status: OpportunityStatus) => Promise<void>;
  /** Move to Clients (converted) without logging a sale (reuses existing handler). */
  onMoveToClient: (lead: Opportunity) => Promise<void>;
  /** Open the Log Sale modal for a Client (reuses existing handler). */
  onLogSale: (lead: Opportunity) => void;
  /** Open the detail panel (reuses LeadProfilePopup via the page). */
  onOpenDetail: (lead: Opportunity) => void;
  /** Employee display-name resolver for a lead (optional, Summit teams). */
  employeeNameFor?: (lead: Opportunity) => string | undefined;
  /** When true, this lead already has a logged sale (badge on Client cards). */
  hasLoggedSale?: (lead: Opportunity) => boolean;
  /** Optional employee filter controls (Summit managers). */
  employeeFilter?: {
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
  };
  /** Persist the sub-stage server-side (contacted|quoted|closing|null). When provided,
   * the board writes `pipelineStage` via the opportunities status API so stages sync
   * across devices. No-op/omit until the sandbox backend field is approved + deployed. */
  onPersistStage?: (id: string, stage: PipelineStage | null) => Promise<void> | void;
}

const money = (n: number | null | undefined) =>
  typeof n === 'number' && !isNaN(n) ? `$${n.toLocaleString()}` : null;

/** Move a lead to a target stage, persisting status and sub-stage safely. */
async function applyStageChange(
  props: PipelineBoardProps,
  lead: Opportunity,
  target: PipelineStage,
) {
  const { userSub, onUpdateStatus, onMoveToClient, onPersistStage } = props;
  if (target === 'clients') {
    // Move to Clients does NOT auto-log a sale (explicit action only).
    await onMoveToClient(lead);
    writeSubstage(userSub, lead.id, null);
    await onPersistStage?.(lead.id, null);
    return;
  }
  if (target === 'new') {
    await onUpdateStatus(lead.id, 'new' as OpportunityStatus);
    writeSubstage(userSub, lead.id, null);
    await onPersistStage?.(lead.id, null);
    return;
  }
  // contacted / quoted / closing -> followed_up + sub-stage (local + server when available)
  await onUpdateStatus(lead.id, 'followed_up' as OpportunityStatus);
  writeSubstage(userSub, lead.id, target);
  await onPersistStage?.(lead.id, target);
}

export default function PipelineBoard(props: PipelineBoardProps) {
  const { leads, userSub, updatingId, onLogSale, onOpenDetail, employeeNameFor, hasLoggedSale, employeeFilter } = props;
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'stage'>('name');
  const [dragId, setDragId] = useState<string | null>(null);
  // Local substage state so the board re-renders immediately after a move.
  const [substages, setSubstages] = useState<Record<string, PipelineStage>>(() => readSubstages(userSub));

  // Only active records appear on the board (exclude dismissed — preserved, not shown here).
  const activeLeads = useMemo(
    () => leads.filter((l) => l.status === 'new' || l.status === 'followed_up' || l.status === 'converted'),
    [leads],
  );

  const columns = useMemo(() => {
    const map: Record<PipelineStage, Opportunity[]> = { new: [], contacted: [], quoted: [], closing: [], clients: [] };
    for (const l of activeLeads) map[stageForLead(l, substages)].push(l);
    return map;
  }, [activeLeads, substages]);

  async function move(lead: Opportunity, target: PipelineStage) {
    await applyStageChange(props, lead, target);
    setSubstages(readSubstages(userSub));
  }

  function leadName(lead: Opportunity): string {
    // displayCueAuthor never fabricates a name — pass the author + a safe fallback.
    return displayCueAuthor((lead as any).sourceAuthor, (lead as any).name || 'Unnamed');
  }

  function leadValue(lead: Opportunity): number | null {
    const v = (lead as any).expectedPremium;
    return typeof v === 'number' ? v : (v ? parseFloat(v) : null);
  }

  // ─── List view rows ─────────────────────────────────────────────────────────
  const listRows = useMemo(() => {
    let rows = activeLeads.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((l) =>
        leadName(l).toLowerCase().includes(q) ||
        ((l as any).policyType || '').toLowerCase().includes(q) ||
        (employeeNameFor?.(l) || '').toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      if (sortBy === 'name') return leadName(a).localeCompare(leadName(b));
      if (sortBy === 'value') return (leadValue(b) || 0) - (leadValue(a) || 0);
      return STAGES.findIndex((s) => s.key === stageForLead(a, substages)) - STAGES.findIndex((s) => s.key === stageForLead(b, substages));
    });
    return rows;
  }, [activeLeads, search, sortBy, substages]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {/* Controls: view toggle + employee filter + (list) search/sort */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-black/40 border border-white/10 p-1">
          <button
            onClick={() => setView('board')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'board' ? 'bg-orange-500 text-black' : 'text-slate-300 hover:text-white'}`}
            aria-pressed={view === 'board'}
          >
            Board
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'list' ? 'bg-orange-500 text-black' : 'text-slate-300 hover:text-white'}`}
            aria-pressed={view === 'list'}
          >
            List
          </button>
        </div>

        {employeeFilter && employeeFilter.options.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <span className="sr-only">Filter by employee</span>
            <select
              value={employeeFilter.value}
              onChange={(e) => employeeFilter.onChange(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
            >
              {employeeFilter.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        )}

        {view === 'list' && (
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers…"
              aria-label="Search customers"
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort by"
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
            >
              <option value="name">Sort: Name</option>
              <option value="value">Sort: Value</option>
              <option value="stage">Sort: Stage</option>
            </select>
          </div>
        )}
      </div>

      {view === 'board' ? (
        // Desktop (lg+): all 5 columns fit in a responsive grid — no horizontal scroll.
        // Small screens: horizontal snap-scroll so columns stay readable (not squished).
        <div className="flex lg:grid lg:grid-cols-5 gap-3 overflow-x-auto lg:overflow-visible pb-2 snap-x">
          {STAGES.map((stage) => (
            <div
              key={stage.key}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={async () => {
                if (!dragId) return;
                const lead = activeLeads.find((l) => l.id === dragId);
                setDragId(null);
                if (lead && stageForLead(lead, substages) !== stage.key) await move(lead, stage.key);
              }}
              className="min-w-[240px] w-[240px] lg:min-w-0 lg:w-auto shrink-0 snap-start rounded-xl bg-black/30 border border-white/10 flex flex-col"
            >
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold tracking-wide text-white">{stage.label}</span>
                <span className="text-[11px] text-slate-400 bg-white/5 rounded-full px-2 py-0.5">{columns[stage.key].length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[80px]">
                {columns[stage.key].length === 0 && (
                  <p className="text-[11px] text-slate-600 px-1 py-4 text-center">No customers</p>
                )}
                {columns[stage.key].map((lead) => {
                  const val = money(leadValue(lead));
                  const emp = employeeNameFor?.(lead);
                  const sold = hasLoggedSale?.(lead);
                  return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragId(lead.id)}
                      onClick={() => onOpenDetail(lead)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') onOpenDetail(lead); }}
                      className="group rounded-lg bg-[#1a1a1a] border border-white/10 hover:border-orange-500/40 p-3 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white truncate">{leadName(lead)}</p>
                        {val && <span className="text-xs font-bold text-amber-300 shrink-0">{val}</span>}
                      </div>
                      {(lead as any).policyType && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{(lead as any).policyType}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="text-[11px] text-slate-500 truncate">
                          {(lead as any).sourcePlatform || (lead as any).leadSource || '—'}
                        </span>
                        {emp && <span className="text-[10px] text-slate-300 bg-white/5 rounded px-1.5 py-0.5 shrink-0">{emp}</span>}
                      </div>
                      {/* Log Sale is available on EVERY active stage. Logging a sale records
                          the won deal and auto-converts the prospect to Client (handled by
                          the page's onLogSale flow). Clients that already have a sale show
                          "Log Additional Sale" so multiple legitimate sales are allowed. */}
                      <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                        {stage.key === 'clients' && sold ? (
                          <>
                            <span className="text-[11px] text-green-400">✓ Sale logged</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onLogSale(lead); }}
                              className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold border border-white/15"
                            >
                              Log Additional Sale
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-[11px] text-slate-500">{stage.key === 'clients' ? 'No sale yet' : 'Won this deal?'}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onLogSale(lead); }}
                              className="px-2.5 py-1 rounded-md bg-orange-500 hover:bg-orange-400 text-black text-[11px] font-bold"
                            >
                              Log Sale
                            </button>
                          </>
                        )}
                      </div>
                      {/* Accessible stage dropdown (keyboard alternative to drag) */}
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <label className="sr-only" htmlFor={`stage-${lead.id}`}>Change stage for {leadName(lead)}</label>
                        <select
                          id={`stage-${lead.id}`}
                          value={stage.key}
                          disabled={updatingId === lead.id}
                          onChange={async (e) => { await move(lead, e.target.value as PipelineStage); }}
                          className="w-full bg-black/50 border border-white/10 rounded-md px-2 py-1 text-[11px] text-slate-300"
                        >
                          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // LIST VIEW — searchable/sortable table over the same records/permissions.
        <div className="rounded-xl bg-black/30 border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-white/10">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {listRows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-600 text-xs">No customers</td></tr>
              )}
              {listRows.map((lead) => {
                const st = stageForLead(lead, substages);
                const label = STAGES.find((s) => s.key === st)?.label || '';
                return (
                  <tr
                    key={lead.id}
                    onClick={() => onOpenDetail(lead)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                  >
                    <td className="px-3 py-2 text-white font-medium">{leadName(lead)}</td>
                    <td className="px-3 py-2 text-slate-400">{(lead as any).policyType || '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{employeeNameFor?.(lead) || '—'}</td>
                    <td className="px-3 py-2">
                      <select
                        value={st}
                        disabled={updatingId === lead.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => { await move(lead, e.target.value as PipelineStage); }}
                        aria-label={`Stage for ${leadName(lead)} (currently ${label})`}
                        className="bg-black/50 border border-white/10 rounded-md px-2 py-1 text-[11px] text-slate-300"
                      >
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right text-amber-300 font-semibold">{money(leadValue(lead)) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
