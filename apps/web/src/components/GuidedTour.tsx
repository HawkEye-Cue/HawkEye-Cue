import { useState, useEffect, useRef } from 'react';

interface TourStep {
  selector: string; // CSS selector for the element to highlight
  title: string;
  description: string;
  icon: string;
  position: 'top' | 'bottom'; // tooltip position relative to element
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="home"]',
    title: 'Dashboard',
    description: 'Your daily cues, lead stats, and scheduled posts all in one place. This is your home base.',
    icon: '🏠',
    position: 'top',
  },
  {
    selector: '[data-tour="calendar"]',
    title: 'Calendar',
    description: 'Add daily cues — reminders to post in Facebook groups, follow up on leads, or tasks for your team. They show up on your Dashboard each morning.',
    icon: '📅',
    position: 'top',
  },
  {
    selector: '[data-tour="create"]',
    title: 'Create Content',
    description: 'AI generates professional posts tailored for each platform in seconds. Schedule them or post instantly.',
    icon: '✨',
    position: 'top',
  },
  {
    selector: '[data-tour="leads"]',
    title: 'Lead Cues',
    description: 'When the browser extension detects someone asking for your services, it saves here. Track each lead from new → followed up → converted.',
    icon: '🎯',
    position: 'top',
  },
  {
    selector: '[data-tour="network"]',
    title: 'Collaborate',
    description: 'Connect with other trades in your area. Post referral requests, share opportunities, and build partnerships.',
    icon: '🤝',
    position: 'top',
  },
  {
    selector: '[data-tour="thanks"]',
    title: 'Appreciations',
    description: 'Track when someone recommends your business on social media. See your top advocates and thank them.',
    icon: '🙏',
    position: 'top',
  },
  {
    selector: '[data-tour="settings"]',
    title: 'Settings',
    description: 'Set your keywords, connect social accounts, install the Chrome extension, and manage your subscription.',
    icon: '⚙️',
    position: 'top',
  },
];

export default function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  useEffect(() => {
    // Find and highlight the current element
    const el = document.querySelector(current.selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      // Scroll into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setTargetRect(null);
    }
  }, [step, current.selector]);

  function handleNext() {
    if (isLast) {
      onComplete();
    } else {
      setStep(step + 1);
    }
  }

  function handleSkip() {
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Dark overlay with hole for highlighted element */}
      <div className="absolute inset-0 bg-black/70" onClick={handleNext} />

      {/* Highlighted element spotlight */}
      {targetRect && (
        <div
          className="absolute border-2 border-blue-400 rounded-xl shadow-lg shadow-blue-500/30 pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.7), 0 0 20px rgba(59,130,246,0.5)',
          }}
        />
      )}

      {/* Tooltip */}
      {targetRect && (
        <div
          ref={tooltipRef}
          className="absolute animate-scale-in"
          style={{
            left: Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - 150, window.innerWidth - 316)),
            ...(current.position === 'top'
              ? { bottom: window.innerHeight - targetRect.top + 16 }
              : { top: targetRect.bottom + 16 }
            ),
            width: 300,
          }}
        >
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 shadow-2xl">
            {/* Progress */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{current.icon}</span>
              <span className="text-xs text-slate-500">{step + 1} / {TOUR_STEPS.length}</span>
            </div>

            <h3 className="font-bold text-white text-lg mb-1">{current.title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">{current.description}</p>

            <div className="flex gap-2">
              <button
                onClick={handleNext}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                {isLast ? 'Get Started!' : 'Next'}
              </button>
              {!isLast && (
                <button
                  onClick={handleSkip}
                  className="px-3 py-2 text-slate-500 text-sm hover:text-white transition-colors"
                >
                  Skip
                </button>
              )}
            </div>
          </div>

          {/* Arrow pointing to element */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 border-slate-600 rotate-45"
            style={current.position === 'top'
              ? { bottom: -6, borderRight: '1px solid', borderBottom: '1px solid' }
              : { top: -6, borderLeft: '1px solid', borderTop: '1px solid' }
            }
          />
        </div>
      )}
    </div>
  );
}
