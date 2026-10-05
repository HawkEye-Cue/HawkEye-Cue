import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCalendar } from '../contexts/CalendarContext';
import { useToast } from '../contexts/ToastContext';
import { useMode } from '../contexts/ModeContext';
import { useEdition } from '../contexts/EditionContext';
import { ApiClient } from '@social-lead-gen/shared';
import HawkAnimations from './HawkAnimations';
import GuidedTour from './GuidedTour';
import SetupWizard from './SetupWizard';
import InstallPrompt from './InstallPrompt';
import EditionOnboarding from './EditionOnboarding';

// Five primary tabs — plain labels for instant clarity (brand names live on the
// page headers, e.g. "💰 Talons — Who needs follow-up?").
// Grow edition (default) — full built-in pipeline.
const growNavItems = [
  { path: '/', label: 'Today', icon: '🦅', tour: 'home' },
  { path: '/create', label: 'Create', icon: '✨', tour: 'create' },
  { path: '/pipeline', label: 'Pipeline', icon: '🎯', tour: 'leads' },
  { path: '/sales', label: 'Sales', icon: '💰', tour: 'sales' },
];

// Discover edition — focused on finding & pushing opportunities to an external CRM.
// The built-in pipeline is replaced by a CRM tab.
const discoverNavItems = [
  { path: '/', label: 'Today', icon: '🦅', tour: 'home' },
  { path: '/create', label: 'Create', icon: '✨', tour: 'create' },
  { path: '/pipeline', label: 'Leads', icon: '🎯', tour: 'leads' },
  { path: '/crm', label: 'CRM', icon: '🔗', tour: 'crm' },
];

// Everything else lives under "More" — nothing is removed, just tucked away.
const moreItems = [
  { path: '/flight-plan', label: 'Industry Flight Plan', icon: '🗺️', desc: 'Your ready-to-use system for your trade' },
  { path: '/network', label: 'Network', icon: '🤝', desc: 'Referral partners & appreciations' },
  { path: '/team', label: 'Summit (Team)', icon: '🏔️', desc: 'Team calendar, leads & leaderboard' },
  { path: '/dashboard', label: 'Full Dashboard', icon: '🗓️', desc: 'Calendar, engagement & everything at a glance' },
  { path: '/hawk-insights', label: 'Insights', icon: '📊', desc: 'What is producing revenue & engagement' },
  { path: '/keywords', label: 'Keywords', icon: '🔑', desc: 'What HawkEye watches for' },
  { path: '/crm', label: 'CRM Connections', icon: '🔗', desc: 'Push leads to HubSpot, Zapier & more' },
  { path: '/settings', label: 'Settings', icon: '⚙️', desc: 'Trade, accounts, subscription & more' },
  { path: '/privacy', label: 'Privacy & Data', icon: '🔒', desc: 'Export or delete your data, what we access' },
  { path: '/profile', label: 'Profile', icon: '👤', desc: 'Your account & password' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, logout, getToken } = useAuth();
  const { showToast } = useToast();
  const { mode } = useMode();
  const { isDiscover } = useEdition();

  // Edition-aware navigation. Discover swaps the built-in Pipeline for a CRM tab
  // and hides pipeline-only secondary items (Full Dashboard = calendar/scheduling).
  const navItems = isDiscover ? discoverNavItems : growNavItems;
  const visibleMoreItems = isDiscover
    ? moreItems.filter((i) => i.path !== '/dashboard')
    : moreItems;

  // Load display names from server on startup + save user timezone
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
        // Sync folio nicknames map so they show everywhere across devices
        if (prefs.folioNamesMap && typeof prefs.folioNamesMap === 'object') {
          localStorage.setItem('hawkeye_folio_names_map', JSON.stringify(prefs.folioNamesMap));
        }
        // Auto-save user's timezone to profile (detected from browser)
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && prefs.timezone !== tz) {
          client.request('PUT', '/profile/preferences', { timezone: tz }).catch(() => {});
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
  // One-time "do you use a CRM?" edition question (after the tour).
  const [showEditionOnboarding, setShowEditionOnboarding] = useState(() => {
    const key = user?.sub ? `hawkeye_edition_onboarded_${user.sub}` : 'hawkeye_edition_onboarded';
    return !localStorage.getItem(key);
  });

  function handleTourComplete() {
    const key = user?.sub ? `hawkeye_tour_done_${user.sub}` : 'hawkeye_tour_done';
    localStorage.setItem(key, 'true');
    setShowTour(false);
  }

  // ─── Notifications ───
  const { events } = useCalendar();
  const [showNotifs, setShowNotifs] = useState(false);
  const [teamNotifs, setTeamNotifs] = useState<{ id: string; message: string; time: string }[]>([]);

  // Build today's notifications from calendar events + team
  const todayStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })();
  const todayEvents = events.filter((e) => e.date === todayStr && !e.completed);
  const meetings = todayEvents.filter((e) => e.type === 'meeting');
  const reminders = todayEvents.filter((e) => e.type === 'reminder' || e.type === 'task');
  const posts = todayEvents.filter((e) => e.type === 'post');

  const notifications: { id: string; icon: string; text: string; type: string; path: string }[] = [];
  if (meetings.length > 0) notifications.push({ id: 'meetings', icon: '🤝', text: `${meetings.length} meeting${meetings.length !== 1 ? 's' : ''} today`, type: 'info', path: '/' });
  if (reminders.length > 0) notifications.push({ id: 'reminders', icon: '🔔', text: `${reminders.length} follow-up${reminders.length !== 1 ? 's' : ''} due today`, type: 'action', path: '/pipeline' });
  if (posts.length > 0) notifications.push({ id: 'posts', icon: '📤', text: `${posts.length} flock${posts.length !== 1 ? 's' : ''} to post`, type: 'action', path: '/create' });
  for (const tn of teamNotifs) notifications.push({ id: tn.id, icon: '🏆', text: tn.message, type: 'team', path: '/team' });

  const [dismissedNotifs, setDismissedNotifs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('hawkeye_dismissed_notifs') || '[]')); } catch { return new Set(); }
  });
  const visibleNotifications = notifications.filter((n) => !dismissedNotifs.has(n.id));
  const unreadCount = visibleNotifications.length;

  // "More" menu (secondary navigation)
  const [showMore, setShowMore] = useState(false);
  // Desktop sidebar "More" (Hawk) popover
  const [showDesktopMore, setShowDesktopMore] = useState(false);
  // Close the More sheet (mobile + desktop) whenever the route changes
  useEffect(() => { setShowMore(false); setShowDesktopMore(false); }, [location.pathname]);

  // Quick Add Lead state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickSource, setQuickSource] = useState('facebook');
  const [quickLink, setQuickLink] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  // Fetch team notifications on mount
  useEffect(() => {
    async function fetchTeamNotifs() {
      try {
        const token = await getToken();
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
        const result = await client.request<{ notifications: any[] }>('GET', '/team/notifications');
        const recent = (result.notifications || []).filter((n: any) => !n.dismissed).slice(0, 3).map((n: any) => ({
          id: n.id,
          message: `${n.memberName || 'Teammate'} closed ${n.dealName || 'a deal'}!`,
          time: n.closedAt || '',
        }));
        setTeamNotifs(recent);
      } catch { /* ignore */ }
    }
    fetchTeamNotifs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-slate-950">
      <HawkAnimations />

      {/* Desktop sidebar — black with yellow active state. Hidden on mobile (bottom tabs stay). */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-60 flex-col bg-black border-r border-white/10 z-40">
        <div className="px-5 py-5 border-b border-white/10">
          <span className="text-lg font-extrabold tracking-wider uppercase text-white">HAWKEYE<span className="text-amber-400">-CUE</span></span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {[...navItems, ...visibleMoreItems].map((item: any) => {
            const activeNav = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm font-semibold transition-all border-l-4 ${
                  activeNav
                    ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="text-lg w-5 text-center">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <Link to="/profile" className="block text-xs text-slate-400 hover:text-white truncate">{user?.email}</Link>
          <button onClick={logout} className="mt-1 text-xs text-slate-500 hover:text-red-400">Logout</button>
        </div>
      </aside>

      {showTour && <GuidedTour onComplete={handleTourComplete} />}
      {!showTour && showEditionOnboarding && (
        <EditionOnboarding onDone={() => setShowEditionOnboarding(false)} />
      )}
      {!showTour && !showEditionOnboarding && showSetupWizard && (
        <SetupWizard onComplete={() => {
          const key = user?.sub ? `hawkeye_setup_complete_${user.sub}` : 'hawkeye_setup_complete';
          localStorage.setItem(key, 'true');
          setShowSetupWizard(false);
        }} />
      )}

      {/* Top Bar — bright glassmorphism. Hidden on desktop (sidebar handles branding/profile). */}
      <header className="lg:hidden sticky top-0 z-40 border-b border-white/20 px-3 sm:px-4 py-3 flex flex-col items-center gap-1" style={{ background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-wider uppercase gradient-text">HawkEye-Cue</h1>
        <div className="flex items-center gap-3">
          {/* Mode pill — quick way to find the Guided/Pro toggle */}
          <Link
            to="/settings"
            title="Change app mode in Settings"
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${mode === 'guided' ? 'text-amber-300 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20' : 'text-blue-300 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20'}`}
          >
            {mode === 'guided' ? '🧭 Guided' : '⚡ Pro'}
          </Link>
          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="relative text-slate-400 hover:text-white transition-colors p-1"
            >
              <span className="text-lg">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {showNotifs && (
              <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-0 top-16 sm:top-full sm:mt-2 w-auto sm:w-72 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Notifications</span>
                  <button onClick={() => setShowNotifs(false)} className="text-xs text-slate-400 hover:text-white">✕</button>
                </div>
                {visibleNotifications.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-500">All caught up! 🦅</div>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    {visibleNotifications.map((n) => (
                      <div key={n.id} className="px-3 py-2.5 border-b border-white/5 flex items-center gap-2 hover:bg-white/5 group">
                        <Link to={n.path} onClick={() => setShowNotifs(false)} className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-base">{n.icon}</span>
                          <span className="text-xs text-slate-300 truncate">{n.text}</span>
                        </Link>
                        <button
                          onClick={(e) => { e.stopPropagation(); const updated = new Set(dismissedNotifs); updated.add(n.id); setDismissedNotifs(updated); sessionStorage.setItem('hawkeye_dismissed_notifs', JSON.stringify([...updated])); }}
                          className="text-slate-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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

      {/* Desktop Sidebar — black, logo + vertical nav, amber active item. lg+ only. */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-60 flex-col border-r border-white/10 bg-black z-40">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-white/5">
          <span className="text-2xl">🦅</span>
          <span className="text-lg font-extrabold tracking-wide text-white uppercase">HawkEye<span className="text-amber-400">-Cue</span></span>
        </div>
        {/* Primary nav only — Today / Create / Pipeline / Sales. Everything else
            lives under the Hawk menu at the bottom. */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const activeNav = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeNav
                    ? 'bg-amber-500 text-black font-bold shadow shadow-amber-500/20'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="text-lg w-5 text-center">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom — Hawk menu button (holds everything else) + logout */}
        <div className="relative px-2 py-3 border-t border-white/5">
          <button
            onClick={() => setShowDesktopMore((s) => !s)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              visibleMoreItems.some((mi) => mi.path === location.pathname)
                ? 'bg-amber-500 text-black font-bold'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="text-lg w-5 text-center">🦅</span>
            <span className="truncate flex-1 text-left">More</span>
            <span className="text-xs text-slate-500">{showDesktopMore ? '▾' : '▸'}</span>
          </button>

          {showDesktopMore && (
            <div className="absolute left-2 right-2 bottom-16 bg-black border border-white/10 rounded-xl shadow-2xl shadow-black/60 p-1.5 max-h-80 overflow-y-auto z-50">
              {visibleMoreItems.map((item) => {
                const activeNav = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setShowDesktopMore(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      activeNav ? 'bg-amber-500 text-black font-bold' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="text-lg w-5 text-center">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
              <div className="border-t border-white/10 mt-1 pt-1 px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 truncate max-w-[8rem]" title={user?.email}>{user?.email}</span>
                <button onClick={logout} className="text-[11px] text-slate-400 hover:text-red-400">Logout</button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content — shifts right of the sidebar on desktop */}
      <main key={location.pathname} className="p-3 sm:p-4 lg:p-6 max-w-4xl lg:max-w-5xl mx-auto lg:ml-60 w-full page-enter relative z-10 bg-slate-950" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
        {children}
      </main>

      {/* Bottom Navigation — mobile only (desktop uses the sidebar) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 border-t border-white/10 px-1 sm:px-2 pt-2 sm:pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex justify-around sm:justify-center sm:gap-1 z-50"
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
            <span className="mt-0.5 hidden sm:block leading-tight text-center">{item.label}</span>
          </Link>
        ))}
        {/* More — secondary navigation */}
        <button
          onClick={() => setShowMore(true)}
          data-tour="more"
          className={`flex flex-col items-center min-w-[44px] min-h-[44px] justify-center px-1 sm:px-3 py-1 sm:py-2 rounded-xl text-xs sm:text-sm transition-all duration-200 ${
            moreItems.some((m) => m.path === location.pathname)
              ? 'text-blue-400 font-bold bg-blue-500/10 scale-105'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <span className="text-xl sm:text-2xl">⚙️</span>
          <span className="mt-0.5 hidden sm:block leading-tight">More</span>
        </button>
      </nav>

      {/* More menu — bottom sheet */}
      {showMore && (
        <div className="fixed inset-0 z-[9997] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowMore(false)}>
          <div className="w-full sm:max-w-sm bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl mb-16 sm:mb-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-base">More</h3>
              <button onClick={() => setShowMore(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>
            <div className="space-y-1.5">
              {visibleMoreItems.map((m) => (
                <Link
                  key={m.path}
                  to={m.path}
                  onClick={() => setShowMore(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${location.pathname === m.path ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-800 hover:bg-slate-700 border border-transparent'}`}
                >
                  <span className="text-2xl shrink-0">{m.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{m.label}</p>
                    <p className="text-[11px] text-slate-400 truncate">{m.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add-to-Home-Screen prompt (only after tour + setup are done) */}
      {!showTour && !showEditionOnboarding && !showSetupWizard && <InstallPrompt />}

      {/* Quick Add Lead — floating button (mobile-friendly) */}
      <button
        onClick={() => setShowQuickAdd(true)}
        className="fixed bottom-20 right-4 w-12 h-12 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center z-40 active:scale-90 transition-transform"
        title="Quick add a lead"
      >
        <span className="text-xl">🎯</span>
      </button>

      {showQuickAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-[9998] px-3 pb-3 sm:pb-0" onClick={() => setShowQuickAdd(false)}>
          <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-base">🎯 Quick Save Lead</h3>
              <button onClick={() => setShowQuickAdd(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="Person's name *"
                className="w-full px-3 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
                autoFocus
              />
              <select value={quickSource} onChange={(e) => setQuickSource(e.target.value)} className="w-full px-3 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm">
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="linkedin">LinkedIn</option>
                <option value="referral">Referral</option>
                <option value="cold-call">Cold Call</option>
                <option value="other">Other</option>
              </select>
              <input
                type="url"
                value={quickLink}
                onChange={(e) => setQuickLink(e.target.value)}
                placeholder="+ Link to post (optional)"
                className="w-full px-3 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
              />
              <button
                onClick={async () => {
                  if (!quickName.trim()) return;
                  setQuickSaving(true);
                  try {
                    const token = await getToken();
                    const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                    await client.request('POST', '/opportunities', {
                      sourceAuthor: quickName.trim(),
                      sourceContent: `Quick-saved from mobile (${quickSource})`,
                      sourcePlatform: quickSource === 'referral' || quickSource === 'cold-call' ? 'other' : quickSource,
                      sourceUrl: quickLink.trim() || '',
                      keywordId: 'manual-entry',
                      leadSource: quickSource,
                    });
                    setQuickName('');
                    setQuickLink('');
                    setShowQuickAdd(false);
                    localStorage.setItem(`hawkeye_first_lead_${user?.sub}`, 'true');
                    showToast('✓ Lead saved — ' + quickName.trim());
                  } catch {
                    showToast('❌ Failed to save lead');
                  } finally { setQuickSaving(false); }
                }}
                disabled={quickSaving || !quickName.trim()}
                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg disabled:opacity-50 active:scale-95 transition-all"
              >
                {quickSaving ? 'Saving...' : '✓ Save Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
