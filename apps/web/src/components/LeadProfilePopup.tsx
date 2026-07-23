import { useState, useEffect, useRef } from 'react';
import type { Opportunity, OpportunityStatus } from '@social-lead-gen/shared';
import { MEMBER_COLORS } from '../hooks/useTeamData';

export interface FollowupStep {
  idx: number;
  day: number;
  type: 'call' | 'sms' | 'email';
  task: string;
  completed: boolean;
}

export interface LeadProfilePopupProps {
  lead: Opportunity;
  followupSteps: FollowupStep[];
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate: (leadId: string, status: OpportunityStatus) => Promise<void>;
  onFollowupComplete: (leadId: string, stepIdx: number) => Promise<void>;
  onDelete: (leadId: string) => Promise<void>;
  onEdit: (lead: Opportunity) => void;
  updatingId: string | null;
}

const platformIcons: Record<string, string> = {
  facebook: '📘',
  instagram: '📷',
  linkedin: '💼',
  tiktok: '🎵',
  nextdoor: '🏡',
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-900/40 text-blue-400 border-blue-500/20',
  followed_up: 'bg-yellow-900/40 text-yellow-400 border-yellow-500/20',
  converted: 'bg-green-900/40 text-green-400 border-green-500/20',
  dismissed: 'bg-slate-900/40 text-slate-400 border-slate-500/20',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
}

interface ActivityNote {
  text: string;
  date: string;
}

function readNotes(leadId: string): ActivityNote[] {
  try {
    const raw = localStorage.getItem(`hawkeye_lead_notes_${leadId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export default function LeadProfilePopup({
  lead,
  followupSteps,
  isOpen,
  onClose,
  onStatusUpdate,
  onFollowupComplete,
  onDelete,
  onEdit,
  updatingId,
}: LeadProfilePopupProps) {
  const [notes, setNotes] = useState<ActivityNote[]>(() => readNotes(lead.id));
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus management: capture previously focused element and focus close button on open
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Focus the close button after render
      setTimeout(() => closeButtonRef.current?.focus(), 0);
    } else if (previousActiveElement.current) {
      previousActiveElement.current.focus();
      previousActiveElement.current = null;
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Info Grid computed values
  const localDataRaw = (() => { try { const raw = localStorage.getItem(`hawkeye_lead_data_${(lead as any).userId || ''}`); return raw ? JSON.parse(raw) : {}; } catch { return {}; } })();
  const leadKey = (lead.sourceAuthor || '').toLowerCase();
  const localData = localDataRaw[leadKey] || {};
  const assignee = (lead as any).assignedTo || localData.assignedTo || '';
  const premium = (lead as any).expectedPremium || localData.expectedPremium || 0;
  const displayNames = (() => { try { const raw = localStorage.getItem('hawkeye_display_names'); return raw ? JSON.parse(raw) : {}; } catch { return {}; } })();
  const producerName = assignee ? (displayNames[assignee] || assignee.split('@')[0]) : '—';
  const completedSteps = followupSteps.filter(s => s.completed).length;
  const totalSteps = followupSteps.length;
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const statusLabel = lead.status === 'followed_up' ? 'Followed Up' : lead.status === 'converted' ? 'Converted' : 'New';

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="glass-card-strong w-full max-w-md max-h-[90vh] overflow-y-auto animate-scale-in relative"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          className="absolute top-3 right-3 text-slate-400 hover:text-white text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none rounded"
          onClick={onClose}
          aria-label="Close lead profile"
        >
          ✕
        </button>

        {/* Avatar Header */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mt-2"
          style={{ backgroundColor: getAvatarColor(lead.sourceAuthor) }}
        >
          <span className="text-white font-bold">{getInitials(lead.sourceAuthor)}</span>
        </div>
        <p className="text-center text-lg font-semibold text-white mt-2">{lead.sourceAuthor}</p>
        {(lead as any).policyType && (
          <p className="text-center mt-1">
            <span className="text-xs font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
              {(lead as any).policyType}
            </span>
          </p>
        )}

        {/* Info Grid */}
        <div className="grid grid-cols-3 gap-3 mt-4 px-2">
          {/* Status */}
          <div className="text-center">
            <p className="text-[10px] text-slate-400 mb-0.5">📊 Status</p>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[lead.status]}`}>{statusLabel}</span>
          </div>
          {/* Producer */}
          <div className="text-center">
            <p className="text-[10px] text-slate-400 mb-0.5">👤 Producer</p>
            <p className="text-xs text-white font-medium truncate">{producerName}</p>
          </div>
          {/* Premium */}
          <div className="text-center">
            <p className="text-[10px] text-slate-400 mb-0.5">💰 Premium</p>
            <p className="text-xs text-green-400 font-medium">{premium ? `$${Number(premium).toLocaleString()}` : '—'}</p>
          </div>
          {/* Source */}
          <div className="text-center">
            <p className="text-[10px] text-slate-400 mb-0.5">{platformIcons[lead.sourcePlatform] || '📱'} Source</p>
            <p className="text-xs text-white">{lead.sourcePlatform || '—'}</p>
          </div>
          {/* Date */}
          <div className="text-center">
            <p className="text-[10px] text-slate-400 mb-0.5">📅 Date</p>
            <p className="text-xs text-white">{new Date(lead.detectedAt || (lead as any).createdAt).toLocaleDateString()}</p>
          </div>
          {/* Flight Progress */}
          <div className="text-center">
            <p className="text-[10px] text-slate-400 mb-0.5">🦅 Flight</p>
            <p className="text-xs text-white">{completedSteps}/{totalSteps} ({progress}%)</p>
            <div className="w-full h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-400 to-green-400 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {/* Next Step Card */}
        {(() => {
          const nextStep = followupSteps.find(s => !s.completed);
          if (!nextStep) return null;
          return (
            <div className="mt-4 mx-2 flex items-center gap-2 bg-blue-500/15 border border-blue-500/30 rounded-lg px-3 py-2">
              <span className="text-sm">{nextStep.type === 'call' ? '📞' : nextStep.type === 'sms' ? '💬' : '✉️'}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-blue-200 font-medium">Next: {nextStep.task}</span>
                <span className="text-[10px] text-slate-400 ml-1.5">Day {nextStep.day}</span>
              </div>
              <button
                onClick={() => onFollowupComplete(lead.id, nextStep.idx)}
                className="text-xs text-green-400 bg-green-600/20 px-2.5 py-1 rounded font-medium hover:bg-green-600/30 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                Done ✓
              </button>
            </div>
          );
        })()}

        {/* Activity Log */}
        <div className="mt-4 px-2">
          <p className="text-xs text-white font-semibold mb-2">📝 Activity Log</p>
          {/* Existing notes */}
          {notes.length > 0 && (
            <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
              {notes.map((note, idx) => (
                <div key={idx} className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-slate-500 mb-0.5">{note.date}</p>
                  <p className="text-xs text-slate-200">{note.text}</p>
                </div>
              ))}
            </div>
          )}
          {/* New note input */}
          <div className="flex gap-2">
            <textarea
              ref={noteInputRef}
              placeholder="Add a note..."
              className="flex-1 px-3 py-2 bg-slate-800 border border-white/20 rounded-lg text-white text-xs placeholder-slate-500 resize-none h-16 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                const input = noteInputRef.current;
                if (!input || !input.value.trim()) return;
                const text = input.value.trim();
                const now = new Date();
                const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const newNote: ActivityNote = { text, date: dateStr };
                const updated = [newNote, ...notes];
                try {
                  localStorage.setItem(`hawkeye_lead_notes_${lead.id}`, JSON.stringify(updated));
                } catch { /* ignore */ }
                setNotes(updated);
                input.value = '';
              }}
              className="self-end px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              Save
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 pt-3 px-2 pb-2 border-t border-white/10 flex flex-wrap gap-2">
          {lead.status === 'new' && (
            <button
              onClick={() => onStatusUpdate(lead.id, 'followed_up')}
              disabled={updatingId === lead.id}
              className="px-3 py-1.5 bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 rounded-lg text-xs font-medium hover:bg-yellow-600/30 disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {updatingId === lead.id ? '...' : '📞 Mark Followed Up'}
            </button>
          )}
          {(lead.status === 'new' || lead.status === 'followed_up') && (
            <button
              onClick={() => onStatusUpdate(lead.id, 'converted')}
              disabled={updatingId === lead.id}
              className="px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-300 rounded-lg text-xs font-medium hover:bg-green-600/30 disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {updatingId === lead.id ? '...' : '✓ Mark Converted'}
            </button>
          )}
          <button
            onClick={() => onEdit(lead)}
            className="px-3 py-1.5 bg-white/5 border border-white/10 text-slate-300 rounded-lg text-xs hover:bg-white/10 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            ✏️ Edit
          </button>
          <button
            onClick={() => onDelete(lead.id)}
            disabled={updatingId === lead.id}
            className="px-3 py-1.5 bg-red-600/20 border border-red-500/30 text-red-300 rounded-lg text-xs font-medium hover:bg-red-600/30 disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            🗑 Delete
          </button>
          {lead.sourceUrl && (
            <a
              href={lead.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-white/5 border border-white/10 text-slate-300 rounded-lg text-xs hover:bg-white/10 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              View Post ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
