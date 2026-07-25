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
];
const MEMBER_TEXT_COLORS = [
  'text-blue-400', 'text-purple-400', 'text-emerald-400', 'text-amber-400', 'text-pink-400',
];
const MEMBER_BORDER_COLORS = [
  'border-blue-500/30', 'border-purple-500/30', 'border-emerald-500/30', 'border-amber-500/30', 'border-pink-500/30',
];
const MEMBER_BG_COLORS = [
  'bg-blue-500/10', 'bg-purple-500/10', 'bg-emerald-500/10', 'bg-amber-500/10', 'bg-pink-500/10',
];

export default function TeamPage() {
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const { addEvent } = useCalendar();
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
  const [teamLeads, setTeamLeads] = useState<TeamLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadFilter, setLeadFilter] = useState<string>('all');
  const [teamAnalytics, setTeamAnalytics] = useState<TeamAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [notifications, setNotifications] = useState<DealNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

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
  }, [team]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTeamCalendar() {
    setCalendarLoading(true);
    try {
      const client = await buildClient();
      const now = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
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
        <p className="text-xs text-slate-400">Edit display names below, then click Save</p>
        <div className="space-y-2">
          {team.members.map((member, i) => {
            const displayNames = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
            const displayName = displayNames[member.email] || '';
            return (
              <div key={member.userId} className="flex items-center justify-between bg-slate-700 px-3 py-2 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]}`} />
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
            // Save to server for cross-device persistence
            buildClient().then((client) => {
              client.request('PUT', '/profile/preferences', { displayNames: names }).catch(() => {});
            });
            showToast('✓ Display names saved');
          }}
          className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg transition-all active:scale-95"
        >
          💾 Save Names
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
                  const colorIdx = i % MEMBER_COLORS.length;
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
              const filtered = leadFilter === 'all' ? teamLeads : teamLeads.filter((l) => l.addedByEmail === leadFilter);
              if (filtered.length === 0) return <p className="text-xs text-slate-500 text-center py-3">{leadFilter === 'all' ? 'No leads yet — leads added by any team member show here' : 'No leads in this nest yet'}</p>;
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

      {/* 📅 Team Calendar */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">📅 Team Calendar</h3>
          <p className="text-xs text-slate-400">All members' schedules combined</p>
        </div>
        {/* Member color legend */}
        <div className="flex flex-wrap gap-3 mb-3">
          {team.members.map((m, i) => {
            const displayNames = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
            const name = displayNames[m.email] || m.email.split('@')[0];
            return (
              <div key={m.userId} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]}`} />
                <span className="text-xs text-slate-300">{name}</span>
              </div>
            );
          })}
        </div>
        {calendarLoading ? <p className="text-xs text-slate-500">Loading...</p> : (() => {
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDayOfWeek = new Date(year, month, 1).getDay();
          const today = now.getDate();
          return (
            <div>
              <p className="text-xs text-slate-400 text-center mb-2">{now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="text-center text-[10px] text-slate-500 font-medium py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayEvents = teamCalendar.filter((e) => e.date === dateStr);
                  const isToday = day === today;
                  const isSelected = selectedTeamDay === dateStr;
                  const uniqueMembers = [...new Set(dayEvents.map((e) => e.memberEmail))];
                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedTeamDay(isSelected ? null : dateStr)}
                      className={`text-center py-2 sm:py-3 rounded-lg transition-colors cursor-pointer ${isSelected ? 'bg-blue-500 text-white font-bold ring-2 ring-blue-400' : isToday ? 'bg-blue-600 text-white font-bold' : dayEvents.length > 0 ? 'bg-slate-700 text-white hover:bg-slate-600' : 'text-slate-500 hover:bg-white/5'}`}
                    >
                      <span className="text-xs sm:text-sm">{day}</span>
                      {uniqueMembers.length > 0 && (
                        <div className="flex justify-center gap-0.5 mt-0.5">
                          {uniqueMembers.slice(0, 4).map((email) => <div key={email} className={`w-1.5 h-1.5 rounded-full ${MEMBER_COLORS[getMemberColorIndex(email)]}`} />)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Day Detail — shows all members' events for selected day */}
        {selectedTeamDay && (() => {
          const dayEvents = teamCalendar.filter((e) => e.date === selectedTeamDay);
          const dateLabel = new Date(selectedTeamDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
          // Group by member
          const byMember: Record<string, TeamCalendarEvent[]> = {};
          dayEvents.forEach((e) => {
            if (!byMember[e.memberEmail]) byMember[e.memberEmail] = [];
            byMember[e.memberEmail].push(e);
          });
          const displayNames = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
          return (
            <div className="mt-3 p-3 rounded-xl border border-blue-500/30 bg-slate-700/80 backdrop-blur-sm animate-scale-in">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-white">{dateLabel}</p>
                <button onClick={() => setSelectedTeamDay(null)} className="text-xs text-slate-400 hover:text-white">✕</button>
              </div>
              <div className="space-y-3">
                {Object.entries(byMember).map(([email, events]) => {
                  const colorIdx = getMemberColorIndex(email);
                  const name = displayNames[email] || email.split('@')[0];
                  return (
                    <div key={email}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-3 h-3 rounded-full ${MEMBER_COLORS[colorIdx]}`} />
                        <span className="text-xs font-semibold text-white">{name}</span>
                        <span className="text-[10px] text-slate-500">{events.length} event{events.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-1 pl-5">
                        {events.map((evt) => {
                          const icon = evt.type === 'post' ? '📤' : evt.type === 'meeting' ? '🤝' : evt.type === 'reminder' ? '🔔' : '📋';
                          const cleanTitle = evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '');
                          const timeMatch = evt.title.match(/^\[(\d{1,2}:\d{2})\]/);
                          return (
                            <div key={evt.id} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                              <span className="text-sm shrink-0">{icon}</span>
                              <span className="text-xs text-slate-200 flex-1 truncate">{cleanTitle}</span>
                              {timeMatch && <span className="text-[10px] text-slate-500 shrink-0">{timeMatch[1]}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Add event to this day */}
              {!addingTeamEvent ? (
                <button onClick={() => setAddingTeamEvent(true)} className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95">
                  + Add Event to This Day
                </button>
              ) : (
                <div className="mt-3 space-y-2 pt-2 border-t border-white/10">
                  <div className="flex gap-1">
                    {(['meeting', 'reminder', 'post'] as const).map((t) => (
                      <button key={t} onClick={() => setTeamEventType(t)} className={`flex-1 py-1.5 rounded text-[10px] font-bold ${teamEventType === t ? (t === 'meeting' ? 'bg-amber-500 text-black' : t === 'reminder' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white') : 'bg-slate-700 text-slate-400'}`}>
                        {t === 'meeting' ? '🤝' : t === 'reminder' ? '🔔' : '📤'} {t}
                      </button>
                    ))}
                  </div>
                  <input type="text" value={teamEventTitle} onChange={(e) => setTeamEventTitle(e.target.value)} placeholder="Event title..." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-500" autoFocus />
                  <div className="flex gap-2">
                    <button onClick={() => setAddingTeamEvent(false)} className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg text-xs">Cancel</button>
                    <button
                      onClick={async () => {
                        if (!teamEventTitle.trim() || !selectedTeamDay) return;
                        await addEvent({ date: selectedTeamDay, title: teamEventTitle.trim(), type: teamEventType });
                        setTeamEventTitle('');
                        setAddingTeamEvent(false);
                        showToast('✓ Event added — visible to team');
                        fetchTeamCalendar();
                      }}
                      disabled={!teamEventTitle.trim()}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                    >
                      ✓ Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Upcoming events */}
        {!selectedTeamDay && teamCalendar.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 max-h-[200px] overflow-y-auto">
            <p className="text-xs text-slate-400 font-semibold mb-1">Upcoming</p>
            {teamCalendar.slice(0, 10).map((event) => {
              const colorIdx = getMemberColorIndex(event.memberEmail);
              const displayNames = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
              const memberName = displayNames[event.memberEmail] || event.memberName;
              const cleanTitle = event.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '');
              const icon = event.type === 'post' ? '📤' : event.type === 'meeting' ? '🤝' : event.type === 'reminder' ? '🔔' : '📋';
              return (
                <div key={event.id} className="flex items-center gap-2 bg-slate-700 px-3 py-1.5 rounded-lg">
                  <div className={`w-2 h-2 rounded-full ${MEMBER_COLORS[colorIdx]} shrink-0`} />
                  <span className="text-xs shrink-0">{icon}</span>
                  <span className="text-xs text-white flex-1 truncate">{cleanTitle}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{memberName}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      </div>{/* end right column */}
    </div>
  );
}
