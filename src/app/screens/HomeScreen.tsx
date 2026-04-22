import { useState, useEffect } from 'react';
import { HEButton, HECard, StatCard, ChecklistItem } from '../components/DesignSystem';
import { tradeContent, trades } from '../data/tradeData';
import { Plus, Edit2, Trash2, X, Check } from 'lucide-react';

interface HomeScreenProps {
  tradeId: string;
  onNavigate: (page: string) => void;
}

interface CueTask {
  id: string;
  text: string;
  time: string;
  completed: boolean;
}

export function HomeScreen({ tradeId, onNavigate }: HomeScreenProps) {
  const content = tradeContent[tradeId];
  const currentTrade = trades.find(t => t.id === tradeId);

  const [tasks, setTasks] = useState<CueTask[]>([]);

  // Load tasks including calendar events
  useEffect(() => {
    const loadTasks = () => {
      // Start with default cues
      const defaultTasks = content.todaysCues.map((cue, idx) => ({
        id: `default-${idx + 1}`,
        text: cue.text,
        time: cue.time,
        completed: false,
      }));

      // Load today's calendar events
      const eventsStr = localStorage.getItem(`calendarEvents_${tradeId}`);
      const calendarTasks: CueTask[] = [];

      if (eventsStr) {
        const events = JSON.parse(eventsStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayEvents = events.filter((event: any) => {
          const eventDate = new Date(event.date);
          eventDate.setHours(0, 0, 0, 0);
          return eventDate.getTime() === today.getTime();
        });

        todayEvents.forEach((event: any, idx: number) => {
          calendarTasks.push({
            id: `calendar-${event.id}`,
            text: `📅 ${event.title}`,
            time: event.time || 'All day',
            completed: false,
          });
        });
      }

      // Combine calendar events first, then default tasks
      setTasks([...calendarTasks, ...defaultTasks]);
    };

    loadTasks();

    // Refresh tasks every minute to catch new calendar events
    const interval = setInterval(loadTasks, 60000);
    return () => clearInterval(interval);
  }, [tradeId, content.todaysCues]);

  // Notes state management
  const [notes, setNotes] = useState<string[]>([]);
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');

  // Load notes from localStorage or use defaults
  useEffect(() => {
    const saved = localStorage.getItem(`notes_${tradeId}`);
    if (saved) {
      setNotes(JSON.parse(saved));
    } else {
      setNotes([...content.notes]);
    }
  }, [tradeId, content.notes]);

  // Save notes to localStorage whenever they change
  useEffect(() => {
    if (notes.length >= 0) {
      localStorage.setItem(`notes_${tradeId}`, JSON.stringify(notes));
    }
  }, [notes, tradeId]);

  const toggleTask = (id: string) => {
    setTasks(tasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const handleAddNote = () => {
    if (newNoteText.trim()) {
      setNotes([...notes, newNoteText.trim()]);
      setNewNoteText('');
      setShowAddNote(false);
    }
  };

  const handleEditNote = (index: number) => {
    setEditingNoteIndex(index);
    setEditingNoteText(notes[index]);
  };

  const handleSaveNote = () => {
    if (editingNoteIndex !== null && editingNoteText.trim()) {
      const updatedNotes = [...notes];
      updatedNotes[editingNoteIndex] = editingNoteText.trim();
      setNotes(updatedNotes);
      setEditingNoteIndex(null);
      setEditingNoteText('');
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteIndex(null);
    setEditingNoteText('');
  };

  const handleDeleteNote = (index: number) => {
    if (confirm('Delete this note?')) {
      setNotes(notes.filter((_, i) => i !== index));
    }
  };

  const activeTasks = tasks.filter(t => !t.completed).length;
  const calendarTasksCount = tasks.filter(t => t.id.startsWith('calendar-')).length;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-xl text-2xl"
          style={{ backgroundColor: currentTrade?.bgColor }}
        >
          {currentTrade?.icon}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[#0F172A]">🦅 HawkEye-Cue</h1>
          <p className="text-base text-[#64748B]">Good morning!</p>
        </div>
      </div>

      <HECard className="bg-gradient-to-r from-[#F59E0B] to-[#F97316] text-white border-none">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-2xl">👑</span>
          <div className="flex-1">
            <h3 className="font-bold mb-1">Beta Founders Special - Only $15/mo</h3>
            <p className="text-sm opacity-90">Lock in this price for 12 months - Only 12 spots left!</p>
          </div>
        </div>
        <HEButton
          variant="secondary"
          className="w-full bg-white text-[#F59E0B] hover:bg-gray-50"
          onClick={() => onNavigate('pricing')}
        >
          Claim Your Spot →
        </HEButton>
      </HECard>

      <HECard>
        <h2 className="text-lg font-semibold text-[#0F172A] mb-2">🦅 Your Daily Cue</h2>
        <p className="text-base text-[#0F172A] mb-2">
          📢 <strong>Post Idea:</strong> {content.dailyCue.postIdea}
        </p>
        <p className="text-base text-[#0F172A] mb-2">
          👥 <strong>Territory:</strong> {content.dailyCue.territory}
        </p>
        <p className="text-base text-[#0F172A] mb-3">
          💬 <strong>Action:</strong> {content.dailyCue.action}
        </p>
        <div className="flex gap-2">
          <HEButton variant="primary" onClick={() => onNavigate('create')}>
            Use This Post
          </HEButton>
          <HEButton variant="secondary">Skip</HEButton>
        </div>
      </HECard>

      <div className="flex gap-3">
        <StatCard value="4" label="Opportunities" />
        <StatCard value="6" label="Posts" />
      </div>

      <HECard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">🔥 Today's Cues</h2>
          {activeTasks === 0 ? (
            <span className="text-xs text-[#22C55E] font-medium">✓ All done!</span>
          ) : calendarTasksCount > 0 ? (
            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs text-[#1D4ED8] hover:underline"
            >
              View Calendar →
            </button>
          ) : null}
        </div>
        {calendarTasksCount > 0 && (
          <p className="text-xs text-[#64748B] mb-2">
            📅 {calendarTasksCount} calendar event{calendarTasksCount !== 1 ? 's' : ''} today
          </p>
        )}
        <div className="space-y-1">
          {tasks.map(task => (
            <ChecklistItem
              key={task.id}
              text={task.text}
              time={task.time}
              completed={task.completed}
              onToggle={() => toggleTask(task.id)}
            />
          ))}
        </div>
      </HECard>

      <HEButton variant="primary" onClick={() => onNavigate('create')}>
        + Create Post
      </HEButton>

      <HECard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">📌 Notes</h2>
          <button
            onClick={() => setShowAddNote(!showAddNote)}
            className="text-[#1D4ED8] text-sm font-medium flex items-center gap-1 hover:underline"
          >
            <Plus className="w-4 h-4" />
            Add Note
          </button>
        </div>

        {showAddNote && (
          <div className="mb-3 p-3 bg-[#F0F9FF] rounded-lg border border-[#1D4ED8]/20">
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Type your note here..."
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8] resize-none"
              rows={3}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddNote}
                className="px-3 py-1.5 bg-[#1D4ED8] text-white text-sm font-medium rounded-lg hover:bg-[#1E40AF] flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddNote(false);
                  setNewNoteText('');
                }}
                className="px-3 py-1.5 text-[#64748B] text-sm font-medium rounded-lg hover:bg-[#F1F5F9]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-sm text-[#64748B] italic">No notes yet. Click "Add Note" to create one.</p>
        ) : (
          <div className="space-y-2">
            {notes.map((note, idx) => (
              <div key={idx}>
                {editingNoteIndex === idx ? (
                  <div className="p-2 bg-[#F0F9FF] rounded-lg border border-[#1D4ED8]/20">
                    <textarea
                      value={editingNoteText}
                      onChange={(e) => setEditingNoteText(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8] resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleSaveNote}
                        className="px-3 py-1.5 bg-[#1D4ED8] text-white text-sm font-medium rounded-lg hover:bg-[#1E40AF] flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 text-[#64748B] text-sm font-medium rounded-lg hover:bg-[#F1F5F9]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="group flex items-start gap-2 p-2 rounded-lg hover:bg-[#F1F5F9] transition-colors">
                    <p className="flex-1 text-base text-[#64748B]">{note}</p>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditNote(idx)}
                        className="p-1 text-[#64748B] hover:text-[#1D4ED8] rounded"
                        title="Edit note"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(idx)}
                        className="p-1 text-[#64748B] hover:text-[#EF4444] rounded"
                        title="Delete note"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </HECard>
    </div>
  );
}
