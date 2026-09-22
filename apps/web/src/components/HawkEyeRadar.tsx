import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';

interface ScoreResult {
  score: number;
  urgency: 'now' | 'soon' | 'nurture' | 'not_a_lead';
  isLead: boolean;
  reason: string;
  suggestedResponse: string;
  followUpDays: number;
  followUpDate: string;
  estimatedValue: number;
  group: string;
}

interface Props {
  onClose: () => void;
  onAddLead?: (name: string, postText: string, response: string, estValue: number, followUpDate: string) => void;
}

const URGENCY = {
  now: { label: '🔥 NOW', color: 'text-red-300 bg-red-500/15 border-red-500/30' },
  soon: { label: '⚡ SOON', color: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
  nurture: { label: '🌱 NURTURE', color: 'text-sky-300 bg-sky-500/15 border-sky-500/30' },
  not_a_lead: { label: '🚫 NOT A LEAD', color: 'text-slate-400 bg-slate-500/15 border-slate-500/30' },
};

export default function HawkEyeRadar({ onClose, onAddLead }: Props) {
  const { getToken } = useAuth();
  const { selectedTrade } = useTrade();
  const { showToast } = useToast();

  const [postText, setPostText] = useState('');
  const [group, setGroup] = useState('');
  const [name, setName] = useState('');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  useEffect(() => {
    async function loadInsights() {
      try {
        const client = await buildClient();
        const res = await client.request<{ insights: string[] }>('GET', '/radar/insights');
        setInsights(res.insights || []);
      } catch { /* none yet */ }
    }
    loadInsights();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function score() {
    if (!postText.trim()) { showToast('Paste a post to analyze'); return; }
    setLoading(true);
    setResult(null);
    try {
      const client = await buildClient();
      const res = await client.request<{ result: ScoreResult }>('POST', '/radar/score', {
        postText: postText.trim(),
        tradeName: selectedTrade?.name,
        group: group.trim(),
      });
      setResult(res.result);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : 'Scoring failed'}`);
    } finally { setLoading(false); }
  }

  function scoreColor(s: number) {
    if (s >= 80) return 'text-red-400';
    if (s >= 50) return 'text-amber-400';
    if (s >= 20) return 'text-sky-400';
    return 'text-slate-500';
  }
  function ringColor(s: number) {
    if (s >= 80) return '#f87171';
    if (s >= 50) return '#fbbf24';
    if (s >= 20) return '#38bdf8';
    return '#64748b';
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col" style={{ paddingTop: '5rem' }} onClick={onClose}>
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-white/10 mx-2 rounded-t-xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-bold text-white flex items-center gap-2 text-sm">📡 HawkEye Radar</h3>
          <p className="text-[11px] text-slate-400">Find the conversations most likely to make you money</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none px-2">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-24 pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="w-full max-w-2xl mx-auto space-y-4">

          {/* Learned insights banner */}
          {insights.length > 0 && (
            <div className="glass-card border border-purple-500/20">
              <p className="text-xs font-bold text-purple-300 mb-1">🧠 What HawkEye has learned about your wins</p>
              {insights.map((ins, i) => (
                <p key={i} className="text-[11px] text-slate-300 leading-relaxed">• {ins}</p>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="glass-card space-y-3">
            <p className="text-xs text-slate-400">Paste a Facebook post or comment. HawkEye scores how likely it is to become a paying customer.</p>
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder='e.g. "Does anyone know a good roofer? Ours is leaking after the storm."'
              className="w-full h-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 resize-none"
            />
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Person's name (optional)" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs placeholder-slate-500" />
              <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Group / neighborhood (optional)" className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs placeholder-slate-500" />
            </div>
            <button onClick={score} disabled={loading} className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-sm font-bold rounded-lg disabled:opacity-50 hover:opacity-90">
              {loading ? '📡 Scanning…' : '📡 Scan This Post'}
            </button>
          </div>

          {/* Result */}
          {result && (
            <div className="glass-card space-y-4">
              {/* Score ring */}
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                    <circle cx="40" cy="40" r="34" fill="none" stroke={ringColor(result.score)} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(result.score / 100) * 213.6} 213.6`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-2xl font-extrabold ${scoreColor(result.score)}`}>{result.score}</span>
                    <span className="text-[8px] text-slate-500 -mt-1">SCORE</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded-full border ${URGENCY[result.urgency]?.color || URGENCY.nurture.color}`}>
                    {URGENCY[result.urgency]?.label || 'NURTURE'}
                  </span>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">{result.reason}</p>
                </div>
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide">Est. Value</p>
                  <p className="text-sm font-bold text-green-400">${(result.estimatedValue || 0).toLocaleString()}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide">Follow up</p>
                  <p className="text-sm font-bold text-white">{result.followUpDays === 0 ? 'Today' : new Date(result.followUpDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                </div>
              </div>

              {/* Suggested response */}
              {result.isLead && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-blue-300 mb-1">💬 Suggested Response</p>
                  <p className="text-xs text-slate-200 italic leading-relaxed">"{result.suggestedResponse}"</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(result.suggestedResponse); showToast('✓ Copied — paste it as your reply'); }}
                    className="mt-2 px-3 py-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-200 rounded-lg text-[11px] font-bold hover:bg-blue-600/40"
                  >
                    📋 Copy Response
                  </button>
                </div>
              )}

              {/* Add to pipeline */}
              {result.isLead && onAddLead && (
                <button
                  onClick={() => {
                    onAddLead(name.trim() || 'Radar Lead', postText.trim(), result.suggestedResponse, result.estimatedValue, result.followUpDate);
                    showToast('🎯 Added to your pipeline');
                    onClose();
                  }}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg"
                >
                  🎯 Add to Pipeline (one click)
                </button>
              )}

              {!result.isLead && (
                <div className="text-center py-2 text-xs text-slate-500">🚫 This doesn't look like a buying signal — skip it and keep scanning.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
