import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTrade } from '../contexts/TradeContext';
import { useAuth } from '../contexts/AuthContext';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  action: string;        // what to do
  navigateTo: string;    // page to go to
  checkComplete: () => boolean; // how to know they did it
}

export default function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedTrade } = useTrade();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const steps: SetupStep[] = [
    {
      id: 'trade',
      title: 'Pick Your Trade',
      description: 'Select your industry so everything gets customized for you.',
      icon: '⚙️',
      action: 'Go to Settings and pick your trade',
      navigateTo: '/settings',
      checkComplete: () => !!selectedTrade,
    },
    {
      id: 'keywords',
      title: 'Add Keywords',
      description: 'Add words people use when they need your services.',
      icon: '🔑',
      action: 'Add at least one keyword in Settings',
      navigateTo: '/settings',
      checkComplete: () => {
        const kws = localStorage.getItem(`hawkeye_keywords_added_${user?.sub}`);
        return kws === 'true';
      },
    },
    {
      id: 'create',
      title: 'Create Your First Post',
      description: 'Write one or let AI generate it for you.',
      icon: '✨',
      action: 'Tap Create and make a post',
      navigateTo: '/create',
      checkComplete: () => {
        const posted = localStorage.getItem(`hawkeye_first_post_${user?.sub}`);
        return posted === 'true';
      },
    },
    {
      id: 'calendar',
      title: 'Add a Calendar Reminder',
      description: 'Set a daily cue like "Post in Facebook group."',
      icon: '📅',
      action: 'Go to Calendar and add an event',
      navigateTo: '/calendar',
      checkComplete: () => {
        const cal = localStorage.getItem(`hawkeye_first_event_${user?.sub}`);
        return cal === 'true';
      },
    },
    {
      id: 'sales',
      title: 'Set Up Your Sales Pipeline',
      description: 'Set your folio dates and add your first deal.',
      icon: '💰',
      action: 'Go to Sales and add a deal',
      navigateTo: '/sales',
      checkComplete: () => {
        const deal = localStorage.getItem(`hawkeye_first_deal_${user?.sub}`);
        return deal === 'true';
      },
    },
  ];

  // Auto-advance when a step is completed — poll every second for changes
  useEffect(() => {
    const interval = setInterval(() => {
      const step = steps[currentStep];
      if (step && step.checkComplete()) {
        if (currentStep < steps.length - 1) {
          setCurrentStep(currentStep + 1);
        } else {
          localStorage.setItem(`hawkeye_setup_complete_${user?.sub}`, 'true');
          onComplete();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedTrade, location.pathname, currentStep]);

  const step = steps[currentStep];
  const completedCount = steps.filter((s) => s.checkComplete()).length;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-24 right-4 z-50 bg-blue-600 text-white w-12 h-12 rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center text-lg hover:bg-blue-500 transition-colors animate-bounce"
        title="Setup Guide"
      >
        🦅
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 max-w-sm mx-auto animate-scale-in">
      <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🦅</span>
            <span className="text-xs font-medium text-slate-400">Setup Guide</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{completedCount}/{steps.length}</span>
            <button onClick={() => setMinimized(true)} className="text-slate-500 hover:text-white text-sm">−</button>
            <button onClick={onComplete} className="text-slate-500 hover:text-white text-xs">✕</button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-700 rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>

        {/* Current step */}
        <div className="flex items-start gap-3">
          <span className="text-2xl">{step.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{step.title}</p>
            <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={() => navigate(step.navigateTo)}
          className="w-full mt-3 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          {step.action} →
        </button>

        {/* Skip / Next step */}
        <button
          onClick={() => {
            if (currentStep < steps.length - 1) {
              setCurrentStep(currentStep + 1);
            } else {
              localStorage.setItem(`hawkeye_setup_complete_${user?.sub}`, 'true');
              onComplete();
            }
          }}
          className="w-full mt-2 text-slate-500 py-1.5 text-xs hover:text-slate-300 transition-colors"
        >
          Skip this step →
        </button>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 mt-3">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className={`w-2 h-2 rounded-full transition-all ${
                s.checkComplete() ? 'bg-green-500' : i === currentStep ? 'bg-blue-500 w-4' : 'bg-slate-600'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
