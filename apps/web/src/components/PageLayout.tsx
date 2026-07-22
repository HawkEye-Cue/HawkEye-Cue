import type { ReactNode } from 'react';

interface PageLayoutProps {
  left: ReactNode;
  right: ReactNode;
}

/**
 * Two-column page layout — same pattern as CreatePage.
 * On mobile: stacked. On lg+: side by side.
 */
export default function PageLayout({ left, right }: PageLayoutProps) {
  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      <div className="min-w-0 space-y-4">{left}</div>
      <div className="min-w-0 space-y-4">{right}</div>
    </div>
  );
}
