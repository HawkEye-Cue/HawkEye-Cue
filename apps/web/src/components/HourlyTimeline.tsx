import { useMemo } from 'react';

export interface TimelineEvent {
  id: string;
  title: string;
  type: 'post' | 'meeting' | 'reminder' | 'task';
  completed: boolean;
  link?: string;
  color?: string;       // Tailwind bg color class override (for member coloring)
  borderColor?: string; // Tailwind border color class override
  memberName?: string;  // Display name for color-coded events
}

export interface HourlyTimelineProps {
  events: TimelineEvent[];
  startHour?: number;
  endHour?: number;
  meetingsOnly?: boolean;
  onToggleComplete?: (id: string) => void;
  onEdit?: (event: TimelineEvent) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

function parseTimelineEvents(
  events: TimelineEvent[],
  startHour: number,
  endHour: number
): { untimed: TimelineEvent[]; hourSlots: Map<number, TimelineEvent[]> } {
  const untimed: TimelineEvent[] = [];
  const hourSlots = new Map<number, TimelineEvent[]>();

  for (let h = startHour; h <= endHour; h++) {
    hourSlots.set(h, []);
  }

  for (const event of events) {
    const timeMatch = event.title.match(/^\[(\d{1,2}):(\d{2})\]/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      if (hour >= startHour && hour <= endHour) {
        hourSlots.get(hour)!.push(event);
      } else {
        untimed.push(event);
      }
    } else {
      untimed.push(event);
    }
  }

  return { untimed, hourSlots };
}

function getEventIcon(type: string): string {
  switch (type) {
    case 'post': return '📤';
    case 'meeting': return '🤝';
    case 'reminder': return '🔔';
    case 'task': return '🔔';
    default: return '📋';
  }
}

export default function HourlyTimeline({
  events,
  startHour = 6,
  endHour = 19,
  meetingsOnly = false,
  onToggleComplete,
  onEdit,
  onDelete,
  showActions = true,
}: HourlyTimelineProps) {
  const filtered = useMemo(
    () => (meetingsOnly ? events.filter((e) => e.type === 'meeting') : events),
    [events, meetingsOnly]
  );

  const { untimed, hourSlots } = useMemo(
    () => parseTimelineEvents(filtered, startHour, endHour),
    [filtered, startHour, endHour]
  );

  return (
    <div className="space-y-2">
      {/* Untimed / All Day section */}
      {untimed.length > 0 && (
        <div className="space-y-1 mb-3 pb-3 border-b border-white/10">
          <p className="text-[10px] text-slate-500 uppercase font-medium">All Day</p>
          {untimed.map((evt) => {
            const icon = getEventIcon(evt.type);
            const bgClass = evt.color || 'bg-white/5';
            const borderClass = evt.borderColor || '';
            return (
              <div key={evt.id} className={`flex items-center gap-2 ${bgClass} ${borderClass ? `border ${borderClass}` : ''} rounded-lg px-3 py-2`}>
                <span className="text-sm">{icon}</span>
                <div className="flex-1 min-w-0">
                  <span className={`text-xs block truncate ${evt.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>
                    {evt.title}
                  </span>
                  {evt.memberName && <span className="text-[9px] text-blue-400">{evt.memberName}</span>}
                </div>
                {showActions && (
                  <div className="flex items-center gap-1 shrink-0">
                    {onToggleComplete && (
                      <button
                        onClick={() => onToggleComplete(evt.id)}
                        className={`text-[10px] px-2 py-0.5 rounded ${evt.completed ? 'text-green-400' : 'bg-green-600/20 text-green-300'}`}
                      >
                        {evt.completed ? '✓' : 'Done'}
                      </button>
                    )}
                    {onEdit && (
                      <button onClick={() => onEdit(evt)} className="text-[10px] text-slate-400 hover:text-white px-1">✏️</button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(evt.id)} className="text-[10px] text-red-400 hover:text-red-300 px-1">🗑️</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hourly timeline */}
      <div className="relative border-l-2 border-blue-500/30 ml-4 space-y-0">
        {Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour).map((hour) => {
          const hourEvents = hourSlots.get(hour) || [];
          const hourLabel = formatHourLabel(hour);
          return (
            <div key={hour} className={`flex items-start gap-2 min-h-[36px] ${hourEvents.length > 0 ? '' : 'opacity-30'}`}>
              <span className="text-[10px] text-slate-500 w-10 shrink-0 pt-1.5 text-right">{hourLabel}</span>
              <div className="flex-1 border-t border-white/10 pt-1">
                {hourEvents.map((evt) => {
                  const icon = getEventIcon(evt.type);
                  const cleanTitle = evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '').replace(/\s*\|.*$/, '');
                  const bgClass = evt.color || 'bg-blue-500/10';
                  const borderClass = evt.borderColor || 'border-blue-500/20';
                  return (
                    <div key={evt.id} className={`flex items-center gap-2 ${bgClass} border ${borderClass} rounded px-2.5 py-1.5 mb-1`}>
                      <span className="text-sm">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs block truncate ${evt.completed ? 'line-through text-slate-600' : 'text-white'}`}>
                          {cleanTitle}
                        </span>
                        {evt.memberName && <span className="text-[9px] text-blue-400">{evt.memberName}</span>}
                      </div>
                      {showActions && (
                        <div className="flex items-center gap-1 shrink-0">
                          {onToggleComplete && (
                            <button
                              onClick={() => onToggleComplete(evt.id)}
                              className={`text-[10px] px-2 py-0.5 rounded ${evt.completed ? 'text-green-400' : 'bg-green-600/20 text-green-300'}`}
                            >
                              {evt.completed ? '✓' : 'Done'}
                            </button>
                          )}
                          {onEdit && (
                            <button onClick={() => onEdit(evt)} className="text-[10px] text-slate-400 hover:text-white px-1">✏️</button>
                          )}
                          {onDelete && (
                            <button onClick={() => onDelete(evt.id)} className="text-[10px] text-red-400 hover:text-red-300 px-1">🗑️</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
