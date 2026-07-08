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
  const { events, addEvent, removeEvent, removeAllByTitle } = useCalendar();
  const { getToken } = useAuth();
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<'post' | 'task' | 'reminder'>('task');
  const [newEventLink, setNewEventLink] = useState('');
  const [repeatOption, setRepeatOption] = useState<'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'>('none');

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
    setSelectedDay(day);
    setShowModal(true);
  };

  const handleAddEvent = () => {
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
      addEvent({ date, title: newEventTitle.trim(), type: newEventType, link: newEventLink.trim() || undefined });
    }

    setNewEventTitle('');
    setNewEventLink('');
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

      {/* This week's upcoming events */}
      {events.length > 0 && (() => {
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfWeek = new Date(todayDate);
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        const endStr = `${endOfWeek.getFullYear()}-${String(endOfWeek.getMonth() + 1).padStart(2, '0')}-${String(endOfWeek.getDate()).padStart(2, '0')}`;
        const thisWeekEvents = events
          .filter((e) => e.date >= todayStr && e.date <= endStr)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (thisWeekEvents.length === 0) return null;
        return (
          <details className="glass-card" open>
            <summary className="font-semibold text-white cursor-pointer">This Week's Cues</summary>
            <div className="mt-3 max-h-40 overflow-y-auto space-y-2">
              {thisWeekEvents.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${typeColors[e.type]}`}></span>
                    <span className="text-white">{e.title}</span>
                  </div>
                  <span className="text-slate-400 text-xs">{new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                </div>
              ))}
            </div>
          </details>
        );
      })()}

      {/* Day Detail Modal */}
      {showModal && selectedDay !== null && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass-card-strong w-full max-w-sm animate-scale-in max-h-[80vh] overflow-y-auto">
            <h3 className="font-bold text-white mb-1">
              {new Date(currentYear, currentMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>

            {/* Existing events for this day */}
            {(() => {
              const dayEvents = getEventsForDay(selectedDay);
              if (dayEvents.length > 0) {
                return (
                  <div className="space-y-2 mb-4 mt-3">
                    {dayEvents.map((evt) => (
                      <div key={evt.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 shrink-0 rounded-full ${typeColors[evt.type] || 'bg-blue-500'}`} />
                          <span className={`text-sm truncate ${evt.completed ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                            {evt.title}
                          </span>
                          {(evt as any).link && (
                            <a
                              href={(evt as any).link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
                            >
                              🔗
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => removeEvent(evt.id)}
                            className="text-xs text-red-400 hover:text-red-300 px-1"
                            title="Delete this one"
                          >
                            ✕
                          </button>
                          <button
                            onClick={() => removeAllByTitle(evt.title)}
                            className="text-xs text-red-400 hover:text-red-300 px-1"
                            title="Delete all with this name"
                          >
                            ✕ All
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
              return <p className="text-sm text-slate-500 mt-2 mb-4">Nothing scheduled for this day.</p>;
            })()}

            {/* Add new event form (only for future dates) */}
            {isFuture(selectedDay) && (
              <div className="border-t border-white/10 pt-3 mt-3">
                <p className="text-xs text-slate-400 mb-2">Add to this day:</p>
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => { handleAddEvent(); }}
                      disabled={!newEventTitle.trim()}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      + Add Another
                    </button>
                    <button
                      onClick={() => { handleAddEvent(); setShowModal(false); }}
                      disabled={!newEventTitle.trim()}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      Add & Done
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowModal(false)}
              className="w-full mt-3 bg-slate-700 text-slate-300 py-2 rounded-lg hover:bg-slate-600 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
