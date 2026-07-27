import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import HawkAnimations from './HawkAnimations';
import GuidedTour from './GuidedTour';
import SetupWizard from './SetupWizard';

const navItems = [
  { path: '/', label: 'Home', icon: '🏠', tour: 'home' },
  { path: '/create', label: 'Create', icon: '✨', tour: 'create' },
  { path: '/opportunities', label: 'Leads', icon: '🎯', tour: 'leads' },
  { path: '/sales', label: 'Sales', icon: '💰', tour: 'sales' },
  { path: '/network', label: 'Network', icon: '🤝', tour: 'network' },
  { path: '/team', label: 'Summit', icon: '🏔️', tour: 'team' },
  { path: '/settings', label: 'More', icon: '⚙️', tour: 'settings' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, logout, getToken } = useAuth();

  // Load display names from server on startup (cross-device persistence)
  useEffect(() => {
    if (!user?.sub) return;
    async function loadNames() {
      try {
        const token = await getToken();
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
        const prefs = await client.request<any>('GET', '/profile/preferences');
        if (prefs.displayNames && typeof prefs.displayNames === 'object') {
          localStorage.setItem('hawkeye_display_names', JSON.stringify(prefs.displayNames));
        }
      } catch { /* ignore */ }
    }
    loadNames();
  }, [user?.sub]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showTour, setShowTour] = useState(() => {
    const key = user?.sub ? `hawkeye_tour_done_${user.sub}` : 'hawkeye_tour_done';
    return !localStorage.getItem(key);
  });
  const [showSetupWizard, setShowSetupWizard] = useState(() => {
    const key = user?.sub ? `hawkeye_setup_complete_${user.sub}` : 'hawkeye_setup_complete';
    return !localStorage.getItem(key);
  });

  function handleTourComplete() {
    const key = user?.sub ? `hawkeye_tour_done_${user.sub}` : 'hawkeye_tour_done';
    localStorage.setItem(key, 'true');
    setShowTour(false);
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <HawkAnimations />
      {showTour && <GuidedTour onComplete={handleTourComplete} />}
      {!showTour && showSetupWizard && (
        <SetupWizard onComplete={() => {
          const key = user?.sub ? `hawkeye_setup_complete_${user.sub}` : 'hawkeye_setup_complete';
          localStorage.setItem(key, 'true');
          setShowSetupWizard(false);
        }} />
      )}

      {/* Top Bar — bright glassmorphism */}
      <header className="sticky top-0 z-40 border-b border-white/20 px-3 sm:px-4 py-3 flex flex-col items-center gap-1" style={{ background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-wider uppercase gradient-text">HawkEye-Cue</h1>
        <div className="flex items-center gap-3">
          <Link to="/profile" className="text-sm text-slate-400 hover:text-blue-400 transition-colors">
            {user?.email}
          </Link>
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main key={location.pathname} className="p-3 sm:p-4 max-w-4xl mx-auto w-full page-enter relative z-10 bg-slate-950" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
        {children}
      </main>

      {/* Bottom Navigation — glassmorphism */}
      <nav
        className="fixed bottom-0 left-0 right-0 border-t border-white/10 px-1 sm:px-2 pt-2 sm:pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex justify-around sm:justify-center sm:gap-1 z-50"
        style={{ background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            data-tour={item.tour}
            className={`flex flex-col items-center min-w-[44px] min-h-[44px] justify-center px-1 sm:px-3 py-1 sm:py-2 rounded-xl text-xs sm:text-sm transition-all duration-200 ${
              location.pathname === item.path
                ? 'text-blue-400 font-bold bg-blue-500/10 scale-105 shadow-sm shadow-blue-500/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="text-xl sm:text-2xl">{item.icon}</span>
            <span className="mt-0.5 hidden sm:block">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
