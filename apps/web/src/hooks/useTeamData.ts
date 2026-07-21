import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';

export interface TeamCalendarEvent {
  id: string;
  title: string;
  date: string;
  type: string;
  memberEmail: string;
  memberName: string;
  startTime?: string;
  endTime?: string;
}

export interface TeamLead {
  id: string;
  name: string;
  sourcePlatform: string;
  status: string;
  createdAt: string;
  addedBy: string;
  addedByEmail: string;
  policyType?: string;
}

export interface TeamAnalytics {
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

export interface TeamMember {
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
}

export const MEMBER_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500'];
export const MEMBER_TEXT_COLORS = ['text-blue-400', 'text-purple-400', 'text-emerald-400', 'text-amber-400', 'text-pink-400'];

export function useTeamData() {
  const { getToken } = useAuth();
  const [isInTeam, setIsInTeam] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamCalendar, setTeamCalendar] = useState<TeamCalendarEvent[]>([]);
  const [teamLeads, setTeamLeads] = useState<TeamLead[]>([]);
  const [leadsNextCursor, setLeadsNextCursor] = useState<string | undefined>();
  const [teamAnalytics, setTeamAnalytics] = useState<TeamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  // Check team membership on mount
  useEffect(() => {
    async function checkTeam() {
      try {
        const client = await buildClient();
        const result = await client.request<{ team: any }>('GET', '/team');
        if (result.team) {
          setIsInTeam(true);
          setTeamMembers(result.team.members || []);
        } else {
          setIsInTeam(false);
        }
      } catch {
        setIsInTeam(false);
      } finally {
        setLoading(false);
      }
    }
    checkTeam();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCalendar = useCallback(async (start: string, end: string) => {
    try {
      setError(null);
      const client = await buildClient();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const result = await client.request<{ events: TeamCalendarEvent[] }>('GET', `/team/calendar?start=${start}&end=${end}`);
      clearTimeout(timeout);
      setTeamCalendar(result.events || []);
    } catch {
      setError('Team calendar unavailable');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLeads = useCallback(async (cursor?: string) => {
    try {
      setError(null);
      const client = await buildClient();
      const url = cursor ? `/team/leads?limit=25&cursor=${cursor}` : '/team/leads?limit=25';
      const result = await client.request<{ leads: TeamLead[]; nextCursor?: string }>('GET', url);
      if (cursor) {
        setTeamLeads((prev) => [...prev, ...(result.leads || [])]);
      } else {
        setTeamLeads(result.leads || []);
      }
      setLeadsNextCursor(result.nextCursor);
    } catch {
      setError('Team leads unavailable');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalytics = useCallback(async () => {
    try {
      setError(null);
      const client = await buildClient();
      const result = await client.request<TeamAnalytics>('GET', '/team/analytics');
      setTeamAnalytics(result);
    } catch {
      setError('Team analytics unavailable');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function getMemberColorIndex(email: string): number {
    const idx = teamMembers.findIndex((m) => m.email === email);
    return idx >= 0 ? idx % MEMBER_COLORS.length : 0;
  }

  return {
    isInTeam,
    teamMembers,
    teamCalendar,
    teamLeads,
    leadsNextCursor,
    teamAnalytics,
    loading,
    error,
    fetchCalendar,
    fetchLeads,
    fetchAnalytics,
    getMemberColorIndex,
  };
}
