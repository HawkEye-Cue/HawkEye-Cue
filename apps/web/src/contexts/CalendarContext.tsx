import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'post' | 'task' | 'reminder';
  completed: boolean;
}

interface CalendarState {
  events: CalendarEvent[];
  addEvent: (event: Omit<CalendarEvent, 'id' | 'completed'>) => void;
  toggleComplete: (id: string) => void;
  removeEvent: (id: string) => void;
}

const CalendarContext = createContext<CalendarState | undefined>(undefined);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem('calendar_events');
    return saved ? JSON.parse(saved) : [];
  });

  const addEvent = (event: Omit<CalendarEvent, 'id' | 'completed'>) => {
    setEvents((prev) => {
      const updated = [...prev, { ...event, id: (Date.now() + Math.random()).toString(), completed: false }];
      localStorage.setItem('calendar_events', JSON.stringify(updated));
      return updated;
    });
  };

  const toggleComplete = (id: string) => {
    setEvents((prev) => {
      const updated = prev.map((e) => e.id === id ? { ...e, completed: !e.completed } : e);
      localStorage.setItem('calendar_events', JSON.stringify(updated));
      return updated;
    });
  };

  const removeEvent = (id: string) => {
    setEvents((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      localStorage.setItem('calendar_events', JSON.stringify(updated));
      return updated;
    });
  };

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
