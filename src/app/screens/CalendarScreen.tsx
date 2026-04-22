import { useState, useEffect } from 'react';
import { HEButton, HECard, StatusBadge } from '../components/DesignSystem';
import { Calendar, Clock, X, ChevronLeft, ChevronRight, Plus, Edit2, Trash2 } from 'lucide-react';
import { tradeContent } from '../data/tradeData';
import { createPost } from '../../lib/ayrshare';

interface CalendarScreenProps {
  tradeId: string;
  onNavigate: (page: string) => void;
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  time?: string;
  type: 'event' | 'post' | 'reminder';
  description?: string;
}

export function CalendarScreen({ tradeId, onNavigate }: CalendarScreenProps) {
  const content = tradeContent[tradeId];
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  // Load events from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`calendarEvents_${tradeId}`);
    if (saved) {
      setEvents(JSON.parse(saved));
    }
  }, [tradeId]);

  // Save events to localStorage
  useEffect(() => {
    if (events.length >= 0) {
      localStorage.setItem(`calendarEvents_${tradeId}`, JSON.stringify(events));
      // Update notification count
      updateNotificationCount();
    }
  }, [events, tradeId]);

  // Load selected platforms
  useEffect(() => {
    const saved = localStorage.getItem('selectedPlatforms');
    if (saved) {
      setSelectedPlatforms(JSON.parse(saved));
    } else {
      setSelectedPlatforms(content.samplePosts.map(p => p.platform.toLowerCase()));
    }
  }, []);

  const updateNotificationCount = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingEvents = events.filter(event => {
      const eventDate = new Date(event.date);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate >= today;
    });
    localStorage.setItem('notificationCount', String(upcomingEvents.length));
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDayClick = (day: number) => {
    const selected = new Date(year, month, day);
    setSelectedDay(selected);
    setShowAddEvent(false);
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const getEventsForDate = (date: string): CalendarEvent[] => {
    return events.filter(event => event.date === date);
  };

  const handleAddEvent = () => {
    if (selectedDay && newEventTitle.trim()) {
      const newEvent: CalendarEvent = {
        id: Date.now().toString(),
        date: formatDate(selectedDay),
        title: newEventTitle.trim(),
        time: newEventTime || undefined,
        type: 'event',
        description: newEventDescription.trim() || undefined,
      };
      setEvents([...events, newEvent]);
      setNewEventTitle('');
      setNewEventTime('');
      setNewEventDescription('');
      setShowAddEvent(false);
    }
  };

  const handleDeleteEvent = (eventId: string) => {
    if (confirm('Delete this event?')) {
      setEvents(events.filter(e => e.id !== eventId));
    }
  };

  const isToday = (day: number): boolean => {
    const today = new Date();
    return day === today.getDate() &&
           month === today.getMonth() &&
           year === today.getFullYear();
  };

  const isSelected = (day: number): boolean => {
    if (!selectedDay) return false;
    return day === selectedDay.getDate() &&
           month === selectedDay.getMonth() &&
           year === selectedDay.getFullYear();
  };

  const hasEvents = (day: number): boolean => {
    const dateStr = formatDate(new Date(year, month, day));
    return getEventsForDate(dateStr).length > 0;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const calendarDays = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(<div key={`empty-${i}`} className="aspect-square" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(
      <button
        key={day}
        onClick={() => handleDayClick(day)}
        className={`aspect-square p-1 rounded-lg border text-center transition-all relative ${
          isToday(day)
            ? 'border-[#1D4ED8] bg-[#EFF6FF] font-bold text-[#1D4ED8]'
            : isSelected(day)
            ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
            : hasEvents(day)
            ? 'border-[#94A3B8] bg-[#F8FAFC] hover:bg-[#F1F5F9]'
            : 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
        }`}
      >
        <span className="text-sm">{day}</span>
        {hasEvents(day) && (
          <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-[#1D4ED8] rounded-full" />
        )}
      </button>
    );
  }

  const selectedDayEvents = selectedDay ? getEventsForDate(formatDate(selectedDay)) : [];

  return (
    <div className="flex flex-col gap-4 pb-20">
      <h1 className="text-2xl font-bold text-[#0F172A]">Calendar</h1>

      {/* Calendar Month View */}
      <HECard>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={previousMonth}
            className="p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-[#64748B]" />
          </button>
          <h2 className="text-lg font-semibold text-[#0F172A]">
            {monthNames[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-[#64748B] py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays}
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-[#64748B]">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-[#1D4ED8] bg-[#EFF6FF] rounded" />
            <span>Today</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-[#1D4ED8] rounded relative">
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
            </div>
            <span>Has events</span>
          </div>
        </div>
      </HECard>

      {/* Selected Day Events */}
      {selectedDay && (
        <HECard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[#0F172A]">
              {selectedDay.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
              })}
            </h3>
            <button
              onClick={() => setShowAddEvent(!showAddEvent)}
              className="text-[#1D4ED8] text-sm font-medium flex items-center gap-1 hover:underline"
            >
              <Plus className="w-4 h-4" />
              Add Event
            </button>
          </div>

          {showAddEvent && (
            <div className="mb-3 p-3 bg-[#F0F9FF] rounded-lg border border-[#1D4ED8]/20">
              <input
                type="text"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Event title"
                className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8] mb-2"
              />
              <input
                type="time"
                value={newEventTime}
                onChange={(e) => setNewEventTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8] mb-2"
              />
              <textarea
                value={newEventDescription}
                onChange={(e) => setNewEventDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8] resize-none"
                rows={2}
              />
              <div className="flex gap-2 mt-2">
                <HEButton variant="primary" onClick={handleAddEvent}>
                  Add Event
                </HEButton>
                <HEButton
                  variant="secondary"
                  onClick={() => {
                    setShowAddEvent(false);
                    setNewEventTitle('');
                    setNewEventTime('');
                    setNewEventDescription('');
                  }}
                >
                  Cancel
                </HEButton>
              </div>
            </div>
          )}

          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-[#64748B] italic">No events scheduled for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayEvents.map(event => (
                <div
                  key={event.id}
                  className="group p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] hover:border-[#1D4ED8] transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-[#0F172A]">{event.title}</h4>
                        {event.time && (
                          <span className="text-xs text-[#64748B] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {event.time}
                          </span>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-sm text-[#64748B]">{event.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#64748B] hover:text-[#EF4444] rounded transition-opacity"
                      title="Delete event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </HECard>
      )}

      {/* Upcoming Events Summary */}
      <HECard>
        <h3 className="text-lg font-semibold text-[#0F172A] mb-3">Upcoming Events</h3>
        {events.length === 0 ? (
          <p className="text-sm text-[#64748B] italic">
            No upcoming events. Click on a day to add one!
          </p>
        ) : (
          <div className="space-y-2">
            {events
              .filter(event => new Date(event.date) >= new Date(new Date().setHours(0, 0, 0, 0)))
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .slice(0, 5)
              .map(event => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#F8FAFC]"
                >
                  <Calendar className="w-4 h-4 text-[#1D4ED8] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0F172A] truncate">{event.title}</p>
                    <p className="text-xs text-[#64748B]">
                      {new Date(event.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {event.time && ` at ${event.time}`}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </HECard>
    </div>
  );
}
