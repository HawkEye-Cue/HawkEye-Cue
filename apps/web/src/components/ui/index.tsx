import type { ReactNode } from 'react';

/**
 * HawkEye-Cue UI kit — the shared "Sales vibe" building blocks so every page
 * looks and feels consistent: a bold page header, icon stat cards, section cards,
 * and simple data bars. Dark glass + amber accents, mobile-first, calm spacing.
 */

// ─── Page header ────────────────────────────────────────────────────────────
// Big title + one-line subtitle, with an optional right-side action/control.
export function PageHeader({ icon, title, subtitle, right }: {
  icon?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-white leading-tight">
          {icon ? <span className="mr-1.5">{icon}</span> : null}{title}
        </h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ─── Stat card ──────────────────────────────────────────────────────────────
// Icon tile + big colored number + small label (+ optional trend/sublabel).
const ACCENTS: Record<string, string> = {
  green: 'text-emerald-300',
  amber: 'text-amber-300',
  sky: 'text-sky-300',
  purple: 'text-purple-300',
  pink: 'text-pink-300',
  white: 'text-white',
};

export function StatCard({ icon, label, value, accent = 'amber', sub }: {
  icon: string;
  label: string;
  value: string | number;
  accent?: keyof typeof ACCENTS | string;
  sub?: ReactNode;
}) {
  const accentCls = ACCENTS[accent] || 'text-amber-300';
  return (
    <div className="glass-card flex items-center gap-3 py-3">
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className={`text-lg font-bold ${accentCls} leading-tight truncate`}>{value}</p>
        <p className="text-[11px] text-slate-400">{label}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// A responsive grid of stat cards (2-up on mobile, 4-up on wide screens).
export function StatGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const lg = cols === 4 ? 'lg:grid-cols-4' : cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';
  return <div className={`grid grid-cols-2 gap-3 ${lg}`}>{children}</div>;
}

// ─── Section card ─────────────────────────────────────────────────────────────
// A glass card with a heading and optional right-side control.
export function SectionCard({ title, right, children, className = '' }: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass-card ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Data bar ──────────────────────────────────────────────────────────────
// A labeled horizontal bar (for breakdowns, stages, sources).
export function DataBar({ label, value, max, color = '#f59e0b', suffix }: {
  label: ReactNode;
  value: number;
  max: number;
  color?: string;
  suffix?: ReactNode;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="text-slate-300">{label}</span>
        {suffix !== undefined ? <span className="text-slate-400">{suffix}</span> : <span className="text-slate-400">{value}</span>}
      </div>
      <div className="h-2.5 bg-slate-700/60 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

export const BAR_COLORS = ['#f59e0b', '#fbbf24', '#38bdf8', '#34d399', '#a78bfa', '#f472b6', '#64748b'];

// ─── Primary button ──────────────────────────────────────────────────────────
export function PrimaryButton({ children, onClick, disabled, className = '' }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`py-3 px-5 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-sm font-bold rounded-xl disabled:opacity-50 hover:opacity-90 active:scale-[0.99] transition-all shadow-lg shadow-amber-500/20 ${className}`}
    >
      {children}
    </button>
  );
}
