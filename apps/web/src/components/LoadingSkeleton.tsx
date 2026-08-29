/**
 * Loading skeleton component — shows gray placeholder shapes
 * instead of "Loading..." text. Feels faster and more polished.
 */

interface LoadingSkeletonProps {
  /** Number of rows to show */
  rows?: number;
  /** Show a card-like skeleton */
  variant?: 'card' | 'list' | 'stats';
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div className={`bg-slate-700/60 rounded animate-pulse ${className || ''}`} />
  );
}

export default function LoadingSkeleton({ rows = 3, variant = 'list' }: LoadingSkeletonProps) {
  if (variant === 'stats') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-800 rounded-lg p-3 space-y-2">
            <Shimmer className="h-6 w-16 mx-auto" />
            <Shimmer className="h-3 w-12 mx-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-slate-800 border border-white/5 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Shimmer className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-3.5 w-2/3" />
                <Shimmer className="h-3 w-1/3" />
              </div>
            </div>
            <Shimmer className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  // Default: list rows
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 bg-slate-800 rounded-lg px-3 py-3">
          <Shimmer className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-3 w-3/4" />
            <Shimmer className="h-2.5 w-1/2" />
          </div>
          <Shimmer className="h-6 w-14 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}
