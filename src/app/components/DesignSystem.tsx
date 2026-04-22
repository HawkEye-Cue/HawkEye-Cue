import { ReactNode } from 'react';

export const theme = {
  colors: {
    primaryBlue: '#1D4ED8',
    accentGreen: '#22C55E',
    backgroundLight: '#F8FAFC',
    white: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    statusSuccess: '#22C55E',
    statusScheduled: '#3B82F6',
    statusFailed: '#F97316',
    statusDenied: '#EF4444',
    borderLight: '#E2E8F0',
    surfaceMuted: '#F1F5F9',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 10,
    md: 12,
    lg: 16,
    pill: 999,
  },
};

interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  className?: string;
}

export function HEButton({ children, variant = 'primary', onClick, className = '' }: ButtonProps) {
  const baseStyles = 'px-5 py-3.5 rounded-xl font-medium text-base transition-all';
  const variantStyles = {
    primary: 'bg-[#1D4ED8] text-white hover:bg-[#1e40af] active:bg-[#1e3a8a]',
    secondary: 'bg-white text-[#1D4ED8] border-2 border-[#1D4ED8] hover:bg-[#f0f9ff] active:bg-[#e0f2fe]',
  };

  return (
    <button
      onClick={onClick}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function HECard({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-white rounded-2xl p-4 ${className}`}
      style={{ boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)' }}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  value: string;
  label: string;
}

export function StatCard({ value, label }: StatCardProps) {
  return (
    <HECard className="w-[110px] text-center">
      <div className="text-2xl font-bold text-[#0F172A]">{value}</div>
      <div className="text-xs text-[#64748B] mt-1">{label}</div>
    </HECard>
  );
}

interface TagPillProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function TagPill({ children, active = false, onClick }: TagPillProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-full text-sm transition-all ${
        active
          ? 'bg-[#1D4ED8] text-white'
          : 'bg-[#F1F5F9] text-[#0F172A] hover:bg-[#E2E8F0]'
      }`}
    >
      {children}
    </button>
  );
}

interface StatusBadgeProps {
  status: 'posted' | 'scheduled' | 'failed' | 'denied';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles = {
    posted: { bg: '#22C55E', text: 'Posted' },
    scheduled: { bg: '#3B82F6', text: 'Scheduled' },
    failed: { bg: '#F97316', text: 'Failed' },
    denied: { bg: '#EF4444', text: 'Denied' },
  };

  const { bg, text } = styles[status];

  return (
    <span
      className="px-2.5 py-1.5 rounded-full text-white text-xs font-medium"
      style={{ backgroundColor: bg }}
    >
      {text}
    </span>
  );
}

interface ChecklistItemProps {
  text: string;
  time: string;
  completed?: boolean;
  onToggle?: () => void;
}

export function ChecklistItem({ text, time, completed = false, onToggle }: ChecklistItemProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          completed
            ? 'bg-[#1D4ED8] border-[#1D4ED8]'
            : 'bg-white border-[#E2E8F0] hover:border-[#1D4ED8]'
        }`}
      >
        {completed && (
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="flex-1">
        <div className={`text-base transition-all ${completed ? 'line-through text-[#64748B]' : 'text-[#0F172A]'}`}>
          {text}
        </div>
      </div>
      <div className="text-xs text-[#64748B]">{time}</div>
    </div>
  );
}

interface HEInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  multiline?: boolean;
  className?: string;
}

export function HEInput({ placeholder, value, onChange, multiline = false, className = '' }: HEInputProps) {
  const baseStyles = 'w-full px-3 py-3 rounded-[10px] border border-[#E2E8F0] bg-white text-base text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#1D4ED8]';

  if (multiline) {
    return (
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={`${baseStyles} min-h-[120px] resize-none ${className}`}
      />
    );
  }

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className={`${baseStyles} ${className}`}
    />
  );
}
