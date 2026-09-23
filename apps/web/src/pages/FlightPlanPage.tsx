import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';

interface FlightPlan {
  keywords: string[];
  opportunitySignals: string[];
  responseTemplates: { name: string; text: string }[];
  pipelineStages: string[];
  followUpSequence: { day: number; channel: string; task: string }[];
  contentIdeas: string[];
  intakeQuestions: string[];
  referralPartners: string[];
}

const channelIcon: Record<string, string> = { call: '📞', text: '💬', email: '✉️' };

export default function FlightPlanPage() {
  const { getToken } = useAuth();
  const { selectedTrade } = useTrade();
  const { showToast } = useToast();

  const [plan, setPlan] = useState<FlightPlan | null>(null);
  const [planTrade, setPlanTrade] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  useEffect(() => {
    async function load() {
      try {
        const client = await buildClient();
        const res = await client.request<{ plan: FlightPlan | null; tradeName: string | null }>('GET', '/flight-plan');
        if (res.plan) { setPlan(res.plan); setPlanTrade(res.tradeName); }
      } catch { /* none yet */ }
      finally { setLoading(false); }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(regenerate = false) {
    if (!selectedTrade?.name) { showToast('Pick your trade in Settings first'); return; }
    setGenerating(true);
    try {
      const client = await buildClient();
      const res = await client.request<{ plan: FlightPlan; tradeName: string }>('POST', '/flight-plan', {
        tradeName: selectedTrade.name,
        regenerate,
      });
      setPlan(res.plan);
      setPlanTrade(res.tradeName);
      showToast('🗺️ Your Flight Plan is ready');
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : 'Could not build plan'}`);
    } finally { setGenerating(false); }
  }

  // Seed the plan's keywords + opportunity signals into the user's tracked keywords.
  async function seedKeywords() {
    if (!plan || !selectedTrade) return;
    setSeeding(true);
    try {
      const client = await buildClient();
      const existing = await client.getKeywords();
      const have = new Set((Array.isArray(existing) ? existing : (existing as any)?.keywords || []).map((k: any) => (k.keyword || '').toLowerCase()));
      const all = [...(plan.keywords || []), ...(plan.opportunitySignals || [])];
      let added = 0;
      for (const kw of all) {
        if (!kw || have.has(kw.toLowerCase())) continue;
        try { await client.addKeyword({ keyword: kw, tradeId: selectedTrade.id }); added++; } catch { /* ignore */ }
      }
      showToast(added > 0 ? `✓ Added ${added} keywords to tracking` : 'All keywords already tracked');
    } catch { showToast('❌ Could not add keywords'); }
    finally { setSeeding(false); }
  }

  function copy(text: string, label = 'Copied') {
    navigator.clipboard.writeText(text);
    showToast(`✓ ${label}`);
  }

  if (loading) return <p className="text-sm text-slate-500">Loading your Flight Plan…</p>;

  // Empty state — no plan yet
  if (!plan) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-4 py-10">
        <div className="text-5xl">🗺️</div>
        <h2 className="text-2xl font-bold text-white">Your Industry Flight Plan</h2>
        <p className="text-sm text-slate-400">
          Get a ready-to-use system tailored to {selectedTrade?.name ? `a ${selectedTrade.name.toLowerCase()}` : 'your trade'} —
          keywords, opportunity signals, response templates, a follow-up sequence, content ideas, intake questions, and referral partners.
        </p>
        <button
          onClick={() => generate(false)}
          disabled={generating || !selectedTrade}
          className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold rounded-xl disabled:opacity-50 hover:opacity-90"
        >
          {generating ? '🦅 Building your plan…' : '🗺️ Build My Flight Plan'}
        </button>
        {!selectedTrade && <p className="text-xs text-amber-400">Pick your trade in Settings first.</p>}
      </div>
    );
  }

  const Section = ({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) => (
    <div className="glass-card space-y-2">
      <h3 className="text-sm font-semibold text-white">{icon} {title}</h3>
      {children}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-8">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white">🗺️ Your Flight Plan</h2>
        <p className="text-xs text-slate-400">A ready-to-use system for {planTrade || selectedTrade?.name}</p>
      </div>

      {/* Keywords + signals */}
      <Section icon="🔑" title="Keywords & Opportunity Signals">
        <div className="flex flex-wrap gap-1.5">
          {[...(plan.keywords || []), ...(plan.opportunitySignals || [])].map((k, i) => (
            <span key={i} className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">{k}</span>
          ))}
        </div>
        <button onClick={seedKeywords} disabled={seeding} className="mt-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg disabled:opacity-50">
          {seeding ? 'Adding…' : '+ Add all to keyword tracking'}
        </button>
      </Section>

      {/* Response templates */}
      <Section icon="💬" title="Response Templates">
        <div className="space-y-2">
          {(plan.responseTemplates || []).map((t, i) => (
            <div key={i} className="bg-slate-800 border border-white/10 rounded-lg p-2.5">
              <p className="text-[11px] font-bold text-amber-300">{t.name}</p>
              <p className="text-xs text-slate-200 italic mt-0.5 leading-relaxed">"{t.text}"</p>
              <button onClick={() => copy(t.text, 'Template copied')} className="mt-1.5 text-[10px] text-blue-400 hover:text-blue-300 font-semibold">📋 Copy</button>
            </div>
          ))}
        </div>
      </Section>

      {/* Pipeline stages */}
      <Section icon="📊" title="Pipeline Stages">
        <div className="flex flex-wrap items-center gap-1.5">
          {(plan.pipelineStages || []).map((s, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="text-[11px] px-2 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/25">{s}</span>
              {i < (plan.pipelineStages.length - 1) && <span className="text-slate-600 text-xs">→</span>}
            </span>
          ))}
        </div>
      </Section>

      {/* Follow-up sequence */}
      <Section icon="🦅" title="Follow-Up Sequence">
        <div className="space-y-1.5">
          {(plan.followUpSequence || []).map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-[10px] font-bold text-slate-400 w-12 shrink-0">Day {step.day}</span>
              <span className="shrink-0">{channelIcon[step.channel] || '•'}</span>
              <span className="text-slate-300">{step.task}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Content ideas */}
      <Section icon="✨" title="Recommended Content">
        <ul className="space-y-1">
          {(plan.contentIdeas || []).map((c, i) => (
            <li key={i} className="text-xs text-slate-300">• {c}</li>
          ))}
        </ul>
      </Section>

      {/* Intake questions */}
      <Section icon="📝" title="Lead Intake Questions">
        <ol className="space-y-1 list-decimal list-inside">
          {(plan.intakeQuestions || []).map((q, i) => (
            <li key={i} className="text-xs text-slate-300">{q}</li>
          ))}
        </ol>
        <button onClick={() => copy((plan.intakeQuestions || []).join('\n'), 'Questions copied')} className="mt-1 text-[10px] text-blue-400 hover:text-blue-300 font-semibold">📋 Copy all</button>
      </Section>

      {/* Referral partners */}
      <Section icon="🤝" title="Common Referral Partners">
        <div className="flex flex-wrap gap-1.5">
          {(plan.referralPartners || []).map((p, i) => (
            <span key={i} className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">{p}</span>
          ))}
        </div>
      </Section>

      {/* Regenerate */}
      <div className="text-center pt-2">
        <button onClick={() => generate(true)} disabled={generating} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 disabled:opacity-50">
          {generating ? 'Rebuilding…' : '↻ Rebuild my Flight Plan'}
        </button>
      </div>
    </div>
  );
}
