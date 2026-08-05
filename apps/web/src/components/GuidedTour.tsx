import { useState, useEffect } from 'react';

interface TourStep {
  selector: string;
  title: string;
  description: string;
  icon: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="home"]',
    title: 'Dashboard',
    description: 'Your home base. See today\'s cues, lead stats, meetings, and your calendar at a glance.',
    icon: '🏠',
  },
  {
    selector: '[data-tour="create"]',
    title: 'Create & Post',
    description: 'Write posts or let AI generate them. Use "Copy & Open Next Flock" to fly through your Facebook groups.',
    icon: '✨',
  },
  {
    selector: '[data-tour="leads"]',
    title: 'Leads',
    description: 'Track leads from any source. The 🎯 button in the bottom-right lets you quick-save a lead from any page — perfect for mobile.',
    icon: '🎯',
  },
  {
    selector: '[data-tour="sales"]',
    title: 'Sales',
    description: 'Your deal pipeline. Track from prospect to close and see which lead sources make you the most money.',
    icon: '💰',
  },
  {
    selector: '[data-tour="network"]',
    title: 'Network',
    description: 'Connect with other trades, post referrals, save appreciations, and manage your Wingman contacts.',
    icon: '🤝',
  },
  {
    selector: '[data-tour="team"]',
    title: 'Summit',
    description: 'Team features. Shared calendar with color-coded meetings, team leads, leaderboard, and wins.',
    icon: '🏔️',
  },
  {
    selector: '[data-tour="settings"]',
    title: 'Settings & More',
    description: 'Pick your trade, set keywords, install the Chrome extension, manage your subscription, and more.',
    icon: '⚙️',
  },
];

export default function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  useEffect(() => {
    const el = document.querySelector(current.selector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
      if (!isLast) {
        setStep((s) => s + 1);
      } else {
        onComplete();
      }
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleNext() {
    if (isLast) {
      onComplete();
    } else {
      setStep(step + 1);
    }
  }

  // If no target found, don't render anything (auto-advancing)
  if (!targetRect) return null;

  return (
    <div className="fixed inset-0 z-[9999]" onClick={handleNext}>
      {/* Spotlight on the nav item */}
      <div
        className="absolute border-2 border-blue-400 rounded-xl pointer-events-none"
        style={{
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.75), 0 0 20px rgba(59,130,246,0.5)',
        }}
      />

      {/* Tooltip card — positioned above the nav bar */}
      <div
        className="absolute animate-scale-in"
        style={{
          left: Math.max(12, Math.min(targetRect.left + targetRect.width / 2 - 150, window.innerWidth - 312)),
          bottom: window.innerHeight - targetRect.top + 12,
          width: 300,
        }}
      >
        <div className="bg-slate-800 border border-blue-500/30 rounded-xl p-4 shadow-2xl shadow-blue-500/20">
          {/* Progress bar */}
          <div className="w-full bg-slate-700 rounded-full h-1 mb-3">
            <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }} />
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{current.icon}</span>
            <h3 className="font-bold text-white text-lg">{current.title}</h3>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed mb-4">{current.description}</p>

          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleNext(); }}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-500 transition-colors active:scale-95"
            >
              {isLast ? 'Done — Let\'s Go! 🦅' : 'Next →'}
            </button>
            {!isLast && (
              <button
                onClick={(e) => { e.stopPropagation(); onComplete(); }}
                className="px-3 py-2.5 text-slate-500 text-sm hover:text-white transition-colors"
              >
                Skip
              </button>
            )}
          </div>

          <p className="text-[10px] text-slate-600 text-center mt-2">{step + 1} of {TOUR_STEPS.length} · Tap anywhere to continue</p>
        </div>

        {/* Arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-slate-800 border-r border-b border-blue-500/30 rotate-45" />
      </div>
    </div>
  );
}
