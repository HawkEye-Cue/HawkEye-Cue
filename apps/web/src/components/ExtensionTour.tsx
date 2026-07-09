import { useState } from 'react';

const STEPS = [
  {
    icon: '🦅',
    title: 'Install the HawkEye-Cue Extension',
    description: 'The Chrome extension detects leads while you scroll social media. Let\'s get it set up.',
    image: null,
  },
  {
    icon: '⚠️',
    title: 'Before You Install',
    description: 'Chrome may show a safety warning saying "This extension isn\'t trusted by Enhanced Safe Browsing." This is normal for all new extensions — just click "Continue to install" to proceed. It\'s safe!',
    image: null,
  },
  {
    icon: '⬇️',
    title: 'Step 1: Download',
    description: 'Click the button below to open the Chrome Web Store. Then click "Add to Chrome" on the store page.',
    image: null,
    action: { label: 'Open Chrome Web Store', url: 'https://chromewebstore.google.com/detail/oapbnbiijbhieeefdcfnnmkfcnebalkd' },
  },
  {
    icon: '🧩',
    title: 'Step 2: Pin It',
    description: 'Click the puzzle piece icon (🧩) in Chrome\'s top-right corner. Find "HawkEye-Cue" and click the pin icon to keep the hawk visible in your toolbar.',
    image: null,
  },
  {
    icon: '🔑',
    title: 'Step 3: Sign In',
    description: 'Click the hawk icon (🦅) in your toolbar. Sign in with the same email and password you use on hawkeyecue.com.',
    image: null,
  },
  {
    icon: '🔍',
    title: 'Step 4: Add Keywords',
    description: 'Make sure you have keywords set up in Settings → Keyword Tracking. The extension watches for these while you scroll.',
    image: null,
  },
  {
    icon: '📱',
    title: 'Step 5: Browse Social Media',
    description: 'Open Facebook, Instagram, LinkedIn, or TikTok in Chrome. Scroll through your feed or groups as you normally would.',
    image: null,
  },
  {
    icon: '🦅',
    title: 'Step 6: Watch for the Hawk',
    description: 'When a post matches your keywords, a hawk icon (🦅) appears on it. Click it to see the match details, then save it as a lead or appreciation.',
    image: null,
  },
  {
    icon: '✅',
    title: 'You\'re All Set!',
    description: 'The extension runs automatically while you browse. Leads you save will appear in your Lead Cues tab. Happy hunting!',
    image: null,
  },
];

export default function ExtensionTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] px-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl animate-scale-in">
        {/* Progress */}
        <div className="flex justify-center gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'bg-blue-500 w-6' : i < step ? 'bg-blue-500/50 w-2' : 'bg-slate-700 w-2'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center mb-6">
          <span className="text-4xl block mb-3">{current.icon}</span>
          <h3 className="text-xl font-bold text-white mb-2">{current.title}</h3>
          <p className="text-sm text-slate-400 leading-relaxed">{current.description}</p>
        </div>

        {/* Action button (e.g., open Chrome Web Store) */}
        {(current as any).action && (
          <a
            href={(current as any).action.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-gradient-to-r from-amber-500 to-amber-600 text-black py-3 rounded-lg text-sm font-bold text-center hover:opacity-90 mb-4"
          >
            {(current as any).action.label} ↗
          </a>
        )}

        {/* Navigation */}
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600"
            >
              Back
            </button>
          )}
          <button
            onClick={() => isLast ? onClose() : setStep(step + 1)}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>

        {/* Skip */}
        {!isLast && (
          <button
            onClick={onClose}
            className="w-full mt-2 text-slate-500 text-xs py-2 hover:text-slate-300"
          >
            Skip — I'll figure it out
          </button>
        )}
      </div>
    </div>
  );
}
