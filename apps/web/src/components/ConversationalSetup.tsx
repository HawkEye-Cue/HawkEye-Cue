import { useState } from 'react';
import { useTrade } from '../contexts/TradeContext';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient, TRADES } from '@social-lead-gen/shared';
import type { Trade } from '@social-lead-gen/shared';

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

type StepId = 'business' | 'area' | 'services' | 'accounts' | 'voice' | 'ready';

/**
 * Conversational setup — asks a few simple questions one at a time instead of
 * dropping the user on a big settings page. Answers persist to trade selection
 * and profile preferences so the rest of the app is customized.
 */
export default function ConversationalSetup({ onComplete, onSkip }: Props) {
  const { setSelectedTrades } = useTrade();
  const { getToken, user } = useAuth();

  const [step, setStep] = useState<StepId>('business');
  const [tradeQuery, setTradeQuery] = useState('');
  const [chosenTrade, setChosenTrade] = useState<Trade | null>(null);
  const [area, setArea] = useState('');
  const [services, setServices] = useState('');
  const [voice, setVoice] = useState('');
  const [saving, setSaving] = useState(false);

  const firstName = (() => {
    const email = user?.email || '';
    const p = email.split('@')[0].replace(/[._]/g, ' ').trim();
    return p ? p.charAt(0).toUpperCase() + p.slice(1).split(' ')[0] : 'there';
  })();

  // Trade search results
  const tradeMatches = tradeQuery.trim().length >= 1
    ? TRADES.filter((t) => t.name.toLowerCase().includes(tradeQuery.toLowerCase())).slice(0, 6)
    : [];

  const STEP_ORDER: StepId[] = ['business', 'area', 'services', 'accounts', 'voice', 'ready'];
  const stepIndex = STEP_ORDER.indexOf(step);
  const pct = Math.round(((stepIndex + 1) / STEP_ORDER.length) * 100);

  function next() {
    const i = STEP_ORDER.indexOf(step);
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1]);
  }

  async function connectAccounts() {
    // Route to Settings' social accounts section; setup can be finished later.
    localStorage.setItem('hawkeye_onboarded', 'true');
    window.location.href = '/settings#social';
  }

  async function finish() {
    setSaving(true);
    try {
      // Save the trade
      if (chosenTrade) {
        await setSelectedTrades([chosenTrade]);
      }
      // Save conversational answers to preferences
      const token = await getToken();
      const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
      await client.request('PUT', '/profile/preferences', {
        setupAnswers: {
          serviceArea: area.trim(),
          servicesWanted: services.trim(),
          responseVoice: voice.trim(),
          completedAt: new Date().toISOString(),
        },
      }).catch(() => {});
      // Seed the first email template / response voice if provided
      if (voice.trim()) {
        localStorage.setItem('hawkeye_email_template_0', voice.trim());
        client.request('PUT', '/profile/preferences', { emailTemplate0: voice.trim() }).catch(() => {});
      }
    } finally {
      setSaving(false);
      localStorage.setItem('hawkeye_onboarded', 'true');
      localStorage.setItem(`hawkeye_setup_complete_${user?.sub}`, 'true');
      onComplete();
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        {/* Progress */}
        <div className="w-full bg-slate-800 rounded-full h-1.5 mb-8">
          <div className="bg-gradient-to-r from-amber-500 to-yellow-400 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>

        <div key={step} className="animate-scale-in space-y-5">
          {step === 'business' && (
            <>
              <div>
                <span className="text-4xl block mb-2">🦅</span>
                <h2 className="text-2xl font-bold text-white">Hey {firstName}, let's set up your HawkEye</h2>
                <p className="text-sm text-slate-400 mt-2">First — what kind of business do you run?</p>
              </div>
              <input
                autoFocus
                value={chosenTrade ? chosenTrade.name : tradeQuery}
                onChange={(e) => { setChosenTrade(null); setTradeQuery(e.target.value); }}
                placeholder="e.g. Roofing, Insurance, Real Estate…"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white text-base placeholder-slate-500"
              />
              {!chosenTrade && tradeMatches.length > 0 && (
                <div className="space-y-1.5">
                  {tradeMatches.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setChosenTrade(t); setTradeQuery(t.name); }}
                      className="w-full text-left px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg text-sm text-white"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={next}
                disabled={!chosenTrade}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold rounded-xl disabled:opacity-40"
              >
                Next →
              </button>
            </>
          )}

          {step === 'area' && (
            <>
              <div>
                <span className="text-4xl block mb-2">📍</span>
                <h2 className="text-2xl font-bold text-white">Where do you serve customers?</h2>
                <p className="text-sm text-slate-400 mt-2">Your city, county, or the areas you cover. This helps HawkEye judge local opportunities.</p>
              </div>
              <input
                autoFocus
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Brighton & the north metro"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white text-base placeholder-slate-500"
              />
              <div className="flex gap-2">
                <button onClick={next} className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold rounded-xl">Next →</button>
                <button onClick={next} className="px-4 py-3 bg-slate-700 text-slate-300 rounded-xl text-sm">Skip</button>
              </div>
            </>
          )}

          {step === 'services' && (
            <>
              <div>
                <span className="text-4xl block mb-2">🎯</span>
                <h2 className="text-2xl font-bold text-white">What do you want leads for?</h2>
                <p className="text-sm text-slate-400 mt-2">The services or products you most want to sell. We'll prioritize matching conversations.</p>
              </div>
              <textarea
                autoFocus
                value={services}
                onChange={(e) => setServices(e.target.value)}
                placeholder="e.g. Home & auto bundles, life insurance"
                className="w-full h-24 px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white text-base placeholder-slate-500 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={next} className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold rounded-xl">Next →</button>
                <button onClick={next} className="px-4 py-3 bg-slate-700 text-slate-300 rounded-xl text-sm">Skip</button>
              </div>
            </>
          )}

          {step === 'accounts' && (
            <>
              <div>
                <span className="text-4xl block mb-2">🔗</span>
                <h2 className="text-2xl font-bold text-white">Connect your social accounts</h2>
                <p className="text-sm text-slate-400 mt-2">Link the Facebook Pages or Instagram accounts you post from. You can also do this later in Settings.</p>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={connectAccounts} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl">Connect accounts now</button>
                <button onClick={next} className="w-full py-3 bg-slate-700 text-slate-300 rounded-xl text-sm">I'll connect them later</button>
              </div>
            </>
          )}

          {step === 'voice' && (
            <>
              <div>
                <span className="text-4xl block mb-2">💬</span>
                <h2 className="text-2xl font-bold text-white">How would you naturally respond to a customer?</h2>
                <p className="text-sm text-slate-400 mt-2">Write a quick example reply. HawkEye uses your voice to draft responses that sound like you.</p>
              </div>
              <textarea
                autoFocus
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                placeholder="e.g. Hey! Happy to help — I'll shoot you a quick quote today. What's the best number to reach you?"
                className="w-full h-28 px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white text-base placeholder-slate-500 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={next} className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold rounded-xl">Next →</button>
                <button onClick={next} className="px-4 py-3 bg-slate-700 text-slate-300 rounded-xl text-sm">Skip</button>
              </div>
            </>
          )}

          {step === 'ready' && (
            <div className="text-center space-y-5">
              <span className="text-6xl block">🦅</span>
              <h2 className="text-2xl font-bold text-white">Your HawkEye is ready.</h2>
              <p className="text-sm text-slate-300">Let's find your first opportunity.</p>
              <div className="text-left bg-slate-800/60 border border-white/10 rounded-xl p-4 space-y-1.5 text-sm">
                {chosenTrade && <p className="text-slate-300">🏷️ Trade: <span className="text-white font-medium">{chosenTrade.name}</span></p>}
                {area && <p className="text-slate-300">📍 Area: <span className="text-white font-medium">{area}</span></p>}
                {services && <p className="text-slate-300">🎯 Focus: <span className="text-white font-medium">{services}</span></p>}
              </div>
              <button
                onClick={finish}
                disabled={saving}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold rounded-xl disabled:opacity-50"
              >
                {saving ? 'Getting your Nest ready…' : "Let's go 🦅"}
              </button>
            </div>
          )}
        </div>

        {/* Skip whole setup */}
        {step !== 'ready' && (
          <button onClick={onSkip} className="w-full text-slate-500 py-3 text-sm hover:text-slate-300 mt-4">
            Skip setup — show me the tour instead
          </button>
        )}
      </div>
    </div>
  );
}
