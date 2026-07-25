import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  {
    icon: '🦅',
    title: 'Welcome to HawkEye-Cue',
    description: 'Your all-in-one tool to create content, manage your schedule, find leads, and track sales. Here\'s how to get started in 5 minutes.',
  },
  {
    icon: '⚙️',
    title: 'Step 1: Pick Your Trade',
    description: 'Go to Settings (⚙️ More) and select your trade. This customizes your content suggestions, keywords, and pipeline — specifically for your industry.',
    tip: 'You can select multiple trades if you work in more than one.',
  },
  {
    icon: '✨',
    title: 'Step 2: Set Up Your Flocks',
    description: 'Flocks are your Facebook groups and pages. Add them to your calendar with the + button — set them to repeat daily, weekly, or any schedule. Each day, your flocks show up ready to post.',
    tip: 'Tap "Copy & Open Next Flock" to fly through each group with one tap.',
  },
  {
    icon: '📋',
    title: 'Step 3: Create & Post',
    description: 'On the Create tab, write your own post or let AI generate one for you. Then use "Copy & Open Next Flock" to paste it into each group. After posting, tap "Engage Your Flocks" to go back and comment.',
    tip: 'Nest users get 3 Copy & Open per day. Soar users get unlimited.',
  },
  {
    icon: '📅',
    title: 'Step 4: Use Your Calendar',
    description: 'All calendars use the same day view — tap any day to see Cues (Posts, Meetings, Reminders counts) and an hourly Schedule from 6 AM to 8 PM. Switch between Month, Week, and Day views with the toggle.',
    tip: 'Meeting invites include "Add to Google Calendar" and "Add to Outlook Calendar" buttons. Daily notes save to each date automatically.',
  },
  {
    icon: '🎯',
    title: 'Step 5: Track Your Leads',
    description: 'The Leads tab lets you add leads from any source — Facebook groups, cold calls, referrals, internet lead vendors, and more. Track them from new to followed up to converted.',
    tip: 'Available on the Soar plan ($24.99/mo). Start with a 7-day free trial.',
  },
  {
    icon: '💰',
    title: 'Step 6: Track Your Sales',
    description: 'The Sales tab is your pipeline. Add deals, track where each lead came from, set your folio dates, and watch your numbers grow. Link with partners to share win notifications.',
    tip: 'Available on the Soar plan. Upgrade from Settings when you need it.',
  },
  {
    icon: '🏔️',
    title: 'Step 7: Team Up on Summit',
    description: 'Summit lets you create or join a team of up to 5 members. See everyone\'s meetings color-coded on a shared calendar, track team leads, view the leaderboard, and celebrate wins together.',
    tip: 'Each member picks their own color — it shows on all team calendars. Available on the Summit plan ($99.99/mo).',
  },
  {
    icon: '🤝',
    title: 'Step 8: Build Your Network',
    description: 'The Network tab connects you with other trades in your area. Post referral requests, log appreciations from people who recommend you, and save your referral partners.',
    tip: 'Roofers meet insurance agents. Realtors meet contractors. Everyone wins.',
  },
  {
    icon: '🚀',
    title: 'You\'re All Set!',
    description: 'Pick your trade, add your flocks, create your first post, and fly. HawkEye-Cue handles the rest.',
    tip: 'Tap "Get Started" below to jump in.',
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
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === step ? 'bg-blue-500 w-6' : i < step ? 'bg-blue-500/50' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div key={step} className="animate-scale-in">
          <span className="text-5xl mb-4 block">{current.icon}</span>
          <h2 className="text-2xl font-bold text-white mb-3">{current.title}</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">{current.description}</p>
          {current.tip && (
            <p className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2 mb-6">
              💡 {current.tip}
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="space-y-3">
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
              {isLast ? 'Get Started' : 'Next'}
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
