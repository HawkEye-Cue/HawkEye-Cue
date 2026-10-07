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
    <div className="panel flex items-center gap-3 py-3">
      <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-lg shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className={`text-xl font-extrabold ${accentCls} leading-tight truncate`}>{value}</p>
        <p className="text-[11px] text-slate-400 font-medium">{label}</p>
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
    <div className={`panel ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>}
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
      className={`py-3 px-5 bg-amber-500 text-black text-sm font-bold rounded-xl disabled:opacity-50 hover:opacity-90 active:scale-[0.99] transition-all ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Hero header ──────────────────────────────────────────────────────────────
// The big title band over the dark hawk-eye photo (the "Sales" header look).
export function HeroHeader({ title, subtitle, right, image }: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  image?: string; // optional hawk-eye photo URL; falls back to an amber eye glow
}) {
  // When no image is passed, the hero is transparent so the page's hawk background
  // shows straight through (just a soft dark scrim for text legibility).
  const bg = image
    ? `linear-gradient(90deg, rgba(10,15,25,0.96) 0%, rgba(10,15,25,0.75) 45%, rgba(10,15,25,0.25) 100%), url(${image})`
    : 'linear-gradient(90deg, rgba(5,8,15,0.55) 0%, rgba(5,8,15,0.15) 60%, rgba(5,8,15,0.0) 100%)';
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 px-5 py-7 mb-1"
      style={{ background: bg, backgroundSize: 'cover', backgroundPosition: 'right center' }}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight drop-shadow">{title}</h2>
          {subtitle && <p className="text-xs sm:text-sm text-slate-200/80 mt-1">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  );
}

// ─── Sub-nav pills ────────────────────────────────────────────────────────────
// The "Overview / Sales by Source / Products / Team / Goals" style tab row.
export function PillTabs<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
            active === t.id
              ? 'bg-amber-500 text-black'
              : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Donut chart (pure SVG, no deps) ────────────────────────────────────────────
export function DonutChart({ data, centerLabel, centerValue, size = 160, thickness = 22 }: {
  data: { label: string; value: number; color?: string }[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circ;
          const seg = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={d.color || BAR_COLORS[i % BAR_COLORS.length]}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return seg;
        })}
      </svg>
      <div className="min-w-0 flex-1">
        {centerValue && (
          <div className="mb-2">
            <p className="text-xl font-extrabold text-white leading-none">{centerValue}</p>
            {centerLabel && <p className="text-[11px] text-slate-400">{centerLabel}</p>}
          </div>
        )}
        <div className="space-y-1">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-300 truncate">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color || BAR_COLORS[i % BAR_COLORS.length] }} />
                {d.label}
              </span>
              <span className="text-slate-400 shrink-0 ml-2">{Math.round((d.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Line/area chart (pure SVG, no deps) ─────────────────────────────────────────
export function LineChart({ points, height = 120, color = '#f59e0b' }: {
  points: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points.map((p) => p.value));
  const w = 100; // use a 0-100 viewBox for responsive width
  const stepX = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((p, i) => ({ x: i * stepX, y: height - (p.value / max) * (height - 10) - 4 }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${w} ${height} L 0 ${height} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <defs>
          <linearGradient id="hc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#hc-area)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {points.map((p, i) => (
          <span key={i} className="text-[10px] text-slate-400">{p.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Black panel (in-your-face black/white/yellow look) ──────────────────────
// Pure black card with a thin border — replaces the grey glass-card on the
// dashboard pages for the bold black/white/yellow aesthetic.
export function Panel({ title, right, children, className = '' }: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-black/70 backdrop-blur-sm p-4 shadow-xl shadow-black/40 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

// Bold stat card — black panel, big white number, yellow icon chip, optional trend.
export function BoldStat({ icon, label, value, trend }: {
  icon: string;
  label: string;
  value: string | number;
  trend?: { dir: 'up' | 'down'; text: string };
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/70 backdrop-blur-sm p-4 shadow-xl shadow-black/40">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-500 text-black flex items-center justify-center text-lg font-black shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-2xl font-extrabold text-white leading-none truncate">{value}</p>
          <p className="text-[11px] text-slate-400 mt-1 uppercase tracking-wide">{label}</p>
        </div>
      </div>
      {trend && (
        <p className={`text-[11px] font-bold mt-2 ${trend.dir === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend.dir === 'up' ? '▲' : '▼'} {trend.text}
        </p>
      )}
    </div>
  );
}

// ─── Light stat tile (white card w/ green trend) ──────────────────────────────
export function LightStat({ icon, label, value, trend }: {
  icon: string;
  label: string;
  value: string | number;
  trend?: { dir: 'up' | 'down'; text: string };
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-amber-400 text-black flex items-center justify-center text-lg font-black shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xl font-extrabold text-slate-900 leading-none truncate">{value}</p>
          <p className="text-[11px] text-slate-500 mt-1">{label}</p>
        </div>
      </div>
      {trend && (
        <p className={`text-[11px] font-bold mt-2 ${trend.dir === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
          {trend.dir === 'up' ? '▲' : '▼'} {trend.text}
        </p>
      )}
    </div>
  );
}

// ─── Segmented control (Folios / Quarter / Month / Annual) ─────────────────────
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex bg-black/40 border border-white/10 rounded-xl p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            value === o.id ? 'bg-amber-500 text-black' : 'text-slate-300 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Combo chart: bars + connecting line with dots (the "Sales Over Time" look) ─
export function ComboChart({ points, height = 180 }: {
  points: { label: string; bar: number; line: number }[];
  height?: number;
}) {
  if (points.length === 0) return null;
  const maxBar = Math.max(1, ...points.map((p) => p.bar));
  const maxLine = Math.max(1, ...points.map((p) => p.line));
  const w = 100;
  const padBottom = 16;
  const plotH = height - padBottom;
  const step = w / points.length;
  const lineCoords = points.map((p, i) => ({
    x: i * step + step / 2,
    y: plotH - (p.line / maxLine) * (plotH - 8) - 2,
  }));
  const linePath = lineCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {/* bars */}
        {points.map((p, i) => {
          const bh = (p.bar / maxBar) * (plotH - 8);
          const bw = step * 0.5;
          const bx = i * step + (step - bw) / 2;
          return <rect key={i} x={bx} y={plotH - bh} width={bw} height={bh} rx="0.6" fill="#f59e0b" opacity="0.55" />;
        })}
        {/* connecting line */}
        <path d={linePath} fill="none" stroke="#fbbf24" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        {lineCoords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="1.5" fill="#fbbf24" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {points.map((p, i) => (
          <span key={i} className="text-[10px] text-slate-400 flex-1 text-center">{p.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Period dropdown (folio / month / quarter / annual / all / saved folios) ──
export function PeriodDropdown({ options, value, onChange }: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-black/60 border border-white/15 rounded-xl pl-3 pr-8 py-2 text-xs font-bold text-white cursor-pointer hover:border-amber-500/50 focus:outline-none focus:border-amber-500"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-slate-900 text-white">{o.label}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-400 text-[10px]">▼</span>
    </div>
  );
}
