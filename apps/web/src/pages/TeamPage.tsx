import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
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

  // Fetch tab-specific data when tab changes
  useEffect(() => {
    if (!team) return;
    if (tab === 'calendar') fetchTeamCalendar();
    if (tab === 'leads') fetchTeamLeads();
    if (tab === 'analytics') fetchTeamAnalytics();
    if (tab === 'notifications') fetchNotifications();
  }, [tab, team]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTeamCalendar() {
    setCalendarLoading(true);
    try {
      const client = await buildClient();
      const now = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
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
      {/* Left column: header, tabs, manage tab */}
      <div className="min-w-0 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">🏔️ {team.teamName}</h2>
          <p className="text-xs text-slate-400">
            Summit · {team.members.length}/{team.maxMembers} members
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              tab === t.id
                ? 'bg-purple-600/40 text-purple-200 border border-purple-400/50'
                : 'text-slate-400 hover:text-white hover:bg-white/10 bg-slate-700'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.id === 'notifications' && unreadNotifs > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full">{unreadNotifs}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ═══ MANAGE TAB ═══ */}
      {tab === 'manage' && (
        <div className="space-y-4">
          {/* Members */}
          <div className="glass-card space-y-3">
            <h3 className="font-semibold text-white">Members</h3>
            <div className="space-y-2">
              {team.members.map((member, i) => (
                <div key={member.userId} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]}`} />
                    <div>
                      <p className="text-sm text-white">{member.email}</p>
                      <p className="text-xs text-slate-500">{member.role === 'admin' ? '👑 Admin' : '👤 Member'} · Joined {new Date(member.joinedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {team.role === 'admin' && member.role !== 'admin' && (
                    <button onClick={() => handleRemoveMember(member.userId)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pending Invites */}
          {team.role === 'admin' && team.invites.length > 0 && (
            <div className="glass-card space-y-2">
              <h3 className="font-semibold text-white text-sm">Pending Invites</h3>
              {team.invites.map((invite) => (
                <div key={invite.inviteId} className="flex items-center justify-between bg-amber-500/10 px-3 py-2 rounded-lg">
                  <p className="text-sm text-amber-300">{invite.email}</p>
                  <p className="text-xs text-slate-500">Sent {new Date(invite.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}

          {/* Invite Form */}
          {team.role === 'admin' && team.members.length + team.invites.length < team.maxMembers && (
            <div className="glass-card space-y-3">
              <h3 className="font-semibold text-white text-sm">Invite a Team Member</h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@email.com"
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
                />
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 disabled:opacity-50"
                >
                  {inviting ? '...' : 'Invite'}
                </button>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          {stats && (
            <div className="glass-card space-y-3">
              <h3 className="font-semibold text-white">📊 Quick Stats</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-green-400">${stats.totalWonValue.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">Total Won</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-blue-400">{stats.members.reduce((s, m) => s + m.activeDeals, 0)}</p>
                  <p className="text-xs text-slate-400">Active Deals</p>
                </div>
              </div>
            </div>
          )}

          {/* Leave Team */}
          <div className="glass-card">
            <button onClick={handleLeaveTeam} className="text-xs text-red-400 hover:text-red-300">
              Leave Team
            </button>
          </div>
        </div>
      )}

      {/* ═══ CALENDAR TAB ═══ */}
      </div>{/* end left column */}

      {/* Right column: calendar, leads, analytics, notifications tabs */}
      <div className="min-w-0 space-y-4">
      {/* ═══ CALENDAR TAB ═══ */}
      {tab === 'calendar' && (
        <div className="space-y-4">
          <div className="glass-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">📅 Team Calendar</h3>
              <p className="text-xs text-slate-500">Next 30 days</p>
            </div>

            {/* Member color legend */}
            <div className="flex flex-wrap gap-2 mb-4">
              {team.members.map((m, i) => (
                <div key={m.userId} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]}`} />
                  <span className="text-xs text-slate-400">{m.email.split('@')[0]}</span>
                </div>
              ))}
            </div>

            {calendarLoading ? (
              <p className="text-xs text-slate-500">Loading team calendar...</p>
            ) : teamCalendar.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-2xl mb-2">📅</p>
                <p className="text-sm text-slate-400">No upcoming team events</p>
                <p className="text-xs text-slate-500 mt-1">Team members' meetings and posts will show up here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {/* Group by date */}
                {Object.entries(
                  teamCalendar.reduce((acc, event) => {
                    if (!acc[event.date]) acc[event.date] = [];
                    acc[event.date].push(event);
                    return acc;
                  }, {} as Record<string, TeamCalendarEvent[]>)
                ).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayEvents]) => (
                  <div key={date}>
                    <p className="text-xs font-semibold text-slate-400 mb-1.5 sticky top-0 bg-slate-900/90 py-1">
                      {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    <div className="space-y-1.5">
                      {dayEvents.map((event) => {
                        const colorIdx = getMemberColorIndex(event.memberEmail);
                        return (
                          <div key={event.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${MEMBER_BORDER_COLORS[colorIdx]} ${MEMBER_BG_COLORS[colorIdx]}`}>
                            <div className={`w-2 h-2 rounded-full ${MEMBER_COLORS[colorIdx]} shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{event.title}</p>
                              <p className="text-xs text-slate-400">{event.memberName || event.memberEmail.split('@')[0]}{event.startTime ? ` · ${event.startTime}` : ''}</p>
                            </div>
                            <span className="text-xs text-slate-500 shrink-0">{event.type === 'meeting' ? '🤝' : event.type === 'post' ? '📤' : '🔔'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ LEADS TAB ═══ */}
      {tab === 'leads' && (
        <div className="space-y-4">
          <div className="glass-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">🎯 Team Lead Pool</h3>
              <p className="text-xs text-slate-500">{teamLeads.length} leads</p>
            </div>

            {/* Filter by member */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button
                onClick={() => setLeadFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                  leadFilter === 'all' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-400 hover:text-white bg-white/5'
                }`}
              >
                All
              </button>
              {team.members.map((m, i) => (
                <button
                  key={m.userId}
                  onClick={() => setLeadFilter(m.email)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1 ${
                    leadFilter === m.email ? `${MEMBER_BG_COLORS[i % MEMBER_BG_COLORS.length]} ${MEMBER_TEXT_COLORS[i % MEMBER_TEXT_COLORS.length]} border ${MEMBER_BORDER_COLORS[i % MEMBER_BORDER_COLORS.length]}` : 'text-slate-400 hover:text-white bg-white/5'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]}`} />
                  {m.email.split('@')[0]}
                </button>
              ))}
            </div>

            {leadsLoading ? (
              <p className="text-xs text-slate-500">Loading team leads...</p>
            ) : teamLeads.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-2xl mb-2">🎯</p>
                <p className="text-sm text-slate-400">No team leads yet</p>
                <p className="text-xs text-slate-500 mt-1">Leads detected for any team member will appear here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {teamLeads
                  .filter((l) => leadFilter === 'all' || l.addedByEmail === leadFilter)
                  .map((lead) => {
                    const colorIdx = getMemberColorIndex(lead.addedByEmail);
                    return (
                      <div key={lead.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10">
                        <div className={`w-2 h-8 rounded-full ${MEMBER_COLORS[colorIdx]} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{lead.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">{lead.sourcePlatform || 'Unknown'}</span>
                            <span className="text-xs text-slate-600">·</span>
                            <span className={`text-xs ${MEMBER_TEXT_COLORS[colorIdx]}`}>{lead.addedBy || lead.addedByEmail.split('@')[0]}</span>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          lead.status === 'new' ? 'bg-blue-900/40 text-blue-400' :
                          lead.status === 'followed_up' ? 'bg-yellow-900/40 text-yellow-400' :
                          lead.status === 'converted' ? 'bg-green-900/40 text-green-400' : 'bg-slate-900/40 text-slate-400'
                        }`}>{lead.status.replace('_', ' ')}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ANALYTICS TAB ═══ */}
      {tab === 'analytics' && (
        <div className="space-y-4">
          {analyticsLoading ? (
            <p className="text-xs text-slate-500">Loading team analytics...</p>
          ) : !teamAnalytics ? (
            <div className="glass-card text-center py-8">
              <p className="text-2xl mb-2">📊</p>
              <p className="text-sm text-slate-400">No team analytics available yet</p>
              <p className="text-xs text-slate-500 mt-1">Analytics will appear as team members close deals and post content</p>
            </div>
          ) : (
            <>
              {/* Overview Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card text-center">
                  <p className="text-2xl font-bold text-green-400">${teamAnalytics.totalRevenue.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">Team Revenue</p>
                </div>
                <div className="glass-card text-center">
                  <p className="text-2xl font-bold text-blue-400">{teamAnalytics.wonDeals}</p>
                  <p className="text-xs text-slate-400">Deals Won</p>
                </div>
                <div className="glass-card text-center">
                  <p className="text-2xl font-bold text-purple-400">{teamAnalytics.totalDeals}</p>
                  <p className="text-xs text-slate-400">Total Deals</p>
                </div>
                <div className="glass-card text-center">
                  <p className="text-2xl font-bold text-amber-400">{teamAnalytics.flockCompletionRate}%</p>
                  <p className="text-xs text-slate-400">Team Flock Rate</p>
                </div>
              </div>

              {/* Leaderboard */}
              <div className="glass-card space-y-3">
                <h3 className="font-semibold text-white">🏆 Leaderboard</h3>
                <div className="space-y-2">
                  {teamAnalytics.members
                    .sort((a, b) => b.revenue - a.revenue)
                    .map((m, i) => {
                      const colorIdx = getMemberColorIndex(m.email);
                      return (
                        <div key={m.email} className="flex items-center justify-between bg-white/5 px-3 py-2.5 rounded-lg">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg w-6 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                            <div className={`w-2.5 h-2.5 rounded-full ${MEMBER_COLORS[colorIdx]}`} />
                            <span className="text-sm text-white">{m.email.split('@')[0]}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-green-400">${m.revenue.toLocaleString()}</p>
                            <p className="text-xs text-slate-500">{m.wonDeals} won · {m.flockRate}% flock</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ NOTIFICATIONS TAB ═══ */}
      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="glass-card">
            <h3 className="font-semibold text-white mb-3">🏆 Deal Wins</h3>
            {notificationsLoading ? (
              <p className="text-xs text-slate-500">Loading notifications...</p>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-2xl mb-2">🏆</p>
                <p className="text-sm text-slate-400">No recent wins</p>
                <p className="text-xs text-slate-500 mt-1">When a teammate closes a deal, you'll see it here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((notif) => {
                  const colorIdx = getMemberColorIndex(notif.memberEmail);
                  return (
                    <div key={notif.id} className={`relative px-4 py-3 rounded-xl border ${MEMBER_BORDER_COLORS[colorIdx]} ${MEMBER_BG_COLORS[colorIdx]}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-2.5 h-2.5 rounded-full ${MEMBER_COLORS[colorIdx]}`} />
                            <p className="text-sm font-medium text-white">{notif.memberName || notif.memberEmail.split('@')[0]} closed a deal!</p>
                          </div>
                          <p className="text-sm text-slate-300 ml-4.5">🎉 <strong>{notif.dealName}</strong> — <span className="text-green-400 font-bold">${notif.dealValue.toLocaleString()}</span></p>
                          <p className="text-xs text-slate-500 mt-1 ml-4.5">{new Date(notif.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                        </div>
                        <button
                          onClick={() => dismissNotification(notif.id)}
                          className="text-xs text-slate-500 hover:text-slate-300 shrink-0 p-1"
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      </div>{/* end right column */}
    </div>
  );
}
