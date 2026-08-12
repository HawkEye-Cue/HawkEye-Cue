import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCalendar } from '../contexts/CalendarContext';
import { useToast } from '../contexts/ToastContext';

interface FlockGroup {
  id: string;
  name: string;
  link: string;
  postingDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  anyday: boolean;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function FlockGroupManager({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { addEvent, events, removeAllByTitle } = useCalendar();
  const { showToast } = useToast();

  const storageKey = `hawkeye_flock_groups_${user?.sub}`;
  const jumbleKey = `hawkeye_flock_jumble_${user?.sub}`;

  const [groups, setGroups] = useState<FlockGroup[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [jumbleAnyday, setJumbleAnyday] = useState(() => localStorage.getItem(jumbleKey) === 'true');
  const [newName, setNewName] = useState('');
  const [newLink, setNewLink] = useState('');
  const [newDays, setNewDays] = useState<number[]>([]);
  const [newAnyday, setNewAnyday] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Save groups whenever they change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem(jumbleKey, jumbleAnyday ? 'true' : 'false');
  }, [jumbleAnyday]);

  function handleAddGroup() {
    if (!newName.trim()) return;
    if (!newAnyday && newDays.length === 0) {
      showToast('Pick at least one posting day or toggle "Any Day"');
      return;
    }
    const group: FlockGroup = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim(),
      link: newLink.trim(),
      postingDays: newAnyday ? [] : [...newDays].sort(),
      anyday: newAnyday,
    };
    setGroups([...groups, group]);
    setNewName('');
    setNewLink('');
    setNewDays([]);
    setNewAnyday(false);
    showToast('✓ Group added');
  }

  function handleRemoveGroup(id: string) {
    setGroups(groups.filter((g) => g.id !== id));
  }

  function toggleDay(day: number) {
    if (newAnyday) return;
    setNewDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  }

  // Schedule flocks for the week based on group day assignments
  async function scheduleFlocks() {
    const today = new Date();
    const todayDay = today.getDay(); // 0=Sun
    let scheduled = 0;

    // Determine which anyday groups go where (jumble logic)
    const anydayGroups = groups.filter((g) => g.anyday);
    const fixedGroups = groups.filter((g) => !g.anyday);

    // Schedule fixed groups for the next 7 days
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      const dayOfWeek = date.getDay();
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      // Skip Sundays
      if (dayOfWeek === 0) continue;

      // Add fixed groups for this day
      for (const group of fixedGroups) {
        if (group.postingDays.includes(dayOfWeek)) {
          // Check if already scheduled
          const alreadyExists = events.some((e) => e.date === dateStr && e.title === group.name && e.type === 'post');
          if (!alreadyExists) {
            await addEvent({ date: dateStr, title: group.name, type: 'post', link: group.link || undefined });
            scheduled++;
          }
        }
      }
    }

    // Schedule anyday groups across weekdays
    if (anydayGroups.length > 0) {
      const weekdays = [1, 2, 3, 4, 5, 6]; // Mon-Sat
      let dayAssignments: number[];

      if (jumbleAnyday) {
        // Jumble: randomize which days anyday groups land on
        const shuffled = [...weekdays].sort(() => Math.random() - 0.5);
        dayAssignments = anydayGroups.map((_, i) => shuffled[i % shuffled.length]);
      } else {
        // Spread evenly across weekdays
        dayAssignments = anydayGroups.map((_, i) => weekdays[i % weekdays.length]);
      }

      for (let i = 0; i < anydayGroups.length; i++) {
        const group = anydayGroups[i];
        const targetDay = dayAssignments[i];

        // Find the next occurrence of targetDay within the next 7 days
        for (let offset = 0; offset < 7; offset++) {
          const date = new Date(today);
          date.setDate(date.getDate() + offset);
          if (date.getDay() === targetDay) {
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const alreadyExists = events.some((e) => e.date === dateStr && e.title === group.name && e.type === 'post');
            if (!alreadyExists) {
              await addEvent({ date: dateStr, title: group.name, type: 'post', link: group.link || undefined });
              scheduled++;
            }
            break;
          }
        }
      }
    }

    if (scheduled > 0) {
      showToast(`✓ Scheduled ${scheduled} flock${scheduled !== 1 ? 's' : ''} for this week`);
    } else {
      showToast('All flocks already scheduled for this week');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center z-[9999] px-3 py-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">🦅 Manage Flock Groups</h2>
            <p className="text-[10px] text-slate-400">{groups.length} group{groups.length !== 1 ? 's' : ''} saved</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl px-2">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Add New Group */}
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-3">
            <p className="text-xs font-medium text-white">+ Add a Group</p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Group name (e.g. Local Moms of Springfield)"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
            />
            <input
              type="url"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="Facebook group link (optional)"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
            />

            {/* Day picker */}
            <div>
              <p className="text-[10px] text-slate-400 mb-1.5">Which days does this group allow business posts?</p>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    disabled={newAnyday}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                      newAnyday
                        ? 'bg-slate-700 text-slate-600 cursor-not-allowed'
                        : newDays.includes(i)
                          ? 'bg-amber-500 text-black shadow-md shadow-amber-500/30'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white'
                    }`}
                  >
                    {DAY_LABELS_SHORT[i]}
                  </button>
                ))}
              </div>
            </div>

            {/* Any Day toggle */}
            <label className="flex items-center justify-between p-2 bg-slate-800 rounded-lg cursor-pointer">
              <span className="text-xs text-slate-300">Any Day — post whenever</span>
              <input
                type="checkbox"
                checked={newAnyday}
                onChange={(e) => { setNewAnyday(e.target.checked); if (e.target.checked) setNewDays([]); }}
                className="w-5 h-5 rounded accent-amber-500"
              />
            </label>

            <button
              onClick={handleAddGroup}
              disabled={!newName.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors"
            >
              + Add Group
            </button>
          </div>

          {/* Jumble Toggle */}
          {groups.some((g) => g.anyday) && (
            <label className="flex items-center justify-between p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl cursor-pointer">
              <div>
                <p className="text-xs font-medium text-purple-300">🔀 Jumble "Any Day" Groups</p>
                <p className="text-[10px] text-slate-400">Rotates any-day groups to different days each week so they don't stay stuck on the same day</p>
              </div>
              <input
                type="checkbox"
                checked={jumbleAnyday}
                onChange={(e) => setJumbleAnyday(e.target.checked)}
                className="w-5 h-5 rounded accent-purple-500 shrink-0 ml-2"
              />
            </label>
          )}

          {/* Groups List */}
          {groups.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">No groups yet. Add your Facebook groups above.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-white">Your Groups ({groups.length})</p>
              {groups.map((group) => {
                const isEditing = editingId === group.id;
                return (
                  <div key={group.id} className="bg-slate-800 border border-white/10 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-medium truncate">{group.name}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {group.anyday ? (
                            <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">Any Day</span>
                          ) : (
                            group.postingDays.map((d) => (
                              <span key={d} className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                                {DAY_LABELS[d]}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      {group.link && (
                        <a href={group.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs hover:text-blue-300 shrink-0">↗</a>
                      )}
                      <button onClick={() => setEditingId(isEditing ? null : group.id)} className="text-xs text-blue-400 hover:text-blue-300 shrink-0">
                        {isEditing ? '✓' : '✏️'}
                      </button>
                      <button onClick={() => handleRemoveGroup(group.id)} className="text-red-400 hover:text-red-300 text-xs shrink-0">✕</button>
                    </div>
                    {/* Inline edit */}
                    {isEditing && (
                      <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2">
                        <input
                          type="text"
                          defaultValue={group.name}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val) setGroups(groups.map((g) => g.id === group.id ? { ...g, name: val } : g));
                          }}
                          className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs"
                        />
                        <input
                          type="url"
                          defaultValue={group.link}
                          placeholder="Group link"
                          onBlur={(e) => setGroups(groups.map((g) => g.id === group.id ? { ...g, link: e.target.value.trim() } : g))}
                          className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs placeholder-slate-500"
                        />
                        <div className="flex gap-1">
                          {DAY_LABELS.map((label, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                const g = groups.find((x) => x.id === group.id);
                                if (!g || g.anyday) return;
                                const days = g.postingDays.includes(i) ? g.postingDays.filter((d) => d !== i) : [...g.postingDays, i];
                                setGroups(groups.map((x) => x.id === group.id ? { ...x, postingDays: days.sort() } : x));
                              }}
                              disabled={group.anyday}
                              className={`flex-1 py-1.5 rounded text-[9px] font-bold transition-all ${
                                group.anyday ? 'bg-slate-700 text-slate-600' :
                                group.postingDays.includes(i) ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                              }`}
                            >
                              {DAY_LABELS_SHORT[i]}
                            </button>
                          ))}
                        </div>
                        <label className="flex items-center justify-between p-1.5 bg-slate-700 rounded cursor-pointer">
                          <span className="text-[10px] text-slate-300">Any Day</span>
                          <input
                            type="checkbox"
                            checked={group.anyday}
                            onChange={(e) => setGroups(groups.map((g) => g.id === group.id ? { ...g, anyday: e.target.checked, postingDays: e.target.checked ? [] : g.postingDays } : g))}
                            className="w-4 h-4 rounded accent-amber-500"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 space-y-2 shrink-0">
          <button
            onClick={scheduleFlocks}
            disabled={groups.length === 0}
            className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-sm font-bold rounded-lg disabled:opacity-50 hover:opacity-90 transition-all"
          >
            📅 Schedule This Week's Flocks
          </button>
          <button onClick={onClose} className="w-full py-2 text-slate-400 text-xs hover:text-white transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
