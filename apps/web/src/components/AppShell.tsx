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
  { path: '/appreciations', label: 'Appreciations', icon: '🙏' },
  { path: '/settings', label: 'More', icon: '⚙️' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <HawkAnimations />
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-white tracking-wider uppercase drop-shadow-lg">HawkEye-Cue</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{user?.email}</span>
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-red-400"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-slate-900 border-t-2 border-blue-500/30 px-2 py-3 flex justify-center gap-1 shadow-lg shadow-blue-900/10">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center px-3 py-2 rounded-xl text-sm transition-all ${
              location.pathname === item.path
                ? 'text-blue-400 font-bold bg-blue-950/50 scale-105'
                : 'text-slate-200 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="mt-0.5">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
