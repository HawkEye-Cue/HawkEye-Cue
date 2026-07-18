import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  {
    icon: '🦅',
    title: 'Welcome to HawkEye-Cue',
    description: 'Your all-in-one tool to create content, find leads, and track sales. Here\'s how to get started in 5 minutes.',
  },
  {
    icon: '⚙️',
    title: 'Step 1: Pick Your Trade',
    description: 'Go to Settings (⚙️ More) and select your trade. This customizes everything — your content suggestions, keywords, and sales pipeline — specifically for your industry.',
    tip: 'You can select multiple trades if you work in more than one.',
  },
  {
    icon: '✨',
    title: 'Step 2: Create a Post',
    description: 'Tap Create (✨) to write a post. Type your own, or let AI generate one for you. Pick which platforms to post on and schedule it or post now.',
    tip: 'Your posts will be tailored to your trade automatically.',
  },
  {
    icon: '📅',
    title: 'Step 3: Use Your Calendar',
    description: 'The Calendar (📅) shows your scheduled posts and daily tasks. Add reminders like "Post in Facebook group" or "Follow up with lead."',
    tip: 'Daily cues show up on your home screen each morning.',
  },
  {
    icon: '🎯',
    title: 'Step 4: Track Your Leads',
    description: 'The Leads tab (🎯) shows everyone who might need your services. Leads come from the browser extension scanning social media, or you can add them manually.',
    tip: 'Available on the Flight plan ($19.99/mo). Start free, upgrade when you\'re ready.',
  },
  {
    icon: '💰',
    title: 'Step 5: Track Your Sales',
    description: 'The Sales tab (💰) is your pipeline. Add deals, track where each lead came from, set your folio dates, and watch your numbers grow. When you close a deal, mark it "Won" and your linked partners get notified!',
    tip: 'Available on the Soar plan ($29.99/mo). Upgrade from Settings when you need it.',
  },
  {
    icon: '🤝',
    title: 'Step 6: Collaborate & Network',
    description: 'The Collaborate tab (🤝) connects you with other trades in your area. Post referral requests, share leads, and build partnerships that send you business.',
    tip: 'Roofers meet insurance agents. Realtors meet contractors. Everyone wins.',
  },
  {
    icon: '🚀',
    title: 'You\'re All Set!',
    description: 'That\'s it. Pick your trade, create your first post, and start tracking. HawkEye-Cue handles the rest.',
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
