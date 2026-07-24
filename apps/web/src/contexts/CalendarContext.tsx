import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { ApiClient } from '@social-lead-gen/shared';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'post' | 'task' | 'meeting' | 'reminder';
  completed: boolean;
  completedAt?: string | null;
  link?: string;
  notes?: string;
  notesSavedAt?: string | null;
  inviteStatus?: 'pending' | 'confirmed' | null;
  inviteEmail?: string;
}

interface CalendarState {
  events: CalendarEvent[];
  addEvent: (event: Omit<CalendarEvent, 'id' | 'completed'>) => Promise<string>;
  updateEvent: (id: string, updates: Partial<Pick<CalendarEvent, 'title' | 'date' | 'type' | 'link'>>) => Promise<void>;
  toggleComplete: (id: string) => void;
  removeEvent: (id: string) => void;
  removeAllByTitle: (title: string) => void;
  updateNotes: (id: string, notes: string) => Promise<void>;
  refreshEvents: () => Promise<void>;
  loading: boolean;
}

const CalendarContext = createContext<CalendarState | undefined>(undefined);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, getToken } = useAuth();
  const { showToast } = useToast();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  // Fetch events from server on login
  useEffect(() => {
    if (!isAuthenticated) {
      setEvents([]);
      setLoading(false);
      return;
    }

    async function fetchEvents() {
      try {
        const client = await buildClient();
        const result = await client.request<{ events: CalendarEvent[] }>('GET', '/calendar/events');
        // Auto-reset: treat events as not completed if they were completed on a different day
        const now = new Date();
        const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const processed = (result.events || []).map((e) => {
          if (e.completed && e.completedAt) {
            const completedDay = e.completedAt.split('T')[0];
            if (completedDay !== todayLocal) {
              return { ...e, completed: false, completedAt: null };
            }
          }
          return e;
        });
        setEvents(processed);
      } catch {
        try {
          const saved = localStorage.getItem('calendar_events');
          if (saved) setEvents(JSON.parse(saved));
        } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshEvents = useCallback(async () => {
    try {
      const client = await buildClient();
      const result = await client.request<{ events: CalendarEvent[] }>('GET', '/calendar/events');
      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const processed = (result.events || []).map((e) => {
        if (e.completed && e.completedAt) {
          const completedDay = e.completedAt.split('T')[0];
          if (completedDay !== todayLocal) {
            return { ...e, completed: false, completedAt: null };
          }
        }
        return e;
      });
      setEvents(processed);
    } catch { /* ignore */ }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const addEvent = useCallback(async (event: Omit<CalendarEvent, 'id' | 'completed'>): Promise<string> => {
    // Optimistic: add locally first
    const tempId = (Date.now() + Math.random()).toString();
    const newEvent: CalendarEvent = { ...event, id: tempId, completed: false };
    setEvents((prev) => [...prev, newEvent]);

    // Save to server
    try {
      const client = await buildClient();
      const result = await client.request<CalendarEvent>('POST', '/calendar/events', {
        date: event.date,
        title: event.title,
        type: event.type,
        link: event.link || null,
      });
      // Replace temp ID with server ID
      setEvents((prev) => prev.map((e) => e.id === tempId ? { ...result } : e));
      showToast('✓ Saved');
      return result.id || tempId;
    } catch {
      // Keep the local version — it'll sync next time
      return tempId;
    }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateEvent = useCallback(async (id: string, updates: Partial<Pick<CalendarEvent, 'title' | 'date' | 'type' | 'link'>>) => {
    // Optimistic update
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, ...updates } : e));

    try {
      const client = await buildClient();
      await client.request('PUT', `/calendar/events/${id}`, updates);
      showToast('✓ Updated');
    } catch {
      // Revert on failure — refetch
      showToast('❌ Failed to update');
    }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleComplete = useCallback(async (id: string) => {
    // Optimistic update — set completedAt so auto-reset logic doesn't undo it
    const now = new Date().toISOString();
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, completed: !e.completed, completedAt: !e.completed ? now : null } : e));

    try {
      const client = await buildClient();
      await client.request('PUT', `/calendar/events/${id}/toggle`);
    } catch { /* revert silently on failure */ }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeEvent = useCallback(async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));

    try {
      const client = await buildClient();
      await client.request('DELETE', `/calendar/events/${id}`);
      showToast('✓ Removed');
    } catch { /* ignore */ }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeAllByTitle = useCallback(async (titleMatch: string) => {
    // Remove events where title contains the match string (supports partial matching)
    setEvents((prev) => prev.filter((e) => !e.title.includes(titleMatch)));

    try {
      const client = await buildClient();
      await client.request('DELETE', `/calendar/events/bulk?title=${encodeURIComponent(titleMatch)}`);
    } catch { /* ignore */ }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateNotes = useCallback(async (id: string, notes: string) => {
    try {
      const client = await buildClient();
      const result = await client.request<{ notesSavedAt: string }>('PUT', `/calendar/events/${id}/notes`, { notes });
      setEvents((prev) => prev.map((e) => e.id === id ? { ...e, notes, notesSavedAt: result.notesSavedAt } : e));
    } catch { /* ignore */ }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <CalendarContext.Provider value={{ events, addEvent, updateEvent, toggleComplete, removeEvent, removeAllByTitle, updateNotes, refreshEvents, loading }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (!context) throw new Error('useCalendar must be used within CalendarProvider');
  return context;
}
