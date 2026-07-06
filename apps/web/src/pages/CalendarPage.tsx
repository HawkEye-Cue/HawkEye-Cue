import { useState, useEffect } from 'react';
import { useCalendar } from '../contexts/CalendarContext';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { ScheduledPost } from '@social-lead-gen/shared';
import type { CalendarEvent } from '../contexts/CalendarContext';

type ViewMode = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const { events, addEvent } = useCalendar();
  const { getToken } = useAuth();
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<'post' | 'task' | 'reminder'>('task');

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
    if (!isFuture(day)) return;
    setSelectedDay(day);
    setShowModal(true);
  };

  const handleAddEvent = () => {
    if (!newEventTitle.trim() || selectedDay === null) return;
    addEvent({
      date: getDateStr(selectedDay),
      title: newEventTitle.trim(),
      type: newEventType,
    });
    setNewEventTitle('');
    setShowModal(false);
  };

  const todayEvents = events.filter((e) => e.date === getDateStr(today.getDate()) &&
    currentMonth === today.getMonth() && currentYear === today.getFullYear());

  const typeColors: Record<string, string> = {
    post: 'bg-blue-500',
    task: 'bg-amber-500',
    reminder: 'bg-green-500',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-white shrink-0">Calendar</h2>
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
          {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2 sm:px-3 py-1.5 min-h-[36px] rounded text-xs sm:text-sm capitalize transition-all duration-200 ${
                viewMode === mode ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-600/20' : 'text-slate-400 hover:text-white'
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

            return (
              <div
                key={day}
                onClick={() => handleDayClick(day)}
                className={`aspect-square flex flex-col items-center justify-start pt-1 rounded-lg text-sm relative group ${
                  isToday
                    ? 'bg-blue-600 text-white font-bold'
                    : future
                    ? 'text-slate-300 hover:bg-slate-700 cursor-pointer'
                    : 'text-slate-500 cursor-not-allowed'
                }`}
              >
                <span>{day}</span>
                {dayEvents.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${typeColors[e.type]}`} />
                    ))}
                  </div>
                )}
                {/* + button on hover for future days */}
                {future && !isToday && (
                  <span className="absolute bottom-0.5 right-0.5 text-xs text-slate-500 group-hover:text-blue-400 hidden group-hover:block">+</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-3 mt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> Post</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Task</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> Reminder</span>
        </div>
      </div>

      {/* Today's scheduled items */}
      <div className="glass-card">
        <h3 className="font-semibold mb-3 text-white">Today's Items</h3>
        {todayEvents.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing scheduled for today. Click a future date to add something!</p>
        ) : (
          <div className="space-y-2">
            {todayEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${typeColors[e.type]}`}></span>
                <span className="text-white">{e.title}</span>
                <span className="text-slate-500 capitalize text-xs">({e.type})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All upcoming events */}
      {events.length > 0 && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3 text-white">Upcoming</h3>
          <div className="space-y-2">
            {events
              .filter((e) => e.date >= getDateStr(today.getDate()))
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${typeColors[e.type]}`}></span>
                    <span className="text-white">{e.title}</span>
                  </div>
                  <span className="text-slate-400 text-xs">{new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {showModal && selectedDay !== null && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass-card-strong w-full max-w-sm animate-scale-in">
            <h3 className="font-bold text-white mb-1">Add to Calendar</h3>
            <p className="text-sm text-slate-400 mb-4">
              {new Date(currentYear, currentMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            <div className="space-y-3">
              <input
                type="text"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddEvent()}
                placeholder="What's happening? (e.g. Post about spring deals)"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm"
                autoFocus
              />

              <div className="flex gap-2">
                {(['post', 'task', 'reminder'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewEventType(t)}
                    className={`flex-1 py-1.5 rounded-lg text-sm capitalize ${
                      newEventType === t ? `${typeColors[t]} text-white font-medium` : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleAddEvent}
                disabled={!newEventTitle.trim()}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-slate-700 text-slate-300 py-2 rounded-lg hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
