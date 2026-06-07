import { useState } from 'react';
import { useTrade } from '../contexts/TradeContext';

export default function KeywordsPage() {
  const { selectedTrade } = useTrade();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Keywords</h2>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Add Keyword</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            placeholder="Enter a keyword to track..."
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500"
            maxLength={100}
          />
          <button
            onClick={addKeyword}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Add
          </button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-3 text-white">Tracked Keywords ({keywords.length})</h3>
        {keywords.length === 0 ? (
          <p className="text-sm text-slate-400">No keywords configured yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 bg-blue-900/40 text-blue-300 px-3 py-1 rounded-full text-sm"
              >
                {kw}
                <button onClick={() => removeKeyword(kw)} className="text-blue-400 hover:text-red-400 ml-1">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {selectedTrade && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold mb-3 text-white">Suggested for {selectedTrade.name}</h3>
          <div className="flex flex-wrap gap-2">
            {selectedTrade.defaultKeywords.map((kw) => (
              <button
                key={kw}
                onClick={() => { if (!keywords.includes(kw)) setKeywords([...keywords, kw]); }}
                disabled={keywords.includes(kw)}
                className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-sm hover:bg-blue-900/40 hover:text-blue-300 disabled:opacity-50"
              >
                + {kw}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
