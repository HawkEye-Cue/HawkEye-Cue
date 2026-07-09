import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DEMO_STEPS = [
  {
    icon: '🦅',
    title: 'Welcome to HawkEye-Cue',
    description: 'Let\'s show you how trade professionals are growing their business on social media — in under 2 minutes.',
    highlight: null,
  },
  {
    icon: '⚡',
    title: 'The Problem',
    description: 'You\'re spending hours scrolling social media trying to find leads, write posts, and stay consistent. Meanwhile, your competitors are getting recommended by other trades and you\'re missing it.',
    highlight: null,
  },
  {
    icon: '✨',
    title: 'AI Creates Your Posts',
    description: 'Pick your tone, choose a post type, and AI generates professional content for Facebook, Instagram, LinkedIn, and TikTok — all in seconds. Customized for your specific trade.',
    highlight: 'create',
    mockContent: '📘 Facebook: "Looking for reliable coverage? Our team specializes in finding the right plan for your family\'s needs. Drop a comment or send us a message for a free quote! #InsuranceAgent #Coverage"',
  },
  {
    icon: '📅',
    title: 'Schedule & Forget',
    description: 'Plan a week of posts in one sitting. Set reminders to post in Facebook groups, follow up on leads, or check keyword matches. Your daily cues keep you on track.',
    highlight: 'calendar',
  },
  {
    icon: '🦅',
    title: 'The Hawk Finds Your Leads',
    description: 'While you scroll Facebook groups, our Chrome extension watches for keywords like "looking for insurance" or "need a roofer." A hawk icon appears on matching posts — one click saves it as a lead.',
    highlight: 'leads',
    mockContent: '🦅 MATCH FOUND: "Does anyone know a good insurance agent in the Brighton area? Looking to bundle home and auto." — posted in Brighton Homeowners Group',
  },
  {
    icon: '📊',
    title: 'Track Every Lead',
    description: 'New leads flow in → you follow up → they convert to customers. Track your pipeline from first contact to closed deal. See exactly which keywords and platforms bring in business.',
    highlight: 'leads',
  },
  {
    icon: '🤝',
    title: 'Build Your Referral Network',
    description: 'Connect with roofers, contractors, real estate agents, and other trades in your area. They refer clients to you, you refer to them. Grow together.',
    highlight: 'network',
  },
  {
    icon: '🙏',
    title: 'Know Who Recommends You',
    description: 'When someone tags your business in a recommendation post, it shows up in Appreciations. Thank them, track your top advocates, and strengthen those relationships.',
    highlight: 'thanks',
  },
  {
    icon: '💰',
    title: 'It Pays for Itself',
    description: 'One converted lead from a Facebook group covers months of subscription cost. Most users find 3-5 qualified leads in their first week.',
    highlight: null,
    stats: { leads: '3-5', time: '10 min/day', roi: '10x+' },
  },
  {
    icon: '🚀',
    title: 'Ready to Start?',
    description: 'Join trade professionals who are growing their business with HawkEye-Cue. Sign up and start finding leads today.',
    highlight: null,
    cta: true,
  },
];

export default function ProductDemo({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = DEMO_STEPS[step];
  const isLast = step === DEMO_STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[9999] px-4">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Progress bar */}
        <div className="h-1 bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
            style={{ width: `${((step + 1) / DEMO_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-6">
          {/* Content */}
          <div className="text-center mb-6">
            <span className="text-4xl block mb-3">{current.icon}</span>
            <h3 className="text-xl font-bold text-white mb-3">{current.title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{current.description}</p>
          </div>

          {/* Mock content preview */}
          {(current as any).mockContent && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4 text-sm text-slate-300 italic">
              {(current as any).mockContent}
            </div>
          )}

          {/* Stats */}
          {(current as any).stats && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="text-lg font-bold text-blue-400">{(current as any).stats.leads}</div>
                <div className="text-xs text-slate-400">Leads/week</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="text-lg font-bold text-green-400">{(current as any).stats.time}</div>
                <div className="text-xs text-slate-400">Time saved</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="text-lg font-bold text-purple-400">{(current as any).stats.roi}</div>
                <div className="text-xs text-slate-400">ROI</div>
              </div>
            </div>
          )}

          {/* CTA buttons on last slide */}
          {(current as any).cta ? (
            <div className="space-y-3">
              <button
                onClick={() => { onClose(); navigate('/register'); }}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-bold text-base hover:opacity-90 transition-opacity btn-shimmer"
              >
                Sign Up Now →
              </button>
              <button
                onClick={onClose}
                className="w-full text-slate-500 py-2 text-sm hover:text-slate-300"
              >
                Maybe later
              </button>
            </div>
          ) : (
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
                onClick={() => setStep(step + 1)}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                {step === 0 ? 'Show Me' : 'Next'}
              </button>
            </div>
          )}

          {/* Skip */}
          {!isLast && step > 0 && (
            <button onClick={onClose} className="w-full mt-2 text-slate-600 text-xs py-1 hover:text-slate-400">
              Close demo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
