import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';

export default function PrivacyPage() {
  const { getToken, user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  async function exportData() {
    setExporting(true);
    try {
      const client = await buildClient();
      const doc = await client.request<any>('GET', '/profile/export');
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hawkeye-cue-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('✓ Your data downloaded');
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : 'Export failed'}`);
    } finally { setExporting(false); }
  }

  async function deleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') { showToast('Type DELETE to confirm'); return; }
    setDeleting(true);
    try {
      const client = await buildClient();
      await client.request('DELETE', '/profile/delete');
      showToast('Your account and data have been deleted');
      await logout();
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : 'Delete failed'}`);
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-8">
      <div>
        <h2 className="text-xl font-bold text-white">🔒 Privacy & Data</h2>
        <p className="text-[11px] text-slate-400">You're in control of your data. Here's exactly what we do with it.</p>
      </div>

      {/* Our promises */}
      <div className="glass-card space-y-2.5">
        <h3 className="text-sm font-semibold text-white">Our promises to you</h3>
        <div className="flex items-start gap-2">
          <span className="shrink-0">✅</span>
          <p className="text-xs text-slate-300"><span className="font-semibold text-white">We never auto-post or auto-message.</span> Every reply HawkEye drafts is yours to review and send. Nothing is posted to any platform on your behalf without you tapping it.</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="shrink-0">✅</span>
          <p className="text-xs text-slate-300"><span className="font-semibold text-white">Your data is yours.</span> Export or delete it anytime, below.</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="shrink-0">✅</span>
          <p className="text-xs text-slate-300"><span className="font-semibold text-white">We don't sell your data.</span> It's used only to run HawkEye-Cue for you.</p>
        </div>
      </div>

      {/* What the extension reads */}
      <div className="glass-card space-y-2">
        <h3 className="text-sm font-semibold text-white">🦅 What the browser extension reads</h3>
        <p className="text-xs text-slate-400">The Chrome extension only looks at pages you visit on the social sites you approved (Facebook, Instagram, LinkedIn, TikTok). Specifically:</p>
        <ul className="text-xs text-slate-300 space-y-1 mt-1">
          <li>• It scans <span className="text-white">visible post/comment text on your screen</span> for your keywords — to flag possible leads.</li>
          <li>• When you tap a match, it can send that post's text to HawkEye to score it and save it as a lead <span className="text-slate-400">(only when you tap)</span>.</li>
          <li>• It does <span className="text-white">not</span> read your private messages, passwords, or pages outside those sites.</li>
          <li>• It does <span className="text-white">not</span> post, comment, or message for you — replies are copy-to-clipboard so you paste them yourself.</li>
        </ul>
      </div>

      {/* Consent reminder */}
      <div className="glass-card space-y-2">
        <h3 className="text-sm font-semibold text-white">📇 Contacting people responsibly</h3>
        <p className="text-xs text-slate-400">HawkEye helps you spot people who are <span className="text-white">publicly asking</span> for services like yours. Reach out genuinely and respect anyone who asks not to be contacted. Follow your local rules for calls, texts, and email (e.g. TCPA / CAN-SPAM in the US).</p>
      </div>

      {/* Export */}
      <div className="glass-card flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Export my data</p>
          <p className="text-[11px] text-slate-400">Download everything HawkEye has stored for {user?.email} as a JSON file.</p>
        </div>
        <button onClick={exportData} disabled={exporting} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg disabled:opacity-50 shrink-0">
          {exporting ? 'Preparing…' : '⬇ Export'}
        </button>
      </div>

      {/* Delete */}
      <div className="glass-card border border-red-500/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Delete my account & data</p>
            <p className="text-[11px] text-slate-400">Permanently erase your account, leads, deals, and everything else. This cannot be undone.</p>
          </div>
          {!showDelete && (
            <button onClick={() => setShowDelete(true)} className="px-4 py-2 bg-red-600/20 border border-red-500/40 text-red-300 text-xs font-bold rounded-lg hover:bg-red-600/30 shrink-0">
              Delete
            </button>
          )}
        </div>
        {showDelete && (
          <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
            <p className="text-xs text-red-300">Type <span className="font-bold">DELETE</span> to confirm. This erases everything and logs you out.</p>
            <div className="flex gap-2">
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
              />
              <button onClick={deleteAccount} disabled={deleting || deleteConfirm.trim().toUpperCase() !== 'DELETE'} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg disabled:opacity-40 shrink-0">
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
              <button onClick={() => { setShowDelete(false); setDeleteConfirm(''); }} className="px-3 py-2 bg-slate-700 text-slate-300 text-xs rounded-lg shrink-0">Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center pt-2">
        <button onClick={() => navigate('/settings')} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">Back to Settings</button>
      </div>
    </div>
  );
}
