import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';

interface ComparisonRow {
  label: string;
  current: string;
  quoted: string;
  better: 'current' | 'quoted' | 'same';
}
interface Comparison {
  summary: string;
  rows: ComparisonRow[];
  pros: string[];
  cons: string[];
  recommendation: string;
}

interface Props {
  leadId: string;
  leadName: string;
  onClose: () => void;
}

/**
 * Policy Comparison — upload/paste a lead's current policy and the new quote,
 * then get a side-by-side, plain-English breakdown (AI-generated or manual).
 */
export default function PolicyComparison({ leadId, leadName, onClose }: Props) {
  const { getToken } = useAuth();
  const { selectedTrade } = useTrade();
  const { showToast } = useToast();

  const [currentPolicy, setCurrentPolicy] = useState('');
  const [quotedPolicy, setQuotedPolicy] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<'input' | 'result'>('input');
  const [showHelp, setShowHelp] = useState(false);

  // Example data users can load to see how it works
  const EXAMPLE_CURRENT = `Auto Insurance — Current Policy (Geico)
Premium: $180/month
Deductible: $1,000
Bodily Injury Liability: $25,000 per person / $50,000 per accident
Property Damage: $25,000
Comprehensive: Yes
Collision: Yes
Roadside Assistance: No
Rental Car Coverage: No`;

  const EXAMPLE_QUOTE = `Auto Insurance — Your New Quote (State Farm)
Premium: $155/month
Deductible: $500
Bodily Injury Liability: $100,000 per person / $300,000 per accident
Property Damage: $100,000
Comprehensive: Yes
Collision: Yes
Roadside Assistance: Yes (included)
Rental Car Coverage: Yes ($40/day)`;

  const EXAMPLE_COMPARISON: Comparison = {
    summary: 'Your new quote saves the customer $25 a month AND gives them much stronger protection. They get a lower deductible and far higher liability limits, plus free roadside and rental coverage. This is a clear upgrade.',
    rows: [
      { label: 'Monthly Cost', current: '$180/mo', quoted: '$155/mo', better: 'quoted' },
      { label: 'Deductible (what you pay in a claim)', current: '$1,000', quoted: '$500', better: 'quoted' },
      { label: 'Injury Coverage', current: '$25k / $50k', quoted: '$100k / $300k', better: 'quoted' },
      { label: 'Property Damage', current: '$25,000', quoted: '$100,000', better: 'quoted' },
      { label: 'Roadside Assistance', current: 'Not included', quoted: 'Included free', better: 'quoted' },
      { label: 'Rental Car Coverage', current: 'None', quoted: '$40/day', better: 'quoted' },
    ],
    pros: [
      'Saves $25 every month ($300/year)',
      'Cheaper deductible — pay $500 less out of pocket in a claim',
      '4x more injury protection if an accident is serious',
      'Free roadside assistance and rental car coverage',
    ],
    cons: [
      'Switching means canceling the old policy — confirm no cancellation fee',
      'New company, so double-check their claims reputation',
    ],
    recommendation: 'Yes — switch. They pay less every month and get significantly better protection. It is a win on both price and coverage.',
  };

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  // Load any saved comparison
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const client = await buildClient();
        const res = await client.request<{ comparison: Comparison | null; currentPolicy: string; quotedPolicy: string }>('GET', `/policy/comparison/${leadId}`);
        if (res.currentPolicy) setCurrentPolicy(res.currentPolicy);
        if (res.quotedPolicy) setQuotedPolicy(res.quotedPolicy);
        if (res.comparison) { setComparison(res.comparison); setMode('result'); }
        else { setShowHelp(true); } // first time — show the guide
      } catch { setShowHelp(true); }
      finally { setLoading(false); }
    }
    load();
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read an uploaded text file into a textarea
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, which: 'current' | 'quoted') {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) { showToast('File too large (max 500KB of text)'); return; }
    const text = await file.text();
    if (which === 'current') setCurrentPolicy(text);
    else setQuotedPolicy(text);
    showToast('✓ File loaded');
  }

  async function generate() {
    if (!currentPolicy.trim() || !quotedPolicy.trim()) { showToast('Add both policies first'); return; }
    setGenerating(true);
    try {
      const client = await buildClient();
      const res = await client.request<{ comparison: Comparison }>('POST', '/policy/compare', {
        currentPolicy, quotedPolicy, tradeName: selectedTrade?.name,
      });
      setComparison(res.comparison);
      setMode('result');
      // Persist
      await client.request('PUT', `/policy/comparison/${leadId}`, { comparison: res.comparison, currentPolicy, quotedPolicy });
      showToast('✓ Comparison ready');
    } catch {
      showToast('❌ AI failed. You can fill it in manually.');
      setComparison({ summary: '', rows: [{ label: 'Monthly Premium', current: '', quoted: '', better: 'same' }], pros: [''], cons: [''], recommendation: '' });
      setMode('result');
    } finally { setGenerating(false); }
  }

  async function saveManual() {
    try {
      const client = await buildClient();
      await client.request('PUT', `/policy/comparison/${leadId}`, { comparison, currentPolicy, quotedPolicy });
      showToast('✓ Comparison saved');
    } catch { showToast('❌ Failed to save'); }
  }

  const betterStyle = (side: 'current' | 'quoted', better: string) =>
    better === side ? 'text-green-300 font-bold' : better === 'same' ? 'text-slate-300' : 'text-slate-400';

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm overflow-y-auto" style={{ paddingTop: '3.5rem', paddingBottom: '6rem' }} onClick={onClose}>
      <div className="w-full max-w-2xl mx-auto px-3" onClick={(e) => e.stopPropagation()}>
        <div className="glass-card-strong">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-white flex items-center gap-2">⚖️ Policy Comparison</h3>
              <p className="text-xs text-slate-400">{leadName}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">✕</button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
          ) : mode === 'input' ? (
            <div className="space-y-4">
              {/* How it works */}
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 overflow-hidden">
                <button onClick={() => setShowHelp(!showHelp)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-500/5">
                  <span className="text-xs font-bold text-blue-300">💡 How does this work?</span>
                  <span className="text-blue-400 text-xs">{showHelp ? '▼' : '▶'}</span>
                </button>
                {showHelp && (
                  <div className="px-3 pb-3 space-y-2 text-[11px] text-slate-300 leading-relaxed">
                    <p><strong className="text-white">1.</strong> Paste (or upload a file of) your lead's <strong className="text-white">current policy</strong> — premium, deductible, coverages.</p>
                    <p><strong className="text-white">2.</strong> Paste your <strong className="text-white">new quote</strong> in the second box.</p>
                    <p><strong className="text-white">3.</strong> Tap <strong className="text-amber-300">🤖 AI Compare</strong> — HawkEye reads both and builds a plain-English side-by-side. No insurance jargon.</p>
                    <p><strong className="text-white">4.</strong> Show the lead the breakdown — it highlights where your quote wins (green), lists pros & cons, and gives a clear recommendation.</p>
                    <p className="text-slate-400">💡 Everything is editable, so you can tweak wording before showing your lead. It saves automatically per lead.</p>
                    <button
                      onClick={() => { setCurrentPolicy(EXAMPLE_CURRENT); setQuotedPolicy(EXAMPLE_QUOTE); setComparison(EXAMPLE_COMPARISON); setMode('result'); showToast('👀 Example loaded'); }}
                      className="mt-1 px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg text-[11px] font-bold hover:bg-amber-500/30"
                    >
                      👀 See a Live Example
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400">Paste or upload the lead's current policy and your new quote. AI will break it down in plain English — or you can build it yourself.</p>

              {/* Current policy */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-white mb-1">
                  <span>📄 Current Policy</span>
                  <label className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer">
                    ⬆ Upload file
                    <input type="file" accept=".txt,.csv,.md,text/plain" className="hidden" onChange={(e) => handleFile(e, 'current')} />
                  </label>
                </label>
                <textarea value={currentPolicy} onChange={(e) => setCurrentPolicy(e.target.value)} placeholder="Paste the lead's current policy details, coverages, premium, deductible…" className="w-full h-28 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs placeholder-slate-500 resize-none" />
              </div>

              {/* Quoted policy */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-white mb-1">
                  <span>💬 Your New Quote</span>
                  <label className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer">
                    ⬆ Upload file
                    <input type="file" accept=".txt,.csv,.md,text/plain" className="hidden" onChange={(e) => handleFile(e, 'quoted')} />
                  </label>
                </label>
                <textarea value={quotedPolicy} onChange={(e) => setQuotedPolicy(e.target.value)} placeholder="Paste the quote you're offering — coverages, premium, deductible…" className="w-full h-28 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs placeholder-slate-500 resize-none" />
              </div>

              <div className="flex gap-2">
                <button onClick={generate} disabled={generating} className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-sm font-bold rounded-lg disabled:opacity-50 hover:opacity-90">
                  {generating ? '🦅 Analyzing…' : '🤖 AI Compare'}
                </button>
                <button onClick={() => { setComparison({ summary: '', rows: [{ label: 'Monthly Premium', current: '', quoted: '', better: 'same' }], pros: [''], cons: [''], recommendation: '' }); setMode('result'); }} className="flex-1 py-2.5 bg-white/5 border border-white/10 text-white text-sm font-bold rounded-lg hover:bg-white/10">
                  ✍️ Build Manually
                </button>
              </div>
            </div>
          ) : comparison && (
            <div className="space-y-4">
              <button onClick={() => setMode('input')} className="text-xs text-blue-400 hover:text-blue-300">← Edit inputs</button>

              {/* Summary */}
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <textarea value={comparison.summary} onChange={(e) => setComparison({ ...comparison, summary: e.target.value })} placeholder="Plain-English summary…" className="w-full bg-transparent text-sm text-amber-100 resize-none outline-none" rows={2} />
              </div>

              {/* Side-by-side table */}
              <div className="rounded-lg border border-white/10 overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_1fr] bg-slate-700 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                  <div className="px-2 py-2">Detail</div>
                  <div className="px-2 py-2 text-center border-l border-white/10">📄 Current</div>
                  <div className="px-2 py-2 text-center border-l border-white/10">💬 Your Quote</div>
                </div>
                {comparison.rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr] border-t border-white/5 text-xs">
                    <input value={row.label} onChange={(e) => { const rows = [...comparison.rows]; rows[i] = { ...row, label: e.target.value }; setComparison({ ...comparison, rows }); }} className="px-2 py-2 bg-slate-800 text-white font-medium outline-none" />
                    <input value={row.current} onChange={(e) => { const rows = [...comparison.rows]; rows[i] = { ...row, current: e.target.value }; setComparison({ ...comparison, rows }); }} className={`px-2 py-2 bg-slate-800/60 border-l border-white/10 outline-none ${betterStyle('current', row.better)}`} />
                    <input value={row.quoted} onChange={(e) => { const rows = [...comparison.rows]; rows[i] = { ...row, quoted: e.target.value }; setComparison({ ...comparison, rows }); }} className={`px-2 py-2 bg-slate-800/60 border-l border-white/10 outline-none ${betterStyle('quoted', row.better)}`} />
                  </div>
                ))}
                <button onClick={() => setComparison({ ...comparison, rows: [...comparison.rows, { label: '', current: '', quoted: '', better: 'same' }] })} className="w-full py-1.5 bg-slate-800 border-t border-white/5 text-[10px] text-blue-400 hover:text-blue-300">+ Add row</button>
              </div>

              {/* Pros / Cons */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-xs font-bold text-green-300 mb-1">✓ Pros of switching</p>
                  {comparison.pros.map((p, i) => (
                    <input key={i} value={p} onChange={(e) => { const pros = [...comparison.pros]; pros[i] = e.target.value; setComparison({ ...comparison, pros }); }} placeholder="Benefit…" className="w-full bg-transparent text-[11px] text-slate-200 py-0.5 outline-none border-b border-transparent focus:border-green-500/30" />
                  ))}
                  <button onClick={() => setComparison({ ...comparison, pros: [...comparison.pros, ''] })} className="text-[10px] text-green-400 mt-1">+ Add</button>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs font-bold text-red-300 mb-1">⚠ Things to watch</p>
                  {comparison.cons.map((c, i) => (
                    <input key={i} value={c} onChange={(e) => { const cons = [...comparison.cons]; cons[i] = e.target.value; setComparison({ ...comparison, cons }); }} placeholder="Downside…" className="w-full bg-transparent text-[11px] text-slate-200 py-0.5 outline-none border-b border-transparent focus:border-red-500/30" />
                  ))}
                  <button onClick={() => setComparison({ ...comparison, cons: [...comparison.cons, ''] })} className="text-[10px] text-red-400 mt-1">+ Add</button>
                </div>
              </div>

              {/* Recommendation */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs font-bold text-blue-300 mb-1">🦅 Recommendation</p>
                <textarea value={comparison.recommendation} onChange={(e) => setComparison({ ...comparison, recommendation: e.target.value })} placeholder="Should they switch? Why?" className="w-full bg-transparent text-sm text-white resize-none outline-none" rows={2} />
              </div>

              <button onClick={saveManual} className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg">💾 Save Comparison</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
