export type ViewMode = 'month' | 'week' | 'day';

export interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  const modes: { id: ViewMode; label: string }[] = [
    { id: 'month', label: 'Month' },
    { id: 'week', label: 'Week' },
    { id: 'day', label: 'Day' },
  ];

  return (
    <div className="inline-flex rounded-full border border-amber-500/30 bg-white/5 p-0.5">
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => { if (mode.id !== value) onChange(mode.id); }}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
            value === mode.id
              ? 'bg-amber-500 text-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
