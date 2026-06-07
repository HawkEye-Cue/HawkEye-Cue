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
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const addEvent = (event: Omit<CalendarEvent, 'id' | 'completed'>) => {
    setEvents((prev) => [...prev, { ...event, id: Date.now().toString(), completed: false }]);
  };

  const toggleComplete = (id: string) => {
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, completed: !e.completed } : e));
  };

  const removeEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
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
