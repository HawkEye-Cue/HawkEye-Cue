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
  const { events, addEvent, removeEvent, removeAllByTitle } = useCalendar();
  const { getToken, user } = useAuth();
  const { showToast } = useToast();
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<'post' | 'meeting' | 'reminder'>('meeting');
  const [newEventLink, setNewEventLink] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventNotes, setNewEventNotes] = useState('');
  const [newEventInviteEmail, setNewEventInviteEmail] = useState('');
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
    // Only open modal if day has events or is in the future
    const dayEvents = getEventsForDay(day);
    if (!isFuture(day) && dayEvents.length === 0) return;
    setSelectedDay(day);
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
                {/* + button on hover for future days */}
                {future && !isToday && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] text-blue-400 font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-500 pointer-events-none">+ to calendar</span>
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
                    <span>{e.type === 'post' ? '📤' : e.type === 'meeting' || e.type === 'task' ? '🤝' : '🔔'}</span>
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
                          <span className="shrink-0 text-sm">{evt.type === 'post' ? '📤' : evt.type === 'meeting' || evt.type === 'task' ? '🤝' : '🔔'}</span>
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
