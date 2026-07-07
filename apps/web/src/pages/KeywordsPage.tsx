import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { ApiClient } from '@social-lead-gen/shared';

interface Keyword {
  id: string;
  keyword: string;
  tradeId: string;
  createdAt: string;
}

export default function KeywordsPage() {
  const { getToken } = useAuth();
  const { selectedTrade } = useTrade();
  const navigate = useNavigate();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  useEffect(() => {
    async function fetchKeywords() {
      try {
        const client = await buildClient();
        const result = await client.getKeywords();
        setKeywords(Array.isArray(result) ? result : (result as any)?.keywords || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    fetchKeywords();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addKeyword = async () => {
    if (!newKeyword.trim() || !selectedTrade) return;
    setAdding(true);
    setError('');
    try {
      const client = await buildClient();
      const result = await client.addKeyword({ keyword: newKeyword.trim(), tradeId: selectedTrade.id });
      setKeywords([...keywords, result]);
      setNewKeyword('');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add keyword';
      if (message.includes('TIER_LIMIT_REACHED') || message.includes('keyword limit')) {
        setError('🔒 ' + message);
      } else {
        setError(message);
      }
    } finally {
      setAdding(false);
    }
  };

  const removeKeyword = async (id: string) => {
    try {
      const client = await buildClient();
      await client.deleteKeyword(id);
      setKeywords(keywords.filter((k) => k.id !== id));
    } catch { /* ignore */ }
  };

  const addSuggested = async (kw: string) => {
    if (!selectedTrade || keywords.some((k) => k.keyword === kw.toLowerCase())) return;
    setError('');
    try {
      const client = await buildClient();
      const result = await client.addKeyword({ keyword: kw, tradeId: selectedTrade.id });
      setKeywords([...keywords, result]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add keyword';
      if (message.includes('TIER_LIMIT_REACHED') || message.includes('keyword limit')) {
        setError('🔒 ' + message);
      }
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Keywords</h2>
      <p className="text-sm text-slate-400">Track these keywords across social media to find leads</p>

      {error && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">
          {error}
          {error.includes('🔒') && (
            <button
              onClick={() => navigate('/settings')}
              className="block mt-2 text-blue-400 hover:text-blue-300 font-medium"
            >
              Upgrade Plan →
            </button>
          )}
        </div>
      )}

      <div className="glass-card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Add Keyword</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            placeholder="Enter a keyword to track..."
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none"
            maxLength={100}
          />
          <button
            onClick={addKeyword}
            disabled={adding || !newKeyword.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {adding ? '...' : 'Add'}
          </button>
        </div>
      </div>

      <div className="glass-card">
        <h3 className="font-semibold mb-3 text-white">Tracked Keywords ({keywords.length})</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : keywords.length === 0 ? (
          <p className="text-sm text-slate-400">No keywords configured yet. Add some above or pick from suggestions below.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw.id}
                className="inline-flex items-center gap-1 bg-blue-900/40 text-blue-300 px-3 py-1.5 rounded-full text-sm"
              >
                {kw.keyword}
                <button onClick={() => removeKeyword(kw.id)} className="text-blue-400 hover:text-red-400 ml-1">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {selectedTrade && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3 text-white">Suggested for {selectedTrade.name}</h3>
          <div className="flex flex-wrap gap-2">
            {selectedTrade.defaultKeywords.map((kw) => {
              const alreadyAdded = keywords.some((k) => k.keyword === kw.toLowerCase());
              return (
                <button
                  key={kw}
                  onClick={() => addSuggested(kw)}
                  disabled={alreadyAdded}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    alreadyAdded
                      ? 'bg-green-900/30 text-green-400 border border-green-500/20'
                      : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-blue-900/40 hover:text-blue-300'
                  }`}
                >
                  {alreadyAdded ? '✓ ' : '+ '}{kw}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
