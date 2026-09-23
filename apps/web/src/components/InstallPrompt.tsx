import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'hawkeye_install_dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIos(): boolean {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
}

/**
 * Prompts users to install HawkEye-Cue as an app.
 * - Android/Chrome: real install via beforeinstallprompt.
 * - iOS Safari: shows the Add-to-Home-Screen instructions (no programmatic API).
 * Installing unlocks the Android "Share → HawkEye-Cue" share target.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // Already installed, or dismissed before — don't nag.
    if (isStandalone()) return;
    let dismissedAt = 0;
    try { dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0); } catch { /* ignore */ }
    // Re-offer after 14 days if previously dismissed.
    if (dismissedAt && Date.now() - dismissedAt < 14 * 24 * 60 * 60 * 1000) return;

    if (isIos()) {
      // iOS can't auto-prompt — show the manual hint after a short delay.
      const t = setTimeout(() => { setIosHint(true); setShow(true); }, 4000);
      return () => clearTimeout(t);
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9996] w-[calc(100%-1.5rem)] max-w-sm px-3">
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl p-4 flex items-start gap-3">
        <span className="text-2xl shrink-0">🦅</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Add HawkEye-Cue to your phone</p>
          {iosHint ? (
            <p className="text-[11px] text-slate-400 mt-1 leading-snug">
              Tap the <span className="text-white font-semibold">Share</span> button, then{' '}
              <span className="text-white font-semibold">"Add to Home Screen"</span> — then you can share posts straight to HawkEye.
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1 leading-snug">
              Install the app to get a home-screen icon and share posts to HawkEye from anywhere.
            </p>
          )}
          <div className="flex gap-2 mt-2.5">
            {!iosHint && (
              <button
                onClick={install}
                className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-[11px] font-bold rounded-lg active:scale-95 transition-all"
              >
                Install app
              </button>
            )}
            <button onClick={dismiss} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-[11px] font-medium rounded-lg">
              {iosHint ? 'Got it' : 'Not now'}
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="text-slate-500 hover:text-white text-sm shrink-0" aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}
