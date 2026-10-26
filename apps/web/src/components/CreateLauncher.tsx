/**
 * CreateLauncher — the welcoming "home" of the Create tab.
 *
 * Presents three calm, prominent choices (Create a Post / Post to Groups / Schedule a
 * Post) in the reserved black/gold/white palette, consistent with the Sales tab. It is
 * purely presentational: the parent (ContentCreatorPage) owns all state and handlers.
 *
 * Create Tab Redesign, Requirements 6 & 7 (simple welcoming page; smallest safe change).
 */

export type CreateLaunchChoice = 'post' | 'groups' | 'schedule';

interface CreateLauncherProps {
  onChoose: (choice: CreateLaunchChoice) => void;
  todayFlockCount: number; // today's incomplete flocks (from useCalendar)
  savedGroupCount: number; // hawkeye_flock_groups_{sub}
}

export default function CreateLauncher({ onChoose, todayFlockCount, savedGroupCount }: CreateLauncherProps) {
  const cards: {
    choice: CreateLaunchChoice;
    icon: string;
    title: string;
    desc: string;
    hint?: string;
  }[] = [
    {
      choice: 'post',
      icon: '✍️',
      title: 'Create a Post',
      desc: 'Write it yourself or let Wingman draft it — add a photo or AI image.',
    },
    {
      choice: 'groups',
      icon: '🦅',
      title: 'Post to Groups',
      desc: 'Copy & open each group, or run Mass Flock / Flight Mode.',
      hint:
        todayFlockCount > 0
          ? `${todayFlockCount} flock${todayFlockCount !== 1 ? 's' : ''} to post today`
          : savedGroupCount > 0
            ? `${savedGroupCount} group${savedGroupCount !== 1 ? 's' : ''} saved`
            : undefined,
    },
    {
      choice: 'schedule',
      icon: '🗓️',
      title: 'Schedule a Post',
      desc: 'Queue it to your connected pages for later.',
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400 text-center">What would you like to do?</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <button
            key={c.choice}
            onClick={() => onChoose(c.choice)}
            className="group text-left p-5 rounded-2xl bg-black border border-white/10 hover:border-amber-500/60 hover:bg-amber-500/5 transition-all active:scale-[0.98] flex flex-col gap-2 min-h-[9rem]"
          >
            <span className="text-3xl">{c.icon}</span>
            <span className="text-base font-bold text-white">{c.title}</span>
            <span className="text-xs text-slate-400 leading-relaxed flex-1">{c.desc}</span>
            {c.hint && <span className="text-[11px] font-medium text-amber-300">{c.hint}</span>}
            <span className="text-amber-400 text-sm font-semibold mt-1 group-hover:translate-x-0.5 transition-transform">
              Open →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
