import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
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

export default function TeamPage() {
  const { getToken } = useAuth();
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

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  useEffect(() => {
    async function fetchTeam() {
      try {
        const client = await buildClient();
        const result = await client.request<{ team: Team | null }>('GET', '/team');
        setTeam(result.team);
        if (result.team?.role === 'admin') {
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
      setError(msg.includes('NOT_TEAM_TIER') ? 'You need a Team subscription to create a team. Upgrade in Settings.' : msg);
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send invite');
    }
    finally { setInviting(false); }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      const client = await buildClient();
      await client.request('DELETE', `/team/members/${memberId}`);
      const result = await client.request<{ team: Team | null }>('GET', '/team');
      setTeam(result.team);
    } catch { /* ignore */ }
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

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  // No team — show create or accept invite
  if (!team) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white">👥 Team</h2>

        {error && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Create a team */}
        <div className="glass-card space-y-3">
          <h3 className="font-semibold text-white">Create a Team</h3>
          <p className="text-xs text-slate-400">Start a team and invite up to 5 members. Each member gets their own full HawkEye-Cue account with individual calendar, leads, and sales tracking.</p>
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

        {/* Accept an invite */}
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

  // Has a team — show dashboard
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">👥 {team.teamName}</h2>
          <p className="text-xs text-slate-400">
            {team.role === 'admin' ? 'You are the team admin' : 'Team member'} · {team.members.length}/{team.maxMembers} members
          </p>
        </div>
      </div>

      {/* Team Members */}
      <div className="glass-card space-y-3">
        <h3 className="font-semibold text-white">Members</h3>
        <div className="space-y-2">
          {team.members.map((member) => (
            <div key={member.userId} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg">
              <div>
                <p className="text-sm text-white">{member.email}</p>
                <p className="text-xs text-slate-500">{member.role === 'admin' ? '👑 Admin' : '👤 Member'} · Joined {new Date(member.joinedAt).toLocaleDateString()}</p>
              </div>
              {team.role === 'admin' && member.role !== 'admin' && (
                <button
                  onClick={() => handleRemoveMember(member.userId)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
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
              <p className="text-xs text-slate-500">Pending</p>
            </div>
          ))}
        </div>
      )}

      {/* Invite Form (admin only) */}
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

      {/* Team Stats (admin only) */}
      {team.role === 'admin' && stats && (
        <div className="glass-card space-y-3">
          <h3 className="font-semibold text-white">📊 Team Performance</h3>
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

          {/* Leaderboard */}
          <div className="space-y-1.5">
            <p className="text-xs text-slate-400 font-medium">Leaderboard</p>
            {stats.members.map((m, i) => (
              <div key={m.userId} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                  <span className="text-sm text-white">{m.email.split('@')[0]}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-green-400">${m.wonValue.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">{m.wonDeals} won</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
