import { useState, useEffect } from 'react';
import { useCalendar } from '../contexts/CalendarContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { ScheduledPost } from '@social-lead-gen/shared';
import type { CalendarEvent } from '../contexts/CalendarContext';

type ViewMode = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const { events, addEvent, removeEvent, removeAllByTitle, updateEvent, refreshEvents } = useCalendar();
  const { getToken, user } = useAuth();
  const { showToast } = useToast();
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<'post' | 'meeting' | 'reminder'>('meeting');
  const [newEventLink, setNewEventLink] = useState('');
  const [editingCalEvent, setEditingCalEvent] = useState<CalendarEvent | null>(null);
  const [editCalTitle, setEditCalTitle] = useState('');
  const [editCalTime, setEditCalTime] = useState('');
  const [editCalLocation, setEditCalLocation] = useState('');
  const [editCalLink, setEditCalLink] = useState('');
  const [editCalDate, setEditCalDate] = useState('');

  // Auto-open day from URL query param (e.g. ?day=2026-07-21)
  useEffect(() => {
    // Refresh events from server when calendar page loads
    refreshEvents();
    const params = new URLSearchParams(window.location.search);
    const dayParam = params.get('day');
    if (dayParam) {
      const d = new Date(dayParam + 'T12:00:00');
      if (!isNaN(d.getTime())) {
        setCurrentMonth(d.getMonth());
        setCurrentYear(d.getFullYear());
        setSelectedDay(d.getDate());
        setShowModal(true);
        setShowAddForm(false);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventNotes, setNewEventNotes] = useState('');
  const [newEventInviteEmail, setNewEventInviteEmail] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [repeatOption, setRepeatOption] = useState<'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'>('none');

  // Folio dates for calendar highlighting
  const folioStart = localStorage.getItem('hawkeye_folio_start') || '';
  const folioEnd = localStorage.getItem('hawkeye_folio_end') || '';

  // Fetch real scheduled posts from API
  useEffect(() => {
    async function fetchPosts() {
      try {
        const token = await getToken();
        const client = new ApiClient({
          baseUrl: import.meta.env.VITE_API_URL as string,
          getToken: async () => token,
        });
        const result = await client.getPosts();
        // API returns { posts: [...] } or a flat array
        const posts = Array.isArray(result) ? result : (result as any)?.posts || [];
        setScheduledPosts(posts);
      } catch {
        // ignore
      }
    }
    fetchPosts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const monthName = new Date(currentYear, currentMonth, 1).toLocaleString('default', {
    month: 'long', year: 'numeric',
  });

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const getDateStr = (day: number) => {
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${currentYear}-${mm}-${dd}`;
  };

  const getEventsForDay = (day: number) => {
    const dateStr = getDateStr(day);
    const localEvents = events.filter((e) => e.date === dateStr);
    // Add scheduled posts for this day
    const postEvents = scheduledPosts
      .filter((p) => p.scheduledAt && p.scheduledAt.startsWith(dateStr))
      .map((p) => ({
        id: p.id,
        date: dateStr,
        title: `📤 ${(p.content || 'Scheduled post').slice(0, 40)}`,
        type: 'post' as const,
        completed: p.status === 'published',
      }));
    return [...localEvents, ...postEvents];
  };

  const isFuture = (day: number) => {
    const d = new Date(currentYear, currentMonth, day);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return d >= todayMidnight;
  };

  const handleDayClick = (day: number) => {
    const dayEvents = getEventsForDay(day);
    if (dayEvents.length === 0 && !isFuture(day)) return;
    setSelectedDay(day);
    setShowAddForm(false);
    setShowModal(true);
  };

  const handleAddClick = (day: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDay(day);
    setShowAddForm(true);
    setShowModal(true);
  };

  const handleAddEvent = async () => {
    if (!newEventTitle.trim() || selectedDay === null) return;

    const baseDate = new Date(currentYear, currentMonth, selectedDay);
    const dates: string[] = [];

    // Generate dates based on repeat option
    if (repeatOption === 'none') {
      dates.push(getDateStr(selectedDay));
    } else {
      const count = repeatOption === 'daily' ? 365 : repeatOption === 'weekly' ? 260 : repeatOption === 'biweekly' ? 130 : repeatOption === 'monthly' ? 120 : 50;
      const incrementDays = repeatOption === 'daily' ? 1 : repeatOption === 'weekly' ? 7 : repeatOption === 'biweekly' ? 14 : 0;

      for (let i = 0; i < count; i++) {
        const d = new Date(baseDate);
        if (incrementDays > 0) {
          d.setDate(d.getDate() + (i * incrementDays));
        } else if (repeatOption === 'monthly') {
          d.setMonth(d.getMonth() + i);
        } else if (repeatOption === 'yearly') {
          d.setFullYear(d.getFullYear() + i);
        }
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dates.push(`${d.getFullYear()}-${mm}-${dd}`);
      }
    }

    for (const date of dates) {
      let title = newEventTitle.trim();
      if (newEventTime) {
        title = `[${newEventTime}] ${title}`;
      }
      if (newEventType === 'meeting' && newEventLocation.trim()) {
        title += ` — 📍 ${newEventLocation.trim()}`;
      }
      if (newEventType === 'meeting' && newEventNotes.trim()) {
        title += ` | ${newEventNotes.trim()}`;
      }
      const link = newEventLink.trim() || (newEventType === 'meeting' && newEventLocation.trim() ? `https://maps.google.com/maps?q=${encodeURIComponent(newEventLocation.trim())}` : undefined);
      const eventId = await addEvent({ date, title, type: newEventType, link });

      // Send meeting invite if email provided
      if (newEventType === 'meeting' && newEventInviteEmail.trim()) {
        try {
          const token = await getToken();
          const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
          await client.request('POST', '/calendar/invite', {
            eventId: eventId || undefined,
            email: newEventInviteEmail.trim(),
            meetingTitle: newEventTitle.trim(),
            meetingDate: date,
            meetingTime: newEventTime || undefined,
            location: newEventLocation.trim() || undefined,
            zoomLink: newEventLink.trim() || undefined,
            notes: newEventNotes.trim() || undefined,
          });
          showToast('✉️ Meeting invite sent!');
        } catch (e) {
          console.error('Failed to send invite:', e);
          const msg = e instanceof Error ? e.message : String(e);
          showToast(`❌ Invite failed: ${msg}`);
        }
      }
    }

    localStorage.setItem(`hawkeye_first_event_${user?.sub}`, 'true');
    setNewEventTitle('');
    setNewEventLink('');
    setNewEventLocation('');
    setNewEventNotes('');
    setNewEventInviteEmail('');
    setNewEventTime('');
    setRepeatOption('none');
  };

  const todayStr = (() => {
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${today.getFullYear()}-${mm}-${dd}`;
  })();

  const todayEvents = [
    ...events.filter((e) => e.date === todayStr),
    ...scheduledPosts
      .filter((p) => p.scheduledAt && p.scheduledAt.startsWith(todayStr))
      .map((p) => ({
        id: p.id,
        date: todayStr,
        title: `📤 ${(p.content || 'Scheduled post').slice(0, 50)}`,
        type: 'post' as const,
        completed: p.status === 'published',
      })),
  ];

  const typeColors: Record<string, string> = {
    post: 'bg-blue-500',
    meeting: 'bg-amber-500',
    task: 'bg-amber-500',
    reminder: 'bg-green-500',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-white shrink-0">Calendar</h2>
        <div className="flex gap-1.5 bg-black border-2 border-amber-500 rounded-xl p-2 shadow-xl shadow-amber-500/10">
          {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 sm:px-5 py-2.5 min-h-[44px] rounded-lg text-sm sm:text-base capitalize font-bold transition-all duration-200 ${
                viewMode === mode ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40 scale-[1.02]' : 'text-white bg-slate-500 hover:bg-slate-400 border-2 border-slate-300'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">←</button>
          <h3 className="font-semibold text-white">{monthName}</h3>
          <button onClick={nextMonth} className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">→</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center text-xs text-slate-400 mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="py-1 font-medium sm:hidden">{d}</div>
          ))}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-1 font-medium hidden sm:block">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {Array.from({ length: firstDayOfMonth }, (_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
            const future = isFuture(day);
            const dayEvents = getEventsForDay(day);
            const dateStr = getDateStr(day);
            const isFolioStart = dateStr === folioStart;
            const isFolioEnd = dateStr === folioEnd;
            const isInFolio = folioStart && folioEnd && dateStr >= folioStart && dateStr <= folioEnd;

            return (
              <div
                key={day}
                onClick={() => handleDayClick(day)}
                className={`aspect-square flex flex-col items-center justify-start pt-1 rounded-lg text-sm relative group ${
                  isFolioStart
                    ? 'bg-green-600/30 border border-green-500/50 text-green-300 font-bold'
                    : isFolioEnd
                    ? 'bg-red-600/30 border border-red-500/50 text-red-300 font-bold'
                    : isToday
                    ? 'bg-blue-600 text-white font-bold'
                    : isInFolio
                    ? 'bg-amber-500/10 border border-amber-500/20 text-slate-300 hover:bg-amber-500/20 cursor-pointer'
                    : future
                    ? 'text-slate-300 hover:bg-slate-700 cursor-pointer'
                    : 'text-slate-500 cursor-not-allowed'
                }`}
              >
                <span>{day}</span>
                {isFolioStart && <span className="text-[8px] text-green-400 leading-tight">START</span>}
                {isFolioEnd && <span className="text-[8px] text-red-400 leading-tight">END</span>}
                {dayEvents.length > 0 && (
                  <div className="flex flex-col items-center gap-0 mt-0.5">
                    {(() => {
                      const posts = dayEvents.filter((e) => e.type === 'post');
                      const meetings = dayEvents.filter((e) => e.type === 'meeting' || e.type === 'task');
                      const reminders = dayEvents.filter((e) => e.type === 'reminder');
                      return (
                        <>
                          {posts.length > 0 && <span className="text-[10px] leading-tight">📤{posts.length > 1 ? posts.length : ''}</span>}
                          {meetings.length > 0 && <span className="text-[10px] leading-tight">🤝{meetings.length > 1 ? meetings.length : ''}</span>}
                          {reminders.length > 0 && <span className="text-[10px] leading-tight">🔔{reminders.length > 1 ? reminders.length : ''}</span>}
                        </>
                      );
                    })()}
                  </div>
                )}
                {/* + button for future days */}
                {future && (
                  <button
                    onClick={(e) => handleAddClick(day, e)}
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] bg-blue-600/80 text-white px-1.5 py-0.5 rounded font-bold hover:bg-blue-500 transition-colors"
                  >
                    +
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-3 mt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">📤 Post</span>
          <span className="flex items-center gap-1">🤝 Meeting</span>
          <span className="flex items-center gap-1">🔔 Reminder</span>
        </div>
      </div>

      {/* Day Detail Modal */}
      {showModal && selectedDay !== null && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass-card-strong w-full max-w-md animate-scale-in max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-lg">
                {new Date(currentYear, currentMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            {!showAddForm ? (
              <>
                {/* Day Overview */}
                {(() => {
                  const dayEvents = getEventsForDay(selectedDay);
                  const timedEvents: Record<number, typeof dayEvents> = {};
                  const untimedEvents: typeof dayEvents = [];
                  for (const evt of dayEvents) {
                    const timeMatch = evt.title.match(/^\[(\d{1,2}):(\d{2})\]/);
                    if (timeMatch) {
                      const hour = parseInt(timeMatch[1]);
                      if (!timedEvents[hour]) timedEvents[hour] = [];
                      timedEvents[hour].push(evt);
                    } else {
                      untimedEvents.push(evt);
                    }
                  }
                  const hours = Array.from({ length: 15 }, (_, i) => i + 6);

                  return (
                    <div>
                      {/* Cues tiles - show ALL events for the day (timed + untimed) */}
                      <div className="mb-4">
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Cues</p>
                        <div className="grid grid-cols-3 gap-2">
                          {(() => {
                            const allPosts = dayEvents.filter((e) => e.type === 'post');
                            const allMeetings = dayEvents.filter((e) => e.type === 'meeting' || e.type === 'task');
                            const allReminders = dayEvents.filter((e) => e.type === 'reminder');
                            return (
                              <>
                                <details className="rounded-xl border border-blue-500/30 bg-blue-500/10 overflow-hidden">
                                  <summary className="flex flex-col items-center justify-center p-3 cursor-pointer">
                                    <span className="text-2xl">📤</span>
                                    <span className="text-lg font-bold text-blue-400">{allPosts.length}</span>
                                    <span className="text-[10px] text-slate-400">Posts</span>
                                  </summary>
                                  {allPosts.length > 0 && (
                                    <div className="px-2 pb-2 space-y-1.5 border-t border-blue-500/20 pt-2 max-h-40 overflow-y-auto">
                                      {allPosts.map((evt) => (
                                        <div key={evt.id} className="p-1.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
                                          {(evt as any).link ? (
                                            <a href={(evt as any).link} target="_blank" rel="noopener noreferrer" className={`text-xs block hover:text-blue-300 ${evt.completed ? 'line-through text-slate-600' : 'text-blue-400 underline'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')}</a>
                                          ) : (
                                            <span className={`text-xs block ${evt.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')}</span>
                                          )}
                                          <div className="flex gap-1 mt-1">
                                            <button onClick={(e) => { e.stopPropagation(); const timeMatch = evt.title.match(/^\[(\d{1,2}:\d{2})\]\s*/); let cleanTitle = evt.title; if (timeMatch) cleanTitle = cleanTitle.replace(timeMatch[0], ''); setEditingCalEvent(evt as CalendarEvent); setEditCalTitle(cleanTitle.trim()); setEditCalTime(timeMatch ? timeMatch[1] : ''); setEditCalLocation(''); setEditCalLink((evt as any).link || ''); setEditCalDate(evt.date); }} className="text-[10px] text-slate-400 hover:text-white">✏️</button>
                                            <button onClick={(e) => { e.stopPropagation(); removeEvent(evt.id); }} className="text-[10px] text-red-400 hover:text-red-300">🗑️</button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </details>

                                <details className="rounded-xl border border-amber-500/30 bg-amber-500/10 overflow-hidden">
                                  <summary className="flex flex-col items-center justify-center p-3 cursor-pointer">
                                    <span className="text-2xl">🤝</span>
                                    <span className="text-lg font-bold text-amber-400">{allMeetings.length}</span>
                                    <span className="text-[10px] text-slate-400">Meetings</span>
                                  </summary>
                                  {allMeetings.length > 0 && (
                                    <div className="px-2 pb-2 space-y-1.5 border-t border-amber-500/20 pt-2 max-h-40 overflow-y-auto">
                                      {allMeetings.map((evt) => (
                                        <div key={evt.id} className="p-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                          <span className={`text-xs block ${evt.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')}</span>
                                          {(evt as any).link && <a href={(evt as any).link} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs">🔗</a>}
                                          <div className="flex gap-1 mt-1">
                                            <button onClick={(e) => { e.stopPropagation(); const timeMatch = evt.title.match(/^\[(\d{1,2}:\d{2})\]\s*/); const locationMatch = evt.title.match(/\s*—\s*📍\s*(.+?)(?:\s*\||$)/); let cleanTitle = evt.title; if (timeMatch) cleanTitle = cleanTitle.replace(timeMatch[0], ''); if (locationMatch) cleanTitle = cleanTitle.replace(/\s*—\s*📍.*$/, ''); const notesMatch = cleanTitle.match(/\s*\|\s*(.+)$/); if (notesMatch) cleanTitle = cleanTitle.replace(notesMatch[0], ''); setEditingCalEvent(evt as CalendarEvent); setEditCalTitle(cleanTitle.trim()); setEditCalTime(timeMatch ? timeMatch[1] : ''); setEditCalLocation(locationMatch ? locationMatch[1].trim() : ''); setEditCalLink((evt as any).link || ''); setEditCalDate(evt.date); }} className="text-[10px] text-slate-400 hover:text-white">✏️</button>
                                            <button onClick={(e) => { e.stopPropagation(); removeEvent(evt.id); }} className="text-[10px] text-red-400 hover:text-red-300">🗑️</button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </details>

                                <details className="rounded-xl border border-green-500/30 bg-green-500/10 overflow-hidden">
                                  <summary className="flex flex-col items-center justify-center p-3 cursor-pointer">
                                    <span className="text-2xl">🔔</span>
                                    <span className="text-lg font-bold text-green-400">{allReminders.length}</span>
                                    <span className="text-[10px] text-slate-400">Reminders</span>
                                  </summary>
                                  {allReminders.length > 0 && (
                                    <div className="px-2 pb-2 space-y-1.5 border-t border-green-500/20 pt-2 max-h-40 overflow-y-auto">
                                      {allReminders.map((evt) => (
                                        <div key={evt.id} className="p-1.5 rounded-lg bg-green-500/5 border border-green-500/10">
                                          <span className={`text-xs block ${evt.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')}</span>
                                          {(evt as any).link && <a href={(evt as any).link} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs">🔗</a>}
                                          <div className="flex gap-1 mt-1">
                                            <button onClick={(e) => { e.stopPropagation(); const timeMatch = evt.title.match(/^\[(\d{1,2}:\d{2})\]\s*/); let cleanTitle = evt.title; if (timeMatch) cleanTitle = cleanTitle.replace(timeMatch[0], ''); setEditingCalEvent(evt as CalendarEvent); setEditCalTitle(cleanTitle.trim()); setEditCalTime(timeMatch ? timeMatch[1] : ''); setEditCalLocation(''); setEditCalLink((evt as any).link || ''); setEditCalDate(evt.date); }} className="text-[10px] text-slate-400 hover:text-white">✏️</button>
                                            <button onClick={(e) => { e.stopPropagation(); removeEvent(evt.id); }} className="text-[10px] text-red-400 hover:text-red-300">🗑️</button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </details>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Time Schedule - always visible */}
                      <div>
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Schedule</p>
                        <div className="space-y-0 max-h-[300px] overflow-y-auto">
                          {hours.map((hour) => {
                            const evts = timedEvents[hour] || [];
                            const timeLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                            return (
                              <div key={hour} className={`flex gap-3 py-1.5 border-b border-white/5 ${evts.length > 0 ? '' : ''}`}>
                                <span className={`text-[11px] w-14 shrink-0 pt-0.5 ${evts.length > 0 ? 'text-white font-medium' : 'text-slate-600'}`}>{timeLabel}</span>
                                <div className="flex-1">
                                  {evts.length > 0 ? evts.map((evt) => {
                                    const color = evt.type === 'post' ? 'border-blue-500/30 bg-blue-500/5' : (evt.type === 'meeting' || evt.type === 'task') ? 'border-amber-500/30 bg-amber-500/5' : 'border-green-500/30 bg-green-500/5';
                                    return (
                                      <div key={evt.id} className={`flex items-center gap-2 p-1.5 rounded-lg border ${color} mb-0.5`}>
                                        <span className="text-sm shrink-0">{evt.type === 'post' ? '📤' : (evt.type === 'meeting' || evt.type === 'task') ? '🤝' : '🔔'}</span>
                                        <span className={`text-xs flex-1 ${evt.completed ? 'line-through text-slate-500' : 'text-white'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')}</span>
                                        {(evt as any).link && <a href={(evt as any).link} target="_blank" rel="noopener noreferrer" className="text-blue-400 shrink-0 text-xs">🔗</a>}
                                        <button onClick={(e) => { e.stopPropagation(); const timeMatch = evt.title.match(/^\[(\d{1,2}:\d{2})\]\s*/); const locationMatch = evt.title.match(/\s*—\s*📍\s*(.+?)(?:\s*\||$)/); let cleanTitle = evt.title; if (timeMatch) cleanTitle = cleanTitle.replace(timeMatch[0], ''); if (locationMatch) cleanTitle = cleanTitle.replace(/\s*—\s*📍.*$/, ''); const notesMatch = cleanTitle.match(/\s*\|\s*(.+)$/); if (notesMatch) cleanTitle = cleanTitle.replace(notesMatch[0], ''); setEditingCalEvent(evt as CalendarEvent); setEditCalTitle(cleanTitle.trim()); setEditCalTime(timeMatch ? timeMatch[1] : ''); setEditCalLocation(locationMatch ? locationMatch[1].trim() : ''); setEditCalLink((evt as any).link || ''); setEditCalDate(evt.date); }} className="text-[10px] text-slate-400 hover:text-white shrink-0">✏️</button>
                                        <button onClick={(e) => { e.stopPropagation(); removeEvent(evt.id); }} className="text-[10px] text-red-400 hover:text-red-300 shrink-0">🗑️</button>
                                      </div>
                                    );
                                  }) : (
                                    <div className="h-4"></div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {dayEvents.length === 0 && <p className="text-xs text-slate-500 text-center pt-2">No cues — click + to add</p>}
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                {/* Add Event Form */}
                <button onClick={() => setShowAddForm(false)} className="text-xs text-blue-400 hover:text-blue-300 mb-2 mt-2">← Back to schedule</button>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEvent()}
                    placeholder="What's happening?"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm"
                    autoFocus
                  />
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">⏰ Time (optional)</label>
                    <input
                      type="time"
                      value={newEventTime}
                      onChange={(e) => setNewEventTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                    />
                    {newEventTime && (
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const hour = parseInt(newEventTime.split(':')[0]);
                            if (hour >= 12) {
                              const newHour = hour === 12 ? 0 : hour - 12;
                              setNewEventTime(`${String(newHour).padStart(2, '0')}:${newEventTime.split(':')[1]}`);
                            }
                          }}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${parseInt(newEventTime.split(':')[0]) < 12 ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30 scale-105' : 'bg-slate-700 text-slate-500 hover:bg-slate-600'}`}
                        >
                          ☀️ AM
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const hour = parseInt(newEventTime.split(':')[0]);
                            if (hour < 12) {
                              const newHour = hour === 0 ? 12 : hour + 12;
                              setNewEventTime(`${String(newHour).padStart(2, '0')}:${newEventTime.split(':')[1]}`);
                            }
                          }}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${parseInt(newEventTime.split(':')[0]) >= 12 ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105' : 'bg-slate-700 text-slate-500 hover:bg-slate-600'}`}
                        >
                          🌙 PM
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {(['post', 'meeting', 'reminder'] as const).map((t) => {
                      const colors = { post: 'bg-blue-600 text-white', meeting: 'bg-amber-500 text-black', reminder: 'bg-green-600 text-white' };
                      const dimColors = { post: 'bg-blue-600/30 text-blue-300 border border-blue-500/40', meeting: 'bg-amber-500/30 text-amber-300 border border-amber-500/40', reminder: 'bg-green-600/30 text-green-300 border border-green-500/40' };
                      return (
                      <button
                        key={t}
                        onClick={() => setNewEventType(t)}
                        className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${
                          newEventType === t ? colors[t] : dimColors[t]
                        }`}
                      >
                        {t === 'post' ? '📤 Post' : t === 'meeting' ? '🤝 Meeting' : '🔔 Reminder'}
                      </button>
                      );
                    })}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Repeat</label>
                    <select
                      value={repeatOption}
                      onChange={(e) => setRepeatOption(e.target.value as typeof repeatOption)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                    >
                      <option value="none">Don't repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  {newEventType !== 'meeting' && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Link (optional)</label>
                    <input
                      type="url"
                      value={newEventLink}
                      onChange={(e) => setNewEventLink(e.target.value)}
                      placeholder="https://facebook.com/groups/..."
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm"
                    />
                  </div>
                  )}
                  {/* Meeting-specific fields */}
                  {newEventType === 'meeting' && (
                    <>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">📍 Location (optional)</label>
                        <input
                          type="text"
                          value={newEventLocation}
                          onChange={(e) => setNewEventLocation(e.target.value)}
                          placeholder="e.g. 123 Main St, Denver CO"
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm"
                        />
                        {newEventLocation.trim() && (
                          <a
                            href={`https://maps.google.com/maps?q=${encodeURIComponent(newEventLocation.trim())}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                          >
                            🗺️ Open in Maps →
                          </a>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">🔗 Zoom / Video Link (optional)</label>
                        <input
                          type="url"
                          value={newEventLink}
                          onChange={(e) => setNewEventLink(e.target.value)}
                          placeholder="https://zoom.us/j/..."
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">📝 Notes (optional)</label>
                        <textarea
                          value={newEventNotes}
                          onChange={(e) => setNewEventNotes(e.target.value)}
                          placeholder="Meeting notes, agenda, who to meet..."
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm resize-none h-16"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">✉️ Send Invite To (optional)</label>
                        <input
                          type="email"
                          value={newEventInviteEmail}
                          onChange={(e) => setNewEventInviteEmail(e.target.value)}
                          placeholder="client@email.com"
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">They'll receive an email to confirm the meeting</p>
                      </div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { handleAddEvent(); }}
                      disabled={!newEventTitle.trim()}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      + Add Another
                    </button>
                    <button
                      onClick={() => { handleAddEvent(); setShowModal(false); setShowAddForm(false); }}
                      disabled={!newEventTitle.trim()}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      Add & Done
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              onClick={() => { setShowModal(false); setShowAddForm(false); }}
              className="w-full mt-3 bg-slate-700 text-slate-300 py-2 rounded-lg hover:bg-slate-600 text-sm"
            >
              Close
            </button>

            {/* Day Notes */}
            {selectedDay !== null && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-xs text-slate-400 font-semibold mb-1.5">📝 Notes</p>
                <textarea
                  defaultValue={localStorage.getItem(`hawkeye_notepad_${user?.sub}_${getDateStr(selectedDay)}`) || ''}
                  onBlur={(e) => {
                    const val = e.target.value;
                    const dateKey = getDateStr(selectedDay!);
                    localStorage.setItem(`hawkeye_notepad_${user?.sub}_${dateKey}`, val);
                    getToken().then((token) => {
                      if (!token) return;
                      const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                      client.request('PUT', '/profile/preferences', { [`notepad_${dateKey}`]: val }).catch(() => {});
                    });
                  }}
                  placeholder="Notes for this day..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 resize-none h-20 focus:border-blue-500/50 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editingCalEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] px-4">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-lg">✏️ Edit Event</h3>
              <button onClick={() => setEditingCalEvent(null)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Title</label>
                <input type="text" value={editCalTitle} onChange={(e) => setEditCalTitle(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">📅 Date</label>
                <input type="date" value={editCalDate} onChange={(e) => setEditCalDate(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">⏰ Time</label>
                <input type="time" value={editCalTime} onChange={(e) => setEditCalTime(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" />
                {editCalTime && (
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => { const hour = parseInt(editCalTime.split(':')[0]); if (hour >= 12) { const nh = hour === 12 ? 0 : hour - 12; setEditCalTime(`${String(nh).padStart(2, '0')}:${editCalTime.split(':')[1]}`); } }} className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${parseInt(editCalTime.split(':')[0]) < 12 ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30 scale-105' : 'bg-slate-700 text-slate-500 hover:bg-slate-600'}`}>☀️ AM</button>
                    <button type="button" onClick={() => { const hour = parseInt(editCalTime.split(':')[0]); if (hour < 12) { const nh = hour === 0 ? 12 : hour + 12; setEditCalTime(`${String(nh).padStart(2, '0')}:${editCalTime.split(':')[1]}`); } }} className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${parseInt(editCalTime.split(':')[0]) >= 12 ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105' : 'bg-slate-700 text-slate-500 hover:bg-slate-600'}`}>🌙 PM</button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">📍 Location</label>
                <input type="text" value={editCalLocation} onChange={(e) => setEditCalLocation(e.target.value)} placeholder="e.g. 123 Main St" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">🔗 Link</label>
                <input type="url" value={editCalLink} onChange={(e) => setEditCalLink(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={async () => {
                    let newTitle = editCalTitle.trim();
                    if (editCalTime) newTitle = `[${editCalTime}] ${newTitle}`;
                    if (editCalLocation.trim()) newTitle += ` — 📍 ${editCalLocation.trim()}`;
                    const link = editCalLink.trim() || (editCalLocation.trim() ? `https://maps.google.com/maps?q=${encodeURIComponent(editCalLocation.trim())}` : '');
                    await updateEvent(editingCalEvent.id, { title: newTitle, date: editCalDate, link: link || undefined });
                    setEditingCalEvent(null);
                  }}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-sm transition-all active:scale-95"
                >
                  ✓ Save
                </button>
                <button
                  onClick={() => { if (confirm('Delete this event?')) { removeEvent(editingCalEvent.id); setEditingCalEvent(null); } }}
                  className="px-4 py-2.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-bold rounded-lg text-sm transition-all active:scale-95 border border-red-500/30"
                >
                  🗑️
                </button>
              </div>
              <button onClick={() => setEditingCalEvent(null)} className="w-full py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
