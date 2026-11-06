/**
 * DEV-ONLY harness that mounts the REAL, unmodified MassFlockPosting component with the real
 * AuthProvider/ToastProvider and the real useFlockSafety hook. No network is used for the
 * component itself. Nothing in production code was changed to make this possible.
 *
 * Unauthenticated, `user?.sub` is undefined, so the component's own storage keys end in
 * `_undefined` (groups) / `_default` (session, auto-advance). The harness seeds the groups once
 * (only if absent) so a page reload exercises the real persistence path.
 *
 * window.open / clipboard are recorded (window.__opens / window.__clip), not performed.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import MassFlockPosting from '../components/MassFlockPosting';
import { useFlockSafety } from '../hooks/useFlockSafety';

declare global { interface Window { __opens: string[]; __clip: string[] } }
window.__opens = [];
window.__clip = [];
window.open = ((url?: string | URL) => { window.__opens.push(String(url)); return {} as Window; }) as typeof window.open;
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: (t: string) => { window.__clip.push(t); return Promise.resolve(); } },
});

const GROUPS = ['Austin Homeowners', 'Roofing Pros Network', 'Local Moms of Round Rock', 'Texas Contractors Hub', 'Cedar Park Neighbors'].map((name, i) => ({
  id: `g${i + 1}`, name, link: `https://www.facebook.com/groups/test-${i + 1}`, anyday: true,
}));
const GROUPS_KEY = 'hawkeye_flock_groups_undefined';
if (!localStorage.getItem(GROUPS_KEY)) localStorage.setItem(GROUPS_KEY, JSON.stringify(GROUPS));

function Harness(): React.ReactNode {
  const safety = useFlockSafety();
  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white">
      <MassFlockPosting
        onClose={() => { /* harness: no-op */ }}
        getPreparedContent={() => 'Hail season is here. Book your free roof inspection today.'}
        readyImageSrc={null}
        onDownloadImage={() => { /* harness: no-op */ }}
        safety={safety}
        preselectGroupIds={GROUPS.map((g) => g.id)}
        autoStart
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthProvider><ToastProvider><Harness /></ToastProvider></AuthProvider>,
);
