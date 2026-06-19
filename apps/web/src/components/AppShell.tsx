import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import HawkAnimations from './HawkAnimations';

const navItems = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/calendar', label: 'Calendar', icon: '📅' },
  { path: '/create', label: 'Create', icon: '✨' },
  { path: '/opportunities', label: 'Leads', icon: '🎯' },
  { path: '/network', label: 'Collaborate', icon: '🤝' },
  { path: '/appreciations', label: 'Thanks', icon: '🙏' },
  { path: '/settings', label: 'More', icon: '⚙️' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <HawkAnimations />
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-700 px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-wider uppercase drop-shadow-lg shrink-0">HawkEye-Cue</h1>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link to="/profile" className="text-sm text-slate-400 hover:text-blue-400 truncate max-w-[120px] sm:max-w-[200px]">
            {user?.email}
          </Link>
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-red-400 shrink-0"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-4 max-w-4xl mx-auto w-full pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t-2 border-blue-500/30 px-1 sm:px-2 pt-2 sm:pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex justify-around sm:justify-center sm:gap-1 shadow-lg shadow-blue-900/10 z-50">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center min-w-[44px] min-h-[44px] justify-center px-1 sm:px-3 py-1 sm:py-2 rounded-xl text-xs sm:text-sm transition-all ${
              location.pathname === item.path
                ? 'text-blue-400 font-bold bg-blue-950/50 scale-105'
                : 'text-slate-200 hover:text-white hover:bg-slate-800'
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
