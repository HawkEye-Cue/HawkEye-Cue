import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCalendar } from '../contexts/CalendarContext';
import { ApiClient } from '@social-lead-gen/shared';

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
  status: string;
  createdAt: string;
  addedBy: string;
  addedByEmail: string;
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

type Tab = 'manage' | 'calendar' | 'leads' | 'analytics' | 'notifications';

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
  const [tab, setTab] = useState<Tab>('manage');
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

  // Fetch team info on mount
  useEffect(() => {
    async function fetchTeam() {
      try {
        const client = await buildClient();
        const result = await client.request<{ team: Team | null }>('GET', '/team');
        setTeam(result.team);
        if (result.team) {
          try {
            const statsResult = await client.request<{ members: MemberStat[]; totalWonValue: number }>('GET', '/team/stats');
            setStats(statsResult);
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    fetchTeam();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    } catch { setTeamLeads([]); }
    finally { setLeadsLoading(false); }
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to join team');
    }
    finally { setAccepting(false); }
  }

  function getMemberColorIndex(email: string): number {
    // Check user-assigned color first
    const memberColors = JSON.parse(localStorage.getItem('hawkeye_member_colors') || '{}');
    if (memberColors[email] !== undefined) return memberColors[email] % MEMBER_COLORS.length;
    // Fallback: position in team array
    if (!team) return 0;
    const idx = team.members.findIndex((m) => m.email === email);
    return idx >= 0 ? idx % MEMBER_COLORS.length : 0;
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
    { id: 'notifications', label: 'Wins', icon: '🏆' },
  ];

  const unreadNotifs = notifications.filter((n) => !n.dismissed).length;

  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      {/* Left column: Team info, Members, Wins, Leads */}
      <div className="min-w-0 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">🏔️ {team.teamName}</h2>
          <p className="text-xs text-slate-400">Summit · {team.members.length}/{team.maxMembers} members</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">{error}</div>
      )}

      {/* 👥 Team Members */}
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
                  {/* Color picker — click to cycle through colors */}
                  <div className="relative group">
                    <button
                      onClick={() => {
                        const next = (colorIdx + 1) % MEMBER_COLORS.length;
                        const updated = { ...memberColors, [member.email]: next };
                        saveTeamColors(updated);
                      }}
                      className={`w-4 h-4 rounded-full ${MEMBER_COLORS[colorIdx]} border-2 border-white/30 hover:border-white/70 transition-all cursor-pointer`}
                      title={`Color: ${COLOR_LABELS[colorIdx]} — click to change`}
                    />
                  </div>
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
          <div className="space-y-1 pt-2 border-t border-white/10">
            {team.invites.map((invite) => (
              <div key={invite.inviteId} className="flex items-center justify-between bg-amber-500/10 px-3 py-1.5 rounded-lg">
                <p className="text-xs text-amber-300">{invite.email}</p>
                <p className="text-[10px] text-slate-500">Pending</p>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* 🪹 Lead Nests by Member */}
      <div className="glass-card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">🪹 Lead Nests</h3>
          <span className="text-xs text-slate-500">{teamLeads.length} total leads</span>
        </div>
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
                  return (
                    <button
                      key={member.userId}
                      onClick={() => setLeadFilter(isActive ? 'all' : member.email)}
                      className={`relative flex flex-col items-center justify-center p-5 rounded-xl border-2 transition-all ${isActive ? `${MEMBER_BORDER_COLORS[colorIdx]} ${MEMBER_BG_COLORS[colorIdx]} scale-[1.03] shadow-lg` : 'border-white/20 bg-slate-800 hover:border-amber-500/40'}`}
                    >
                      <span className="text-3xl mb-1">🪹</span>
                      <div className={`absolute top-2 right-2 w-7 h-7 ${MEMBER_COLORS[colorIdx]} rounded-full flex items-center justify-center shadow-md`}>
                        <span className="text-xs font-bold text-white">{memberLeads.length}</span>
                      </div>
                      <span className="text-xs text-white mt-1 font-medium text-center leading-tight">{name}</span>
                    </button>
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
                          {lead.status === 'followed_up' ? 'Active' : lead.status === 'converted' ? 'Won' : 'New'}
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
                                await client.request('PUT', `/opportunities/${lead.id}/status`, { assignedTo: targetEmail });
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

      {/* 📊 Stats */}
      {teamAnalytics && (
        <div className="glass-card space-y-3">
          <h3 className="font-semibold text-white">📊 Team Stats</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-700 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-green-400">${teamAnalytics.totalRevenue.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Revenue</p>
            </div>
            <div className="bg-slate-700 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-blue-400">{teamAnalytics.wonDeals}</p>
              <p className="text-xs text-slate-400">Won</p>
            </div>
            <div className="bg-slate-700 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-purple-400">{teamAnalytics.totalDeals}</p>
              <p className="text-xs text-slate-400">Total Deals</p>
            </div>
            <div className="bg-slate-700 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-amber-400">{teamAnalytics.flockCompletionRate}%</p>
              <p className="text-xs text-slate-400">Flock Rate</p>
            </div>
          </div>
          {/* Leaderboard */}
          <div className="space-y-1.5">
            <p className="text-xs text-slate-400 font-semibold">🏆 Leaderboard</p>
            {teamAnalytics.members.sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((m, i) => {
              const colorIdx = getMemberColorIndex(m.email);
              const displayNames = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
              const name = displayNames[m.email] || m.email.split('@')[0];
              return (
                <div key={m.email} className="flex items-center justify-between bg-slate-700 px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                    <div className={`w-2.5 h-2.5 rounded-full ${MEMBER_COLORS[colorIdx]}`} />
                    <span className="text-xs text-white">{name}</span>
                  </div>
                  <span className="text-xs font-bold text-green-400">${m.revenue.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 📅 Team Calendar — syncs with Dashboard */}
      <div className="glass-card">
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
                  const teamDayMeetings = teamCalendar.filter((e) => e.date === dateStr);
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
  );
}

