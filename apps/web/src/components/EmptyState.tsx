interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Friendly empty state that turns dead ends into next steps.
 * Shows an icon, a title, optional description, and an optional action button.
 */
export default function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4">
      <span className="text-4xl mb-3 opacity-80">{icon}</span>
      <p className="text-sm font-semibold text-white mb-1">{title}</p>
      {description && <p className="text-xs text-slate-400 mb-4 max-w-xs">{description}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
