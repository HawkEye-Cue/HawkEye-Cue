import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  {
    icon: '🦅',
    title: 'Welcome to HawkEye-Cue',
    description: 'Your social media CRM for finding leads, creating content, and growing your business. Let\'s show you how to Cue.',
  },
  {
    icon: '⚙️',
    title: '1. Pick Your Trade',
    description: 'Select your industry from 56+ trades. This customizes your AI content, keywords, and post suggestions specifically for your business.',
  },
  {
    icon: '🔑',
    title: '2. Set Your Keywords',
    description: 'Add keywords people use when looking for your services (e.g., "need insurance", "looking for a roofer"). The scanner watches for these 24/7.',
  },
  {
    icon: '✨',
    title: '3. Create Content',
    description: 'AI generates professional posts tailored for Facebook, Instagram, LinkedIn, and more. Schedule them or post instantly — all in seconds.',
  },
  {
    icon: '📅',
    title: '4. Use Your Calendar',
    description: 'Add daily cues — reminders to post in Facebook groups, follow up on leads, or tasks for your team. They show up on your Dashboard each morning.',
  },
  {
    icon: '🎯',
    title: '5. Catch Leads',
    description: 'Install the Chrome extension on your computer. While you scroll social media, a hawk icon appears on posts matching your keywords. One click saves it as a lead.',
  },
  {
    icon: '🤝',
    title: '6. Build Your Network',
    description: 'Connect with other trades in your area on the Collaborate tab. Post referral requests, share opportunities, and build partnerships.',
  },
  {
    icon: '🙏',
    title: '7. Track Appreciations',
    description: 'When someone recommends your business on social media, log it in Appreciations. Track your top advocates and thank them.',
  },
  {
    icon: '🚀',
    title: 'You\'re Ready to Cue!',
    description: 'Start by selecting your trade on the next screen. Your daily cues, AI content, and lead detection will take it from there.',
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
        <div className="animate-scale-in">
          <span className="text-5xl mb-4 block">{current.icon}</span>
          <h2 className="text-2xl font-bold text-white mb-3">{current.title}</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">{current.description}</p>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleNext}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-500 transition-colors"
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
          {!isLast && (
            <button
              onClick={handleSkip}
              className="w-full text-slate-500 py-2 text-sm hover:text-slate-300 transition-colors"
            >
              Skip Tutorial
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
