import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEdition } from '../contexts/EditionContext';
import { useToast } from '../contexts/ToastContext';

/**
 * One-time onboarding question: "Do you already use a CRM?"
 * - Yes  -> Discover edition (find/score/draft/push to your CRM)
 * - No   -> Grow edition (everything + built-in pipeline)
 * Shown once per user; dismissing keeps the default (Grow) and can be re-answered in Settings.
 */
export default function EditionOnboarding({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { setEdition } = useEdition();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  function markSeen() {
    try { localStorage.setItem(`hawkeye_edition_onboarded_${user?.sub}`, 'true'); } catch { /* ignore */ }
  }

  async function choose(useCrm: boolean) {
    setSaving(true);
    const edition = useCrm ? 'discover' : 'grow';
    const ok = await setEdition(edition);
    setSaving(false);
    markSeen();
    showToast(ok
      ? (useCrm ? '🔭 Discover mode — connect your CRM anytime' : '🌱 Grow mode — your full toolkit is ready')
      : '❌ Could not save — you can choose later in Settings');
    onDone();
  }

  function skip() {
    markSeen();
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="glass-card-strong w-full max-w-sm animate-scale-in">
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">🦅</div>
          <h3 className="text-lg font-bold text-white">One quick question</h3>
          <p className="text-xs text-slate-400 mt-1">Do you already use a CRM (like HubSpot, Salesforce, or GoHighLevel)?</p>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => choose(true)}
            disabled={saving}
            className="w-full text-left p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
          >
            <p className="text-sm font-bold text-emerald-300">Yes, I have a CRM 🔭</p>
            <p className="text-[11px] text-slate-400 mt-0.5">We'll keep it lean: find opportunities, score them, draft replies, and push them into your CRM.</p>
          </button>
          <button
            onClick={() => choose(false)}
            disabled={saving}
            className="w-full text-left p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 transition-all disabled:opacity-50"
          >
            <p className="text-sm font-bold text-amber-300">No, set me up 🌱</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Get everything plus a built-in pipeline, follow-up automation, scheduling and revenue tracking.</p>
          </button>
        </div>

        <button onClick={skip} disabled={saving} className="w-full mt-3 text-slate-500 py-1.5 text-xs hover:text-slate-300 transition-colors">
          I'll decide later
        </button>
      </div>
    </div>
  );
}
