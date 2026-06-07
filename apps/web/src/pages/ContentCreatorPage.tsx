import { useState } from 'react';
import { useTrade } from '../contexts/TradeContext';
import { SOCIAL_PLATFORMS } from '@social-lead-gen/shared';
import type { SocialPlatform } from '@social-lead-gen/shared';

const TONES = ['professional', 'casual', 'educational', 'urgent'] as const;

export default function ContentCreatorPage() {
  const { selectedTrade } = useTrade();
  const [tone, setTone] = useState<string>('professional');
  const [postType, setPostType] = useState('');
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [baseText, setBaseText] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [loading, setLoading] = useState(false);

  const togglePlatform = (p: SocialPlatform) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const handleGenerate = async () => {
    setLoading(true);
    setTimeout(() => {
      setGeneratedContent(
        `🏠 Looking for a reliable ${selectedTrade?.name ?? 'professional'}? Our team delivers quality work every time. Contact us today for a free estimate! #${selectedTrade?.id ?? 'trade'} #localservice`,
      );
      setLoading(false);
    }, 1500);
  };

  if (!selectedTrade) {
    return <p className="text-slate-400">Please select a trade first from the Dashboard.</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Create Content</h2>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Tone</label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`px-3 py-1.5 rounded-full text-sm capitalize ${
                tone === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Post Type</label>
        <select
          value={postType}
          onChange={(e) => setPostType(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
        >
          <option value="">Select post type...</option>
          {selectedTrade.postTypes.map((pt) => (
            <option key={pt} value={pt}>{pt}</option>
          ))}
        </select>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Platforms</label>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              className={`px-3 py-1.5 rounded-full text-sm capitalize ${
                platforms.includes(p) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Base Text (optional)</label>
        <textarea
          value={baseText}
          onChange={(e) => setBaseText(e.target.value)}
          placeholder="Enter text to adapt, or leave blank for AI to generate from scratch..."
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 resize-none h-24"
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !postType || platforms.length === 0}
        className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? '✨ Generating...' : '✨ Generate Content'}
      </button>

      {generatedContent && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold mb-2 text-white">Generated Content</h3>
          <textarea
            value={generatedContent}
            onChange={(e) => setGeneratedContent(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white resize-none h-32"
          />
          <div className="flex gap-2 mt-3">
            <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">
              Schedule Post
            </button>
            <button className="bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-600">
              Save Draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
