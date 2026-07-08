import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'post' | 'task' | 'reminder';
  completed: boolean;
  link?: string; // optional URL (e.g., Facebook group link)
}

interface CalendarState {
  events: CalendarEvent[];
  addEvent: (event: Omit<CalendarEvent, 'id' | 'completed'>) => void;
  toggleComplete: (id: string) => void;
  removeEvent: (id: string) => void;
}

const CalendarContext = createContext<CalendarState | undefined>(undefined);

const STORAGE_KEY = 'calendar_events';
const MAX_EVENTS = 500; // Prevent localStorage overflow

function loadEvents(): CalendarEvent[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const events: CalendarEvent[] = JSON.parse(saved);

    // Auto-purge: remove completed events older than 7 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const filtered = events.filter((e) => {
      if (e.completed && e.date < cutoffStr) return false;
      return true;
    });

    // If we pruned anything, save back
    if (filtered.length !== events.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }

    return filtered;
  } catch {
    return [];
  }
}

function saveEvents(events: CalendarEvent[]) {
  // Cap at MAX_EVENTS to prevent localStorage overflow
  const toSave = events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    // localStorage full — prune oldest events
    console.warn('localStorage full, pruning old events');
    const pruned = toSave.slice(Math.floor(toSave.length / 2));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  }
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>(loadEvents);

  const addEvent = useCallback((event: Omit<CalendarEvent, 'id' | 'completed'>) => {
    setEvents((prev) => {
      const updated = [...prev, { ...event, id: (Date.now() + Math.random()).toString(), completed: false }];
      saveEvents(updated);
      return updated;
    });
  }, []);

  const toggleComplete = useCallback((id: string) => {
    setEvents((prev) => {
      const updated = prev.map((e) => e.id === id ? { ...e, completed: !e.completed } : e);
      saveEvents(updated);
      return updated;
    });
  }, []);

  const removeEvent = useCallback((id: string) => {
    setEvents((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      saveEvents(updated);
      return updated;
    });
  }, []);

  return (
    <CalendarContext.Provider value={{ events, addEvent, toggleComplete, removeEvent }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (!context) throw new Error('useCalendar must be used within CalendarProvider');
  return context;
}
