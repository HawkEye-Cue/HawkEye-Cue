import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { ApiClient } from '@social-lead-gen/shared';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'post' | 'task' | 'reminder';
  completed: boolean;
  link?: string;
}

interface CalendarState {
  events: CalendarEvent[];
  addEvent: (event: Omit<CalendarEvent, 'id' | 'completed'>) => void;
  toggleComplete: (id: string) => void;
  removeEvent: (id: string) => void;
  removeAllByTitle: (title: string) => void;
  loading: boolean;
}

const CalendarContext = createContext<CalendarState | undefined>(undefined);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, getToken } = useAuth();
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
        setEvents(result.events || []);
      } catch {
        // Fallback to localStorage if API fails
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

  const addEvent = useCallback(async (event: Omit<CalendarEvent, 'id' | 'completed'>) => {
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
    } catch {
      // Keep the local version — it'll sync next time
    }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleComplete = useCallback(async (id: string) => {
    // Optimistic update
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, completed: !e.completed } : e));

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
    } catch { /* ignore */ }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeAllByTitle = useCallback(async (title: string) => {
    setEvents((prev) => prev.filter((e) => e.title !== title));

    try {
      const client = await buildClient();
      await client.request('DELETE', `/calendar/events/bulk?title=${encodeURIComponent(title)}`);
    } catch { /* ignore */ }
  }, [getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <CalendarContext.Provider value={{ events, addEvent, toggleComplete, removeEvent, removeAllByTitle, loading }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (!context) throw new Error('useCalendar must be used within CalendarProvider');
  return context;
}
