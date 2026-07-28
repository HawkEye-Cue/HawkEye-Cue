import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  {
    icon: '🦅',
    title: 'Welcome to HawkEye-Cue',
    description: 'The CRM built for trade professionals. Create content, manage your calendar, track leads, and grow your business — all in one place.',
    bullets: [
      '✨ AI-powered content for your trade',
      '📅 Calendar with meetings, reminders, and flocks',
      '🎯 Lead tracking from any source',
      '💰 Sales pipeline and analytics',
    ],
  },
  {
    icon: '⚙️',
    title: 'First: Pick Your Trade',
    description: 'This is the only thing you need to do right now. Go to More (⚙️) and select your trade — everything else customizes based on what you pick.',
    bullets: [
      'Choose from 57+ trades (roofing, insurance, real estate, HVAC...)',
      'Your content, keywords, and pipeline adapt automatically',
      'You can always change it or add more trades later',
    ],
  },
  {
    icon: '📤',
    title: 'How Posting Works',
    description: 'Add your Facebook groups to the calendar as "flocks." Each day they show up as cues. Write a post (or let AI write one), then tap "Copy & Open Next Flock" to fly through each group.',
    bullets: [
      '1. Add groups to calendar (set to repeat daily/weekly)',
      '2. Create a post on the Create tab',
      '3. Tap "Copy & Open" — it copies your post and opens the group',
      '4. Paste and post. Then tap next flock. Done in minutes.',
    ],
  },
  {
    icon: '📅',
    title: 'Your Calendar',
    description: 'Tap any day on any calendar and you\'ll see the same view — your Cues at the top (posts, meetings, reminders) and an hourly Schedule below. Add events, set times, send meeting invites.',
    bullets: [
      'Month / Week / Day toggle on Dashboard',
      'Meeting invites with Google & Outlook calendar links',
      'Daily notes save automatically to each day',
      'Everything syncs across devices',
    ],
  },
  {
    icon: '🎯',
    title: 'Leads & Sales',
    description: 'Track leads from any source — Facebook groups, cold calls, referrals, or internet vendors. Move them through your pipeline and see exactly what\'s making you money.',
    bullets: [
      'Leads tab: New → Followed Up → Converted',
      'Sales tab: Pipeline from prospect to close',
      'Activity log on each lead saves notes forever',
      'Available on Soar plan — 7-day free trial included',
    ],
  },
  {
    icon: '🤝',
    title: 'Network & Team',
    description: 'Connect with other trades on the Network tab. If you\'re on a team (Summit plan), everyone sees a shared color-coded calendar with each member\'s meetings.',
    bullets: [
      'Network: Post referrals, find partners in your area',
      'Summit: Shared calendar, team leads, leaderboard',
      'Each member picks their own color',
      'Wingman: Track relationships with key contacts',
    ],
  },
  {
    icon: '🚀',
    title: 'You\'re Ready',
    description: 'Here\'s your first-day checklist:',
    bullets: [
      '1. Pick your trade in Settings (⚙️ More)',
      '2. Add a few Facebook groups to your calendar',
      '3. Create your first post',
      '4. Fly through your flocks',
    ],
    tip: 'That\'s it. Everything else you\'ll pick up as you go.',
  },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      localStorage.setItem('hawkeye_onboarded', 'true');
      navigate('/');
    } else {
      setStep(step + 1);
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  function handleSkip() {
    localStorage.setItem('hawkeye_onboarded', 'true');
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-md w-full text-center">
        {/* Progress bar */}
        <div className="w-full bg-slate-800 rounded-full h-1.5 mb-8">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div key={step} className="animate-scale-in">
          <span className="text-5xl mb-4 block">{current.icon}</span>
          <h2 className="text-2xl font-bold text-white mb-3">{current.title}</h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-4">{current.description}</p>

          {current.bullets && (
            <div className="text-left bg-slate-800/50 border border-white/10 rounded-xl p-4 mb-4 space-y-2">
              {current.bullets.map((bullet, i) => (
                <p key={i} className="text-sm text-slate-300 leading-relaxed">{bullet}</p>
              ))}
            </div>
          )}

          {current.tip && (
            <p className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2 mb-4">
              {current.tip}
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="space-y-3 mt-4">
          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={handleBack}
                className="flex-1 bg-slate-700 text-slate-300 py-3 rounded-lg font-medium hover:bg-slate-600 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className={`${step > 0 ? 'flex-1' : 'w-full'} bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-500 transition-colors`}
            >
              {isLast ? 'Let\'s Go! 🦅' : 'Next'}
            </button>
          </div>
          {!isLast && (
            <button
              onClick={handleSkip}
              className="w-full text-slate-500 py-2 text-sm hover:text-slate-300 transition-colors"
            >
              Skip — I'll figure it out
            </button>
          )}
        </div>

        {/* Step counter */}
        <p className="text-xs text-slate-600 mt-6">{step + 1} of {STEPS.length}</p>
      </div>
    </div>
  );
}
