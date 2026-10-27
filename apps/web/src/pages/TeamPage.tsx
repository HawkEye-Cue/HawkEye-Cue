import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCalendar } from '../contexts/CalendarContext';
import { useSummit } from '../contexts/SummitContext';
import SalesDashboardPage from './SalesDashboardPage';
import { HeroHeader, PillTabs, BoldStat, StatGrid, Panel } from '../components/ui';
import { ApiClient } from '@social-lead-gen/shared';
import FolioManager from '../components/FolioManager';
import HawkPerch from '../components/HawkPerch';
import TeamMemberPipeline from '../components/TeamMemberPipeline';
import { folioDisplayName } from '../utils/folioName';
import { consumeInvite } from '../lib/pendingInvite';

interface TeamMember {
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface TeamInvite {
  inviteId: string;
  email: string;
  createdAt: string;
  expiresAt?: string;
  acceptUrl?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  role: string;
  maxMembers: number;
  members: TeamMember[];
  invites: TeamInvite[];
}

interface MemberStat {
  userId: string;
  email: string;
  role: string;
  totalDeals: number;
  wonDeals: number;
  wonValue: number;
  activeDeals: number;
}

interface TeamCalendarEvent {
  id: string;
  title: string;
  date: string;
  type: string;
  memberEmail: string;
  memberName: string;
  startTime?: string;
  endTime?: string;
}

interface TeamLead {
  id: string;
  name: string;
  sourcePlatform: string;
  sourceContent?: string;
  status: string;
  createdAt: string;
  addedBy: string;
  addedByEmail: string;
  policyType?: string;
  claimedBy?: string | null;
  claimedByName?: string;
  claimedAt?: string;
  responseMinutes?: number | null;
}

interface TeamAnalytics {
  totalDeals: number;
  wonDeals: number;
  totalRevenue: number;
  flockCompletionRate: number;
  members: {
    email: string;
    deals: number;
    wonDeals: number;
    revenue: number;
    flockRate: number;
  }[];
  // Team-wide pipeline counts by deal stage (read-only team view for Flight Path).
  // Returned by GET /team/analytics; same-team enforced server-side.
  stageCounts?: { prospect: number; contacted: number; quoted: number; closing: number; won: number; lost: number };
}

interface DealNotification {
  id: string;
  memberEmail: string;
  memberName: string;
  dealName: string;
  dealValue: number;
  closedAt: string;
  dismissed: boolean;
}

// 'sales' embeds the existing SalesDashboardPage so Summit HQ carries the COMPLETE
// Sales experience with inherent feature parity (same component, same data hooks).
type Tab = 'manage' | 'calendar' | 'leads' | 'analytics' | 'sales' | 'notifications';

const MEMBER_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500',
  'bg-red-500', 'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500', 'bg-lime-500',
];
const MEMBER_TEXT_COLORS = [
  'text-blue-400', 'text-purple-400', 'text-emerald-400', 'text-amber-400', 'text-pink-400',
  'text-red-400', 'text-cyan-400', 'text-orange-400', 'text-indigo-400', 'text-lime-400',
];
const MEMBER_BORDER_COLORS = [
  'border-blue-500/30', 'border-purple-500/30', 'border-emerald-500/30', 'border-amber-500/30', 'border-pink-500/30',
  'border-red-500/30', 'border-cyan-500/30', 'border-orange-500/30', 'border-indigo-500/30', 'border-lime-500/30',
];
const MEMBER_BG_COLORS = [
  'bg-blue-500/10', 'bg-purple-500/10', 'bg-emerald-500/10', 'bg-amber-500/10', 'bg-pink-500/10',
  'bg-red-500/10', 'bg-cyan-500/10', 'bg-orange-500/10', 'bg-indigo-500/10', 'bg-lime-500/10',
];
const COLOR_LABELS = [
  'Blue', 'Purple', 'Emerald', 'Amber', 'Pink',
  'Red', 'Cyan', 'Orange', 'Indigo', 'Lime',
];

export default function TeamPage() {
  const { getToken, user } = useAuth();
  const { showToast } = useToast();
  const { addEvent, events: myEvents } = useCalendar();
  const { refresh: refreshSummit } = useSummit();
  // Summit HQ now opens focused on the Sales Tracker (sales performance is the centerpiece).
  const [tab, setTab] = useState<Tab>('sales');
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [stats, setStats] = useState<{ members: MemberStat[]; totalWonValue: number } | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  // Summit entitlement recovery state — set when a paid /team/* route returns 402
  // SUMMIT_INACTIVE (owner's subscription lapsed). We show a reactivation prompt instead
  // of a generic error, and the team records remain intact for when access is restored.
  const [summitInactive, setSummitInactive] = useState(false);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);
  const [revokingInvite, setRevokingInvite] = useState<string | null>(null);
  // Team Operations: show ONE section at a time (less clutter). Team Settings (members,
  // invites, name/color editing) is collapsed by default so it doesn't dominate.
  type OpsTab = 'leads' | 'pipeline' | 'calendar' | 'workspace';
  const [opsTab, setOpsTab] = useState<OpsTab>('leads');
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  // Hawk Nests → "open workspace" slide-over. Holds the teammate whose pipeline is being
  // viewed (read-only, same-team enforced server-side via GET /team/member/{id}/pipeline,
  // the same route the reusable TeamMemberPipeline component uses).
  const [openNest, setOpenNest] = useState<{ userId: string; name: string } | null>(null);

  // Shared data states
  const [teamCalendar, setTeamCalendar] = useState<TeamCalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedTeamDay, setSelectedTeamDay] = useState<string | null>(null);
  const [addingTeamEvent, setAddingTeamEvent] = useState(false);
  const [teamEventTitle, setTeamEventTitle] = useState('');
  const [teamEventType, setTeamEventType] = useState<'meeting' | 'reminder' | 'post'>('meeting');
  const [teamCalMonth, setTeamCalMonth] = useState(new Date().getMonth());
  const [teamCalYear, setTeamCalYear] = useState(new Date().getFullYear());
  const [teamLeads, setTeamLeads] = useState<TeamLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadFilter, setLeadFilter] = useState<string>('all');
  const [teamAnalytics, setTeamAnalytics] = useState<TeamAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [notifications, setNotifications] = useState<DealNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [memberColors, setMemberColors] = useState<Record<string, number>>(() => JSON.parse(localStorage.getItem('hawkeye_member_colors') || '{}'));

  // Folio selection + monthly history for the Lead Nests production graph
  const [selectedFolio, setSelectedFolio] = useState<string>('current');
  const [monthlyHistory, setMonthlyHistory] = useState<{ key: string; label: string; premium: number; deals: number }[]>([]);
  const [showFolioGraph, setShowFolioGraph] = useState(false);
  const [currentFolio, setCurrentFolio] = useState<{ start: string; end: string } | null>(null);
  const [editingFolioDates, setEditingFolioDates] = useState(false);
  const [folioStartInput, setFolioStartInput] = useState('');
  const [folioEndInput, setFolioEndInput] = useState('');
  const [folioNameInput, setFolioNameInput] = useState('');
  const [folioName, setFolioName] = useState('');

  // Save team folio dates + name (admin sets the current folio period)
  async function saveFolioDates() {
    if (!folioStartInput || !folioEndInput) { showToast('Pick both start and end dates'); return; }
    try {
      const client = await buildClient();
      await client.request('PUT', '/sales/folio-config', { folioStart: folioStartInput, folioEnd: folioEndInput, folioName: folioNameInput.trim() });
      setCurrentFolio({ start: folioStartInput, end: folioEndInput });
      setFolioName(folioNameInput.trim());
      setSelectedFolio('current');
      setEditingFolioDates(false);
      await fetchStats(folioStartInput, folioEndInput);
      showToast('✓ Folio updated');
    } catch { showToast('❌ Failed to save folio'); }
  }

  // Fetch team stats filtered to a folio period (or current folio by default)
  async function fetchStats(folioStart?: string, folioEnd?: string) {
    try {
      const client = await buildClient();
      let url = '/team/stats';
      if (folioStart && folioEnd) url += `?folioStart=${folioStart}&folioEnd=${folioEnd}`;
      const statsResult = await client.request<{ members: MemberStat[]; totalWonValue: number }>('GET', url);
      setStats(statsResult);
    } catch { /* ignore */ }
  }

  // Fetch the rolling-13 monthly production history
  async function fetchHistory() {
    try {
      const client = await buildClient();
      const result = await client.request<{ months: { key: string; label: string; premium: number; deals: number }[] }>('GET', '/team/history');
      setMonthlyHistory(result.months || []);
    } catch { setMonthlyHistory([]); }
  }

  // Load team colors from server (shared across all team members)
  async function fetchTeamColors() {
    try {
      const client = await buildClient();
      const result = await client.request<{ memberColors: Record<string, number> }>('GET', '/team/colors');
      if (result.memberColors && typeof result.memberColors === 'object') {
        setMemberColors(result.memberColors);
        localStorage.setItem('hawkeye_member_colors', JSON.stringify(result.memberColors));
      }
    } catch { /* ignore — user may not be in a team */ }
  }

  // Save colors to team (shared) immediately
  async function saveTeamColors(colors: Record<string, number>) {
    setMemberColors(colors);
    localStorage.setItem('hawkeye_member_colors', JSON.stringify(colors));
    try {
      const client = await buildClient();
      await client.request('PUT', '/team/colors', { memberColors: colors });
    } catch { /* ignore */ }
  }

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  // Detect the 402 SUMMIT_INACTIVE response (owner's Summit subscription lapsed). We flip
  // a recovery flag so the UI shows a "Reactivate Summit" prompt rather than a blank/error
  // screen. Team data is preserved server-side; reactivating restores access.
  function is402(e: unknown): boolean {
    const status = (e as { status?: number } | null)?.status;
    const code = (e as { code?: string } | null)?.code;
    return status === 402 || code === 'SUMMIT_INACTIVE';
  }

  // Fetch team info on mount
  useEffect(() => {
    async function fetchTeam() {
      try {
        const client = await buildClient();
        const result = await client.request<{ team: Team | null }>('GET', '/team');
        setTeam(result.team);
        if (result.team) {
          // Load current folio config so stats default to current folio only
          let fStart: string | undefined;
          let fEnd: string | undefined;
          try {
            const folioResult = await client.request<{ folioStart?: string; folioEnd?: string; folioName?: string }>('GET', '/sales/folio-config');
            if (folioResult.folioStart && folioResult.folioEnd) {
              fStart = folioResult.folioStart;
              fEnd = folioResult.folioEnd;
            }
            if (folioResult.folioName) setFolioName(folioResult.folioName);
          } catch { /* no folio config */ }

          const todayStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })();

          // Auto-advance the folio if the stored period has already ended.
          // Rolls forward by the same length repeatedly until it covers today.
          if (fStart && fEnd && todayStr > fEnd) {
            const startD = new Date(fStart + 'T12:00:00');
            const endD = new Date(fEnd + 'T12:00:00');
            const periodDays = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
            let ns = new Date(startD);
            let ne = new Date(endD);
            const todayD = new Date(todayStr + 'T12:00:00');
            let guard = 0;
            while (ne < todayD && guard < 60) {
              ns = new Date(ne); ns.setDate(ns.getDate() + 1);
              ne = new Date(ns); ne.setDate(ne.getDate() + periodDays - 1);
              guard++;
            }
            fStart = `${ns.getFullYear()}-${String(ns.getMonth() + 1).padStart(2, '0')}-${String(ns.getDate()).padStart(2, '0')}`;
            fEnd = `${ne.getFullYear()}-${String(ne.getMonth() + 1).padStart(2, '0')}-${String(ne.getDate()).padStart(2, '0')}`;
            // Persist the advanced folio so it stays in sync
            try { await client.request('PUT', '/sales/folio-config', { folioStart: fStart, folioEnd: fEnd }); } catch { /* best-effort */ }
          }

          // If no folio config is set, default to the current calendar month.
          if (!fStart || !fEnd) {
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();
            const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
            const lastDate = new Date(y, m + 1, 0);
            const lastDay = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`;
            fStart = firstDay;
            fEnd = lastDay;
          }
          setCurrentFolio({ start: fStart, end: fEnd });
          await fetchStats(fStart, fEnd);
          fetchHistory(); // load YTD + rolling-13 data
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    fetchTeam();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: an invite email links to /team?invite=<code>. Prefill the Join field so
  // the invitee just clicks "Join" (no copy/paste). We do NOT auto-submit — the user must
  // be logged in with the invited email, and acceptInvite enforces the email match.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      // Prefer the URL param; otherwise fall back to a token stashed during the auth flow
      // (the AuthGuard saved it before redirecting an unauthenticated invitee to landing).
      const code = params.get('invite') || consumeInvite();
      if (code) {
        setInviteCode(code);
        // Clean the URL so a refresh doesn't re-trigger.
        window.history.replaceState({}, '', '/team');
      }
    } catch { /* ignore */ }
  }, []);

  // Load display names from server on mount (cross-device sync)
  useEffect(() => {
    async function loadDisplayNames() {
      try {
        const client = await buildClient();
        const prefs = await client.request<any>('GET', '/profile/preferences');
        if (prefs.displayNames && typeof prefs.displayNames === 'object') {
          // Merge server names into localStorage (server wins)
          const existing = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
          const merged = { ...existing, ...prefs.displayNames };
          localStorage.setItem('hawkeye_display_names', JSON.stringify(merged));
        }
      } catch { /* ignore */ }
    }
    loadDisplayNames();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch tab-specific data when tab changes
  useEffect(() => {
    if (!team) return;
    fetchTeamCalendar();
    fetchTeamLeads();
    fetchTeamAnalytics();
    fetchNotifications();
    fetchTeamColors();
  }, [team]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch team calendar when month changes
  useEffect(() => {
    if (!team) return;
    fetchTeamCalendar();
  }, [teamCalMonth, teamCalYear]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTeamCalendar() {
    setCalendarLoading(true);
    try {
      const client = await buildClient();
      const start = `${teamCalYear}-${String(teamCalMonth + 1).padStart(2, '0')}-01`;
      const end = new Date(teamCalYear, teamCalMonth + 1, 0);
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
      const result = await client.request<{ events: TeamCalendarEvent[] }>('GET', `/team/calendar?start=${start}&end=${endStr}`);
      setTeamCalendar(result.events || []);
    } catch { setTeamCalendar([]); }
    finally { setCalendarLoading(false); }
  }

  async function fetchTeamLeads() {
    setLeadsLoading(true);
    try {
      const client = await buildClient();
      const result = await client.request<{ leads: TeamLead[] }>('GET', '/team/leads');
      setTeamLeads(result.leads || []);
      setSummitInactive(false);
    } catch (e) { setTeamLeads([]); if (is402(e)) setSummitInactive(true); }
    finally { setLeadsLoading(false); }
  }

  // Live team lead claiming — first responder claims the opportunity
  async function handleClaimLead(lead: TeamLead) {
    const myName = user?.email?.split('@')[0] || 'me';
    try {
      const client = await buildClient();
      const res = await client.request<{ claimed: boolean; claimedByName?: string; claimedAt?: string; alreadyClaimedBy?: string }>(
        'POST', `/team/leads/${encodeURIComponent(lead.id)}/claim`, { leadName: lead.name, leadCreatedAt: lead.createdAt }
      );
      if (res.claimed) {
        setTeamLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, claimedBy: user?.email || 'me', claimedByName: myName, claimedAt: res.claimedAt } : l));
        showToast(`🎯 You claimed ${lead.name}`);
      } else if (res.alreadyClaimedBy) {
        setTeamLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, claimedBy: 'other', claimedByName: res.alreadyClaimedBy, claimedAt: res.claimedAt } : l));
        showToast(`⚡ ${res.alreadyClaimedBy} already claimed this one`);
      }
    } catch { showToast('❌ Could not claim lead'); }
  }

  async function handleReleaseLead(lead: TeamLead) {
    try {
      const client = await buildClient();
      await client.request('DELETE', `/team/leads/${encodeURIComponent(lead.id)}/claim`);
      setTeamLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, claimedBy: null, claimedByName: undefined, claimedAt: undefined, responseMinutes: null } : l));
      showToast('↩️ Lead released — anyone can claim it now');
    } catch { showToast('❌ Could not release lead'); }
  }

  async function fetchTeamAnalytics() {
    setAnalyticsLoading(true);
    try {
      const client = await buildClient();
      const result = await client.request<TeamAnalytics>('GET', '/team/analytics');
      setTeamAnalytics(result);
    } catch { setTeamAnalytics(null); }
    finally { setAnalyticsLoading(false); }
  }

  async function fetchNotifications() {
    setNotificationsLoading(true);
    try {
      const client = await buildClient();
      const result = await client.request<{ notifications: DealNotification[] }>('GET', '/team/notifications');
      setNotifications(result.notifications || []);
    } catch { setNotifications([]); }
    finally { setNotificationsLoading(false); }
  }

  async function dismissNotification(notifId: string) {
    try {
      const client = await buildClient();
      await client.request('POST', `/team/notifications/${notifId}/dismiss`);
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      showToast('Notification dismissed');
    } catch { /* ignore */ }
  }

  async function handleCreateTeam() {
    if (!teamName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const client = await buildClient();
      await client.request('POST', '/team', { teamName: teamName.trim() });
      const result = await client.request<{ team: Team | null }>('GET', '/team');
      setTeam(result.team);
      refreshSummit();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create team';
      setError(msg.includes('NOT_TEAM_TIER') ? 'You need a Summit subscription to create a team. Upgrade in Settings.' : msg);
    }
    finally { setCreating(false); }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError('');
    try {
      const client = await buildClient();
      await client.request('POST', '/team/invite', { email: inviteEmail.trim() });
      setInviteEmail('');
      const result = await client.request<{ team: Team | null }>('GET', '/team');
      setTeam(result.team);
      showToast('✓ Invite sent');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send invite');
    }
    finally { setInviting(false); }
  }

  // Resend a pending invite: revokes the old code and issues a fresh one + email.
  async function handleResendInvite(email: string, inviteId: string) {
    setResendingInvite(inviteId);
    setError('');
    try {
      const client = await buildClient();
      await client.request('POST', '/team/invite/resend', { email });
      const result = await client.request<{ team: Team | null }>('GET', '/team');
      setTeam(result.team);
      showToast('✓ Invite resent — a new code & email were sent');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to resend invite');
    } finally { setResendingInvite(null); }
  }

  // Revoke a pending invite: deletes it so the admin can re-invite cleanly.
  async function handleRevokeInvite(inviteId: string) {
    if (!confirm('Revoke this pending invite? The current code/link will stop working.')) return;
    setRevokingInvite(inviteId);
    setError('');
    try {
      const client = await buildClient();
      await client.request('DELETE', `/team/invites/${encodeURIComponent(inviteId)}`);
      const result = await client.request<{ team: Team | null }>('GET', '/team');
      setTeam(result.team);
      showToast('✓ Invite revoked');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to revoke invite');
    } finally { setRevokingInvite(null); }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm('Remove this team member? They will lose access to shared team features.')) return;
    try {
      const client = await buildClient();
      await client.request('DELETE', `/team/members/${memberId}`);
      const result = await client.request<{ team: Team | null }>('GET', '/team');
      setTeam(result.team);
      showToast('✓ Member removed');
    } catch { /* ignore */ }
  }

  async function handleLeaveTeam() {
    if (!confirm('Leave this team? You will lose access to all shared team data.')) return;
    try {
      const client = await buildClient();
      await client.request('POST', '/team/leave');
      setTeam(null);
      showToast('You left the team');
      // Access may have ended — refresh so Summit HQ hides if no longer entitled.
      refreshSummit();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to leave team');
    }
  }

  async function handleAcceptInvite() {
    if (!inviteCode.trim()) return;
    setAccepting(true);
    setError('');
    try {
      const client = await buildClient();
      await client.request('POST', '/team/accept', { inviteId: inviteCode.trim() });
      const result = await client.request<{ team: Team | null }>('GET', '/team');
      setTeam(result.team);
      setInviteCode('');
      // Member just joined — surface Summit HQ in the nav without a reload.
      refreshSummit();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to join team');
    }
    finally { setAccepting(false); }
  }

  function getMemberColorIndex(email: string): number {
    // Use state variable directly (already synced with server)
    if (memberColors[email] !== undefined) return memberColors[email] % MEMBER_COLORS.length;
    // Fallback: position in team array (starts at index 0 = blue, 1 = purple, etc.)
    if (!team) return 3; // amber default when no team loaded
    const idx = team.members.findIndex((m) => m.email === email);
    return idx >= 0 ? idx % MEMBER_COLORS.length : 3;
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  // No team — show create or accept invite
  if (!team) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white">🏔️ Summit — Team</h2>
        {error && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="glass-card space-y-3">
          <h3 className="font-semibold text-white">Create a Team</h3>
          <p className="text-xs text-slate-400">Start a team and invite up to 5 members. Share calendars, leads, analytics, and celebrate wins together.</p>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name (e.g. Smith Insurance Group)"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
          />
          <button
            onClick={handleCreateTeam}
            disabled={creating || !teamName.trim()}
            className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-purple-500 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Team'}
          </button>
        </div>
        <div className="glass-card space-y-3">
          <h3 className="font-semibold text-white">Join a Team</h3>
          <p className="text-xs text-slate-400">Got an invite code from your team admin? Enter it here.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Paste invite code..."
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
            />
            <button
              onClick={handleAcceptInvite}
              disabled={accepting || !inviteCode.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {accepting ? '...' : 'Join'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'manage', label: 'Team', icon: '👥' },
    { id: 'calendar', label: 'Calendar', icon: '📅' },
    { id: 'leads', label: 'Leads', icon: '🎯' },
    { id: 'analytics', label: 'Stats', icon: '📊' },
    { id: 'sales', label: 'Sales', icon: '💰' },
    { id: 'notifications', label: 'Wins', icon: '🏆' },
  ];

  const unreadNotifs = notifications.filter((n) => !n.dismissed).length;

  // Premium Summit HQ section switcher — jumps to the anchored section (one focused
  // area at a time, less scrolling). Reuses the declared `tab` state. Each pill maps to
  // a section id rendered below; selecting a pill smooth-scrolls to it.
  // Sales performance leads the Summit HQ experience (centerpiece), with the Scoreboard
  // totals next and Team Members management moved into the Workspace section.
  // Top nav links ONLY to always-visible sections (Sales, Perch, Scoreboard, Radar). The
  // Team Operations sections (Leads/Pipeline/Calendar/Workspace) are reached via the
  // dedicated Operations tab bar below — so we no longer link to those (now-gated)
  // sections here, preventing jumps to a hidden element.
  const summitSections: { id: Tab; label: string; anchor: string }[] = [
    { id: 'sales', label: '💰 Sales Tracker', anchor: 'summit-sales' },
    { id: 'manage', label: '🏔️ Scoreboard', anchor: 'summit-scoreboard' },
    { id: 'notifications', label: '📡 Radar', anchor: 'summit-radar' },
  ];
  function jumpToSection(id: Tab) {
    setTab(id);
    const sec = summitSections.find((s) => s.id === id);
    if (sec) {
      try { document.getElementById(sec.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* ignore */ }
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Premium Summit HQ header + section nav (charcoal/amber identity) ───── */}
      <HeroHeader
        title={team.teamName}
        subtitle={`Summit HQ · ${team.members.length}/${team.maxMembers} members · your team command center`}
        right={
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-bold">
            🏔️ Summit
          </span>
        }
      />
      <div className="sticky top-0 z-20 -mx-1 px-1 py-1 bg-[#05080f]/80 backdrop-blur-sm rounded-xl">
        <PillTabs tabs={summitSections.map((s) => ({ id: s.id, label: s.label }))} active={tab} onChange={jumpToSection} />
      </div>

      {/* ── 💰 SALES TRACKER — SALES-FIRST centerpiece ────────────────────────────
          Moved to the TOP of Summit HQ so the Net-New-Business sales performance graph
          is the first thing an owner sees (no scrolling past team mgmt / leads / calendar).
          Renders the exact standalone SalesDashboardPage (same data hooks, team/individual
          production, folio-filtered Net New Business Premium, attribution) — no sales logic
          duplicated or rewritten; permissions + team isolation unchanged. Everything else
          (Scoreboard, Flight Path, Hawk Nests, Calendar, Team Management) now sits BELOW. */}
      <div id="summit-sales" className="scroll-mt-20 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">💰</span>
          <h2 className="text-lg font-bold text-white">Team Sales Performance</h2>
          <span className="text-[11px] text-slate-500">Net New Business Premium · current folio</span>
        </div>
        <SalesDashboardPage />
      </div>

      {/* ── 🦅 THE HAWK'S PERCH — the ONE consolidated employee sales leaderboard.
          Ranks employees strictly by Net New Business Premium written for the selected
          folio (reuses /team/stats member data). Replaces the old generic thin-bar
          leaderboard AND the separate Individual Performance grid — no duplicate rankings. */}
      {stats && stats.members.length > 0 && (
        <div id="summit-perch" className="scroll-mt-20">
          <HawkPerch
            members={stats.members.map((m) => ({ userId: m.userId, email: m.email, wonValue: m.wonValue || 0, wonDeals: m.wonDeals || 0 }))}
            colorClassFor={(email) => MEMBER_COLORS[getMemberColorIndex(email)]}
            displayNameFor={(email) => {
              try { const n = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}'); return n[email] || email.split('@')[0]; } catch { return email.split('@')[0]; }
            }}
            periodLabel={selectedFolio === 'all' ? 'All Time' : 'Current Folio'}
            teamTotal={stats.totalWonValue || 0}
          />
        </div>
      )}

      {/* ── 🧭 TEAM OPERATIONS — one section at a time (Leads / Pipeline / Calendar /
          Workspace). Replaces the old simultaneous stacking; each tab gates its existing
          section's render below so no section logic is rewritten. */}
      <div className="sticky top-12 z-10 -mx-1 px-1 py-1 bg-[#05080f]/80 backdrop-blur-sm rounded-xl">
        <PillTabs
          tabs={[
            { id: 'leads', label: '🪺 Leads' },
            { id: 'pipeline', label: '🛩️ Pipeline' },
            { id: 'calendar', label: '🗓️ Calendar' },
            { id: 'workspace', label: '📊 Workspace' },
          ]}
          active={opsTab}
          onChange={(id) => setOpsTab(id as OpsTab)}
        />
      </div>

      {/* ── 🏔️ SUMMIT SCOREBOARD — the team performance overview at a glance.
          Prominent metric tiles (revenue, sales, active leads, conversion) sit ABOVE the
          two-column workspace so the most important business numbers are immediately
          visible. Sourced from the existing folio-filtered `stats` + `teamAnalytics` and
          live `teamLeads` — no new metrics invented. Spans full width across both columns. */}
      <div id="summit-scoreboard" className="scroll-mt-20 space-y-3">
        {(() => {
          // Team-wide numbers from the reused hooks. `stats` is folio-filtered (current
          // period); `teamLeads` is the live shared pipeline; `teamAnalytics` adds deal/
          // conversion context. We only DISPLAY real values and guard every divide.
          const revenue = stats?.totalWonValue ?? teamAnalytics?.totalRevenue ?? 0;
          const wonDeals = stats?.members?.reduce((s, m) => s + (m.wonDeals || 0), 0)
            ?? teamAnalytics?.wonDeals ?? 0;
          const openLeads = teamLeads.filter((l) => l.status !== 'converted' && l.status !== 'lost').length;
          const totalDeals = teamAnalytics?.totalDeals ?? 0;
          // Conversion only shown when we have a reliable denominator (avoids 0/0 noise).
          const conversion = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : null;
          return (
            <StatGrid cols={4}>
              <BoldStat icon="💰" label={`Team Revenue${selectedFolio === 'all' ? ' (All Time)' : ' (Folio)'}`} value={`$${revenue.toLocaleString()}`} />
              <BoldStat icon="🏆" label="Sales Closed" value={wonDeals} />
              <BoldStat icon="🎯" label="Active Leads" value={openLeads} />
              <BoldStat icon="📈" label="Conversion" value={conversion === null ? '—' : `${conversion}%`} />
            </StatGrid>
          );
        })()}

        {/* (Individual employee performance is now consolidated into "The Hawk's Perch"
            leaderboard directly below the sales graph — removed here to avoid a duplicate
            employee ranking.) */}
      </div>

    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      {/* Left column: Team info, Members, Wins, Leads */}
      <div className="min-w-0 space-y-4">

      {error && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">{error}</div>
      )}

      {summitInactive && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40">
          <p className="text-sm font-bold text-amber-300">🏔️ Summit is inactive</p>
          <p className="text-xs text-slate-300 mt-1">
            Your team's Summit subscription isn't active right now, so shared team features are paused.
            Your team, members, leads, calendar and sales history are all safe — reactivate Summit to restore access.
          </p>
          <Link to="/settings" className="inline-block mt-3 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-400 text-black rounded-lg text-xs font-bold hover:brightness-105">
            Reactivate Summit →
          </Link>
        </div>
      )}

      {/* ⚙️ TEAM SETTINGS — collapsible. Members, invitations, and name/color editing
          live here, collapsed by default so they don't dominate the dashboard. All
          existing controls/actions are preserved verbatim inside. */}
      <button
        onClick={() => setShowTeamSettings((s) => !s)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">⚙️</span>
          <div className="text-left">
            <p className="text-sm font-bold text-white">Team Settings</p>
            <p className="text-[11px] text-slate-400">Members, invitations, names &amp; colors</p>
          </div>
        </div>
        <span className="text-amber-300 text-sm">{showTeamSettings ? '▼ Hide' : '▶ Manage'}</span>
      </button>

      {/* 👥 Team Members */}
      {showTeamSettings && (
      <div className="glass-card space-y-3">
        <h3 className="font-semibold text-white">👥 Team Members</h3>
        <p className="text-xs text-slate-400">Edit display names and colors below, then click Save</p>
        <div className="space-y-2">
          {team.members.map((member, i) => {
            const displayNames = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
            const displayName = displayNames[member.email] || '';
            const colorIdx = getMemberColorIndex(member.email);
            return (
              <div key={member.userId} className="flex items-center justify-between bg-slate-700 px-3 py-2 rounded-lg">
                <div className="flex items-center gap-2">
                  {/* Color dot — only admin can click to change */}
                  {team.role === 'admin' ? (
                    <button
                      onClick={() => {
                        const next = (colorIdx + 1) % MEMBER_COLORS.length;
                        const updated = { ...memberColors, [member.email]: next };
                        saveTeamColors(updated);
                      }}
                      className={`w-4 h-4 rounded-full ${MEMBER_COLORS[colorIdx]} border-2 border-white/30 hover:border-white/70 transition-all cursor-pointer`}
                      title={`Color: ${COLOR_LABELS[colorIdx]} — click to change`}
                    />
                  ) : (
                    <div className={`w-4 h-4 rounded-full ${MEMBER_COLORS[colorIdx]}`} />
                  )}
                  <div>
                    <input type="text" id={`team-name-${member.userId}`} defaultValue={displayName || member.email.split('@')[0]} className="text-sm text-white bg-transparent border-b border-transparent hover:border-slate-500 focus:border-blue-500 outline-none w-full" />
                    <p className="text-xs text-slate-500">{member.role === 'admin' ? '👑 Admin' : '👤 Member'} · {member.email}</p>
                  </div>
                </div>
                {team.role === 'admin' && member.role !== 'admin' && (
                  <button onClick={() => handleRemoveMember(member.userId)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={() => {
            const names = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
            team.members.forEach((member) => {
              const input = document.getElementById(`team-name-${member.userId}`) as HTMLInputElement;
              if (input) {
                const val = input.value.trim();
                if (val) {
                  names[member.email] = val;
                } else {
                  delete names[member.email];
                }
              }
            });
            localStorage.setItem('hawkeye_display_names', JSON.stringify(names));
            // Save both names and colors to server for cross-device persistence
            const colors = JSON.parse(localStorage.getItem('hawkeye_member_colors') || '{}');
            buildClient().then((client) => {
              client.request('PUT', '/profile/preferences', { displayNames: names }).catch(() => {});
              client.request('PUT', '/team/colors', { memberColors: colors }).catch(() => {});
            });
            showToast('✓ Names & colors saved');
          }}
          className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg transition-all active:scale-95"
        >
          💾 Save Names & Colors
        </button>
        {/* Invite Form */}
        {team.role === 'admin' && team.members.length + team.invites.length < team.maxMembers && (
          <div className="flex gap-2 pt-2 border-t border-white/10">
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@email.com" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
            <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 disabled:opacity-50">{inviting ? '...' : 'Invite'}</button>
          </div>
        )}
        {team.invites.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-white/10">
            {team.invites.map((invite) => (
              <div key={invite.inviteId} className="bg-amber-500/10 px-3 py-2 rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-amber-300 truncate">{invite.email}</p>
                  <p className="text-[10px] text-slate-500 shrink-0">Pending</p>
                </div>
                {team.role === 'admin' && (
                  <div className="flex items-center gap-3 mt-1.5">
                    {invite.acceptUrl && (
                      <button
                        onClick={() => { navigator.clipboard?.writeText(invite.acceptUrl!); showToast('✓ Invite link copied'); }}
                        className="text-[11px] text-blue-400 hover:text-blue-300"
                      >Copy link</button>
                    )}
                    <button
                      onClick={() => { navigator.clipboard?.writeText(invite.inviteId); showToast('✓ Invite code copied'); }}
                      className="text-[11px] text-slate-400 hover:text-white"
                    >Copy code</button>
                    <button
                      onClick={() => handleResendInvite(invite.email, invite.inviteId)}
                      disabled={resendingInvite === invite.inviteId}
                      className="text-[11px] text-amber-400 hover:text-amber-300 disabled:opacity-50"
                    >{resendingInvite === invite.inviteId ? 'Resending…' : 'Resend'}</button>
                    <button
                      onClick={() => handleRevokeInvite(invite.inviteId)}
                      disabled={revokingInvite === invite.inviteId}
                      className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50"
                    >{revokingInvite === invite.inviteId ? 'Revoking…' : 'Revoke'}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* 🏆 Wins — Radar section anchor */}
      <div id="summit-radar" className="scroll-mt-20" />
      {/* 🏆 Wins */}
      {notifications.length > 0 && (
        <div className="glass-card space-y-2">
          <h3 className="font-semibold text-white">🏆 Recent Wins</h3>
          {notifications.slice(0, 5).map((notif) => {
            const colorIdx = getMemberColorIndex(notif.memberEmail);
            return (
              <div key={notif.id} className="flex items-center justify-between bg-slate-700 px-3 py-2 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${MEMBER_COLORS[colorIdx]}`} />
                  <div>
                    <p className="text-xs text-white">{notif.memberName || notif.memberEmail.split('@')[0]} — <strong>{notif.dealName}</strong></p>
                  </div>
                </div>
                <span className="text-xs font-bold text-green-400">${notif.dealValue.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 🛩️ FLIGHT PATH — the signature interactive sales pipeline.
          A visual stage-column view of where the TEAM's opportunities stand, built from
          the real team-wide `stageCounts` returned by GET /team/analytics (same-team
          enforced server-side). This is a READ-ONLY team overview: the backend exposes no
          route for an admin to move a TEAMMATE's deal stage, so we surface the distribution
          and direct paths into existing actions (claim below, open a member's workspace in
          Hawk Nests) rather than fabricating a mutation that isn't supported. The
          first-responder "Up for Grabs" claiming stays a separate, real interaction. */}
      <div id="summit-leads" className="scroll-mt-20 space-y-3" hidden={opsTab !== 'pipeline'}>
        {opsTab === 'pipeline' && teamAnalytics?.stageCounts && (() => {
          const sc = teamAnalytics.stageCounts!;
          // Order stages along the natural flight path (prospect → won), with lost shown
          // separately so it doesn't distort the forward funnel.
          const flow: { key: keyof typeof sc; label: string; icon: string; color: string }[] = [
            { key: 'prospect', label: 'Prospect', icon: '🌱', color: '#64748b' },
            { key: 'contacted', label: 'Contacted', icon: '📞', color: '#38bdf8' },
            { key: 'quoted', label: 'Quoted', icon: '📝', color: '#a78bfa' },
            { key: 'closing', label: 'Closing', icon: '🤝', color: '#fbbf24' },
            { key: 'won', label: 'Won', icon: '🏆', color: '#34d399' },
          ];
          const maxCount = Math.max(1, ...flow.map((f) => sc[f.key] || 0));
          const activeTotal = flow.reduce((s, f) => s + (sc[f.key] || 0), 0);
          return (
            <Panel
              title="🛩️ Flight Path — Team Pipeline"
              right={<span className="text-[10px] text-slate-500">{activeTotal} in flight · {sc.lost || 0} lost</span>}
            >
              {activeTotal === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No opportunities in the pipeline yet. New leads land in the nests below.</p>
              ) : (
                <>
                  {/* Stage columns — each shows the team-wide count + a proportional bar.
                      Clicking a column focuses the Hawk Nests below so you can act on it. */}
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                    {flow.map((f, i) => {
                      const count = sc[f.key] || 0;
                      const h = Math.round((count / maxCount) * 72) + 6;
                      return (
                        <button
                          key={f.key}
                          onClick={() => { try { document.getElementById('summit-nests')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* ignore */ } }}
                          className="group flex flex-col items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2 transition-all"
                          title={`${count} opportunit${count === 1 ? 'y' : 'ies'} — ${f.label}`}
                        >
                          <span className="text-base leading-none mb-1">{f.icon}</span>
                          <span className="text-lg font-extrabold text-white leading-none">{count}</span>
                          <div className="w-full h-[78px] flex items-end mt-1.5">
                            <div className="w-full rounded-t-md transition-all" style={{ height: `${h}px`, background: f.color }} />
                          </div>
                          <span className="text-[9px] text-slate-400 mt-1 text-center leading-tight">{f.label}</span>
                          {i < flow.length - 1 && <span className="hidden" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    Team-wide pipeline across all members (read-only overview). To act on a lead, claim one below or open a teammate's workspace in Hawk Nests.
                    Each person moves their own opportunities from their pipeline.
                  </p>
                </>
              )}
            </Panel>
          );
        })()}
      </div>

      {/* 🎯 Live Lead Claiming — first responder claims the opportunity */}
      {(() => {
        // Show the newest leads (last 14 days) so the team can race to claim.
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const recent = teamLeads
          .filter((l) => l.status !== 'converted' && l.status !== 'lost')
          .filter((l) => !l.createdAt || new Date(l.createdAt).getTime() >= cutoff)
          .slice(0, 20);
        const unclaimedCount = recent.filter((l) => !l.claimedBy).length;
        const myEmail = user?.email || '';
        if (recent.length === 0) return null;
        return (
          <div className="glass-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">🎯 Up for Grabs</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">{unclaimedCount} unclaimed</span>
            </div>
            <p className="text-[10px] text-slate-500 -mt-1">Claim a lead so teammates know you've got it. First one to claim owns the follow-up.</p>
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
              {recent.map((lead) => {
                const mineClaim = lead.claimedBy && (lead.claimedBy === myEmail || lead.claimedBy === 'me');
                const claimed = !!lead.claimedBy;
                return (
                  <div key={`claim-${lead.id}`} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${claimed ? (mineClaim ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-slate-800 border-white/10 opacity-80') : 'bg-slate-800 border-amber-500/30'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-white font-medium truncate">{lead.name}</span>
                        {lead.policyType && <span className="text-[9px] text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-full border border-amber-500/30 shrink-0">{lead.policyType}</span>}
                      </div>
                      {lead.sourceContent && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{lead.sourceContent}</p>}
                      <p className="text-[9px] text-slate-500 mt-0.5">
                        {lead.sourcePlatform} · found by {lead.addedBy}
                        {claimed && (
                          <span className={mineClaim ? 'text-emerald-400' : 'text-blue-400'}>
                            {' '}· 🎯 {mineClaim ? 'you' : lead.claimedByName} claimed
                            {typeof lead.responseMinutes === 'number' && lead.responseMinutes >= 0 && ` (${lead.responseMinutes < 60 ? lead.responseMinutes + 'm' : Math.round(lead.responseMinutes / 60) + 'h'})`}
                          </span>
                        )}
                      </p>
                    </div>
                    {!claimed && (
                      <button
                        onClick={() => handleClaimLead(lead)}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 shrink-0 transition-all active:scale-95"
                      >
                        Claim
                      </button>
                    )}
                    {mineClaim && (
                      <button
                        onClick={() => handleReleaseLead(lead)}
                        className="text-[10px] px-2 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 shrink-0"
                      >
                        Release
                      </button>
                    )}
                    {claimed && !mineClaim && (
                      <span className="text-[10px] px-2 py-1 rounded-lg bg-blue-900/40 text-blue-300 border border-blue-500/20 shrink-0">Taken</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 🪹 Lead Nests by Member — Hawk Nests section */}
      <div id="summit-nests" className="glass-card space-y-3 scroll-mt-20" hidden={opsTab !== 'leads'}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">🪹 Lead Nests</h3>
          <span className="text-xs text-slate-500">{teamLeads.length} total leads</span>
        </div>

        {/* Folio selector + production graph toggle */}
        <div className="flex items-center gap-2">
          <select
            value={selectedFolio}
            onChange={(e) => {
              setSelectedFolio(e.target.value);
              if (e.target.value === 'current') {
                fetchStats(currentFolio?.start, currentFolio?.end);
              } else if (e.target.value === 'all') {
                fetchStats(); // no filter = all time
              }
            }}
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs"
          >
            <option value="current">📅 {currentFolio ? folioDisplayName(`${currentFolio.start} to ${currentFolio.end}`) : 'Current Folio'}</option>
            <option value="all">All Time</option>
          </select>
          <button
            onClick={() => { setShowFolioGraph(!showFolioGraph); if (!showFolioGraph && monthlyHistory.length === 0) fetchHistory(); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${showFolioGraph ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            📊 Trends
          </button>
        </div>

        {/* Set folio — cohesive manager, syncs everywhere (admin only) */}
        {team.role === 'admin' && (
          <FolioManager
            compact
            onSaved={(s, e) => {
              setCurrentFolio({ start: s, end: e });
              setSelectedFolio('current');
              fetchStats(s, e);
            }}
          />
        )}

        {/* Rolling-13 Production Graph */}
        {showFolioGraph && (
          <div className="p-3 bg-slate-800 border border-white/10 rounded-xl">
            <p className="text-xs font-semibold text-white text-center mb-1">Rolling-13 Premium (Agency)</p>
            <p className="text-[10px] text-slate-500 text-center mb-3">Monthly production — helps predict future folios</p>
            {monthlyHistory.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Loading production history…</p>
            ) : (
              (() => {
                const maxPremium = Math.max(...monthlyHistory.map((m) => m.premium), 1);
                return (
                  <div className="flex items-end justify-between gap-1 h-48">
                    {monthlyHistory.map((m) => {
                      const heightPct = (m.premium / maxPremium) * 100;
                      return (
                        <div key={m.key} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                          {/* Tooltip */}
                          <div className="absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-white/20 rounded px-1.5 py-0.5 text-[9px] text-white whitespace-nowrap z-10 pointer-events-none">
                            ${m.premium.toLocaleString()}
                          </div>
                          <div
                            className="w-full bg-blue-500 hover:bg-blue-400 rounded-t transition-all"
                            style={{ height: `${Math.max(heightPct, 1)}%`, minHeight: m.premium > 0 ? '2px' : '0' }}
                          />
                          <span className="text-[7px] text-slate-500 mt-1 -rotate-45 origin-center whitespace-nowrap">{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}
        {leadsLoading ? (
          <p className="text-xs text-slate-500">Loading...</p>
        ) : (
          <>
            {/* Nest grid — hawk nest style per member */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(() => {
                const displayNames = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
                const members = team ? team.members : [];
                return members.map((member, i) => {
                  const memberLeads = teamLeads.filter((l) => l.addedByEmail === member.email);
                  const name = displayNames[member.email] || member.email.split('@')[0];
                  const colorIdx = getMemberColorIndex(member.email);
                  const isActive = leadFilter === member.email;
                  const memberStat = stats?.members?.find((m) => m.email === member.email);
                  const wonDeals = memberStat?.wonDeals || 0;
                  const wonValue = memberStat?.wonValue || 0;
                  const activeDeals = memberStat?.activeDeals || 0;
                  const roleLabel = member.role === 'admin' ? '👑 Admin' : '👤 Member';
                  return (
                    <div
                      key={member.userId}
                      className={`relative flex flex-col p-4 rounded-xl border-2 transition-all ${isActive ? `${MEMBER_BORDER_COLORS[colorIdx]} ${MEMBER_BG_COLORS[colorIdx]} shadow-lg` : 'border-white/15 bg-slate-800 hover:border-amber-500/40'}`}
                    >
                      {/* Lead count badge */}
                      <div className={`absolute top-2 right-2 w-7 h-7 ${MEMBER_COLORS[colorIdx]} rounded-full flex items-center justify-center shadow-md`}>
                        <span className="text-xs font-bold text-white">{memberLeads.length}</span>
                      </div>
                      {/* Tap header toggles this nest's lead filter below */}
                      <button
                        onClick={() => setLeadFilter(isActive ? 'all' : member.email)}
                        className="flex flex-col items-center text-center"
                        title={isActive ? 'Hide this nest\u2019s leads' : 'Show this nest\u2019s leads'}
                      >
                        <span className="text-2xl mb-0.5">🪹</span>
                        <span className="text-xs text-white font-semibold leading-tight truncate max-w-full">{name}</span>
                        <span className="text-[9px] text-slate-500">{roleLabel}</span>
                      </button>
                      {/* Performance mini-stats */}
                      <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                        <div>
                          <p className="text-xs font-extrabold text-white leading-none">{memberLeads.length}</p>
                          <p className="text-[8px] text-slate-500 uppercase">Leads</p>
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-emerald-400 leading-none">{wonDeals}</p>
                          <p className="text-[8px] text-slate-500 uppercase">Sales</p>
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-amber-400 leading-none">{activeDeals}</p>
                          <p className="text-[8px] text-slate-500 uppercase">Active</p>
                        </div>
                      </div>
                      {wonValue > 0 && (
                        <p className="text-[10px] text-emerald-300 font-bold text-center mt-1.5">${wonValue.toLocaleString()} sold</p>
                      )}
                      {/* Open workspace — reuses the same-team pipeline slide-over */}
                      <button
                        onClick={() => setOpenNest({ userId: member.userId, name })}
                        className="mt-2 w-full py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/40 text-[10px] font-bold text-amber-300 transition-all"
                      >
                        Open workspace →
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Filtered leads list */}
            {leadFilter !== 'all' && (
              <div className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2">
                <span className="text-xs text-white font-medium">
                  {(() => { const dn = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}'); return dn[leadFilter] || leadFilter.split('@')[0]; })()}'s Leads
                </span>
                <button onClick={() => setLeadFilter('all')} className="text-[10px] text-blue-400 hover:text-blue-300">Show all</button>
              </div>
            )}
            {(() => {
              const displayNames = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
              if (leadFilter === 'all') return null;
              const filtered = teamLeads.filter((l) => l.addedByEmail === leadFilter);
              if (filtered.length === 0) return <p className="text-xs text-slate-500 text-center py-3">No leads in this nest yet</p>;
              return (
                <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                  {filtered.map((lead) => {
                    const colorIdx = getMemberColorIndex(lead.addedByEmail);
                    return (
                      <div key={lead.id} className="flex items-center gap-2 bg-slate-800 border border-white/10 px-3 py-2.5 rounded-lg">
                        <div className={`w-2 h-2 rounded-full ${MEMBER_COLORS[colorIdx]} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-white font-medium truncate">{lead.name}</span>
                            {(lead as any).policyType && <span className="text-[9px] text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-full border border-amber-500/30 shrink-0">{(lead as any).policyType}</span>}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">{lead.sourcePlatform} · {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${lead.status === 'converted' ? 'bg-green-900/40 text-green-400 border border-green-500/20' : lead.status === 'followed_up' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-500/20' : 'bg-blue-900/40 text-blue-400 border border-blue-500/20'}`}>
                          {lead.status === 'followed_up' ? 'Active' : lead.status === 'converted' ? '⭐ Client' : 'New'}
                        </span>
                        {/* Transfer */}
                        {team && team.members.length > 1 && (
                          <select
                            defaultValue=""
                            onChange={async (e) => {
                              const targetEmail = e.target.value;
                              if (!targetEmail) return;
                              try {
                                const client = await buildClient();
                                // Update the lead with transferredTo (moves it between nests)
                                await client.request('PUT', `/opportunities/${lead.id}/status`, { assignedTo: targetEmail, transferredTo: targetEmail });
                                // Send email notification to receiving team member
                                try {
                                  await client.request('POST', '/team/notify-transfer', { leadId: lead.id, leadName: lead.name, targetEmail, fromName: displayNames[user?.email || ''] || user?.email?.split('@')[0] || 'Teammate' });
                                } catch { /* email notification is best-effort */ }
                                showToast(`✓ Transferred to ${displayNames[targetEmail] || targetEmail.split('@')[0]}`);
                                fetchTeamLeads();
                              } catch { showToast('❌ Transfer failed'); }
                              e.target.value = '';
                            }}
                            className="text-[10px] bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-slate-300 shrink-0 max-w-[70px]"
                          >
                            <option value="">↗️</option>
                            {team.members.filter((m) => m.email !== lead.addedByEmail).map((m) => (
                              <option key={m.userId} value={m.email}>{displayNames[m.email] || m.email.split('@')[0]}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Leave Team */}
      <button onClick={handleLeaveTeam} className="text-xs text-red-400 hover:text-red-300">Leave Team</button>

      </div>{/* end left column */}

      {/* Right column: Calendar, Stats */}
      <div className="min-w-0 space-y-4">

      {/* 📊 Stats — current folio only (from folio-filtered stats) · Workspace tab */}
      {stats && opsTab === 'workspace' && (
        <div className="glass-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">📊 Team Stats</h3>
            <span className="text-[10px] text-slate-500">{selectedFolio === 'all' ? 'All Time' : currentFolio ? folioDisplayName(`${currentFolio.start} to ${currentFolio.end}`) : 'Current Folio'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
              <p className="text-xl font-extrabold text-amber-300">${(stats.totalWonValue || 0).toLocaleString()}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{selectedFolio === 'all' ? 'Premium (All Time)' : 'Premium (This Folio)'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <p className="text-xl font-extrabold text-white">{stats.members.reduce((s, m) => s + (m.wonDeals || 0), 0)}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Won</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <p className="text-xl font-extrabold text-white">{teamLeads.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Total Leads</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
              <p className="text-xl font-extrabold text-amber-300">{teamAnalytics?.flockCompletionRate ?? 0}%</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Flock Rate</p>
            </div>
          </div>

          {/* Premium earned so far this year (all folios YTD) */}
          {(() => {
            const now = new Date();
            const ytd = monthlyHistory.filter((m) => m.key.startsWith(String(now.getFullYear()))).reduce((s, m) => s + m.premium, 0);
            if (monthlyHistory.length === 0) return null;
            return (
              <div className="bg-black/40 border border-amber-500/20 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-amber-300">${ytd.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400">Premium written year-to-date ({now.getFullYear()}, all folios)</p>
              </div>
            );
          })()}

          {/* (Employee ranking lives in "The Hawk's Perch" below the sales graph — the
              duplicate Team-Stats leaderboard was removed to avoid two competing rankings.) */}
        </div>
      )}

      {/* 📅 Team Calendar — Calendar tab */}
      <div id="summit-workspace" className="glass-card scroll-mt-20" hidden={opsTab !== 'calendar'}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">📅 Team Calendar</h3>
        </div>
        {(() => {
          const year = teamCalYear;
          const month = teamCalMonth;
          const now = new Date();
          const todayDay = now.getMonth() === month && now.getFullYear() === year ? now.getDate() : -1;
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDayOfWeek = new Date(year, month, 1).getDay();
          const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          return (
            <div>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => { if (month === 0) { setTeamCalMonth(11); setTeamCalYear(year - 1); } else { setTeamCalMonth(month - 1); } }} className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/5">←</button>
                <p className="text-xs text-slate-400 font-medium">{monthName}</p>
                <button onClick={() => { if (month === 11) { setTeamCalMonth(0); setTeamCalYear(year + 1); } else { setTeamCalMonth(month + 1); } }} className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/5">→</button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="text-center text-[10px] text-slate-500 font-medium py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayEvts = myEvents.filter((e) => e.date === dateStr && e.type === 'meeting');
                  const teamDayMeetings = teamCalendar.filter((e) => e.date === dateStr && (e.type === 'meeting' || e.type === 'task'));
                  const hasMeetings = dayEvts.length > 0 || teamDayMeetings.length > 0;
                  const isToday = day === todayDay;
                  const isSelected = selectedTeamDay === dateStr;
                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedTeamDay(isSelected ? null : dateStr)}
                      className={`text-center py-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-500 text-white font-bold ring-2 ring-blue-400' : isToday ? 'bg-blue-600 text-white font-bold' : hasMeetings ? 'bg-slate-700 text-white hover:bg-slate-600' : 'text-slate-500 hover:bg-white/5'}`}
                    >
                      <span className="text-xs">{day}</span>
                      {hasMeetings && (
                        <div className="flex justify-center gap-0.5 mt-0.5">
                          {(() => {
                            // Collect all unique member emails for this day
                            const allEmails = new Set<string>();
                            for (const e of dayEvts) { allEmails.add(user?.email || ''); }
                            for (const e of teamDayMeetings) { allEmails.add(e.memberEmail); }
                            const uniqueEmails = [...allEmails];
                            // Show per-member colored dots
                            return uniqueEmails.slice(0, 4).map((email) => {
                              const colorIdx = getMemberColorIndex(email);
                              return <span key={email} className={`w-1.5 h-1.5 rounded-full ${MEMBER_COLORS[colorIdx]}`}></span>;
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Day Detail */}
        {selectedTeamDay && (() => {
          const dateLabel = new Date(selectedTeamDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
          const dayEvts = myEvents.filter((e) => e.date === selectedTeamDay && (e.type === 'meeting' || e.type === 'task'));
          const teamDayEvts = teamCalendar.filter((e) => e.date === selectedTeamDay && (e.type === 'meeting' || e.type === 'task'));

          // Merge own meetings + team meetings with color coding
          const seen = new Set<string>();
          const myColorIdx = getMemberColorIndex(user?.email || '');
          const displayNames = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');

          interface MergedMeeting { id: string; title: string; completed: boolean; link?: string; memberName: string; colorIdx: number; }
          const merged: MergedMeeting[] = [];

          // Own meetings first
          for (const m of dayEvts) {
            const key = `${m.title}|${m.date}`;
            seen.add(key);
            merged.push({ id: m.id, title: m.title, completed: m.completed, link: m.link, memberName: 'You', colorIdx: myColorIdx });
          }

          // Team meetings (skip duplicates)
          for (const tm of teamDayEvts) {
            if (tm.memberEmail === user?.email) continue;
            const titleWithTime = tm.startTime ? `[${tm.startTime}] ${tm.title}` : tm.title;
            const key = `${titleWithTime}|${tm.date}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const colorIdx = getMemberColorIndex(tm.memberEmail);
            merged.push({ id: tm.id, title: titleWithTime, completed: false, memberName: tm.memberName || displayNames[tm.memberEmail] || tm.memberEmail.split('@')[0], colorIdx });
          }

          // Separate timed vs untimed
          const timedEvents: Record<number, MergedMeeting[]> = {};
          const untimedEvents: MergedMeeting[] = [];
          for (const evt of merged) {
            const timeMatch = evt.title.match(/^\[(\d{1,2}):(\d{2})\]/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              if (!timedEvents[hour]) timedEvents[hour] = [];
              timedEvents[hour].push(evt);
            } else {
              untimedEvents.push(evt);
            }
          }
          const hours = Array.from({ length: 15 }, (_, i) => i + 6);

          return (
            <div className="mt-3 p-3 rounded-xl border border-blue-500/30 bg-slate-700/80">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-white">{dateLabel}</p>
                <button onClick={() => setSelectedTeamDay(null)} className="text-xs text-slate-400 hover:text-white">✕</button>
              </div>

              {/* Cues — meetings count */}
              <div className="mb-3">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Cues</p>
                <div className="flex justify-center">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center w-24">
                    <span className="text-2xl">🤝</span>
                    <span className="text-lg font-bold text-amber-400 block">{merged.length}</span>
                    <span className="text-[10px] text-slate-400">Meetings</span>
                  </div>
                </div>
              </div>

              {/* Schedule — hourly time slots with member colors */}
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Schedule</p>
                <div className="space-y-0 max-h-[250px] overflow-y-auto">
                  {hours.map((hour) => {
                    const evts = timedEvents[hour] || [];
                    const timeLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                    return (
                      <div key={hour} className={`flex gap-3 py-1.5 border-b border-white/5`}>
                        <span className={`text-[11px] w-14 shrink-0 pt-0.5 ${evts.length > 0 ? 'text-white font-medium' : 'text-slate-600'}`}>{timeLabel}</span>
                        <div className="flex-1">
                          {evts.length > 0 ? evts.map((evt) => (
                            <div key={evt.id} className={`p-2 rounded-lg border ${MEMBER_BORDER_COLORS[evt.colorIdx]} ${MEMBER_BG_COLORS[evt.colorIdx]} mb-1`}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${MEMBER_COLORS[evt.colorIdx]} shrink-0`} />
                                <span className={`text-xs flex-1 ${evt.completed ? 'line-through text-slate-500' : 'text-white'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')}</span>
                              </div>
                              <span className="text-[9px] text-slate-400 ml-4">{evt.memberName}</span>
                            </div>
                          )) : (
                            <div className="h-4"></div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Untimed meetings */}
              {untimedEvents.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-slate-500 uppercase">Unscheduled</p>
                  {untimedEvents.map((evt) => (
                    <div key={evt.id} className={`p-2 rounded-lg border ${MEMBER_BORDER_COLORS[evt.colorIdx]} ${MEMBER_BG_COLORS[evt.colorIdx]}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${MEMBER_COLORS[evt.colorIdx]} shrink-0`} />
                        <span className="text-xs text-white flex-1">{evt.title}</span>
                      </div>
                      <span className="text-[9px] text-slate-400 ml-4">{evt.memberName}</span>
                    </div>
                  ))}
                </div>
              )}

              {merged.length === 0 && <p className="text-xs text-slate-500 text-center py-2">No meetings this day</p>}

              {/* Add Event */}
              {!addingTeamEvent ? (
                <button onClick={() => setAddingTeamEvent(true)} className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg active:scale-95">
                  + Add to This Day
                </button>
              ) : (
                <div className="space-y-2 pt-2 border-t border-white/10 mt-3">
                  <div className="flex gap-1">
                    {(['meeting', 'reminder'] as const).map((t) => (
                      <button key={t} onClick={() => setTeamEventType(t)} className={`flex-1 py-1.5 rounded text-[10px] font-bold ${teamEventType === t ? (t === 'meeting' ? 'bg-amber-500 text-black' : 'bg-green-600 text-white') : 'bg-slate-700 text-slate-400'}`}>
                        {t === 'meeting' ? '🤝 Meeting' : '🔔 Reminder'}
                      </button>
                    ))}
                  </div>
                  <input type="text" value={teamEventTitle} onChange={(e) => setTeamEventTitle(e.target.value)} placeholder="Event title..." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-500" />
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1">Time</p>
                    <div className="grid grid-cols-4 gap-1">
                      {['8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map((t) => {
                        const h = parseInt(t.split(':')[0]);
                        const label = h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`;
                        return (
                          <button key={t} id={`team-time-${t}`} onClick={(ev) => {
                            document.querySelectorAll('[id^="team-time-"]').forEach((el) => el.classList.remove('!bg-blue-600', '!text-white'));
                            (ev.target as HTMLElement).classList.add('!bg-blue-600', '!text-white');
                            (document.getElementById('teamEventTimeHidden') as HTMLInputElement).value = t;
                          }} className="py-1.5 rounded text-[10px] font-medium bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600">
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <input type="hidden" id="teamEventTimeHidden" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setAddingTeamEvent(false)} className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg text-xs">Cancel</button>
                    <button
                      onClick={async () => {
                        if (!teamEventTitle.trim() || !selectedTeamDay) return;
                        const timeVal = (document.getElementById('teamEventTimeHidden') as HTMLInputElement)?.value || '';
                        let title = teamEventTitle.trim();
                        if (timeVal) title = `[${timeVal}] ${title}`;
                        await addEvent({ date: selectedTeamDay, title, type: teamEventType });
                        setTeamEventTitle('');
                        setAddingTeamEvent(false);
                        showToast('✓ Saved to calendar');
                      }}
                      disabled={!teamEventTitle.trim()}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                    >
                      ✓ Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      </div>{/* end right column */}

    </div>

    {/* 🪺 Hawk Nest workspace — a teammate's read-only pipeline slide-over, opened from a
        nest card. Reuses the existing TeamMemberPipeline component + GET /team/member/{id}/
        pipeline route (same-team enforced server-side), so permissions + data isolation are
        preserved and no new backend logic is added. */}
    {openNest && (
      <TeamMemberPipeline
        memberUserId={openNest.userId}
        memberName={openNest.name}
        folioStart={selectedFolio === 'all' ? undefined : currentFolio?.start}
        folioEnd={selectedFolio === 'all' ? undefined : currentFolio?.end}
        onClose={() => setOpenNest(null)}
      />
    )}
    </div>
  );
}

