import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

/**
 * PageHeader — canonical per-page title bar.
 *
 * Phase Q.2.2 — H1 uses `font-display` (Playfair Display 700) at clamp size
 * 1.75rem..2.5rem with tight tracking. This is the second editorial moment
 * of the app (first is the sidebar wordmark). Inter remains for everything
 * below the H1 — body, table cells, buttons, captions.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, rightSlot }) => (
  <div className="flex items-end justify-between gap-4">
    <div className="space-y-1 min-w-0">
      <h1 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold tracking-[-0.02em] text-zinc-900 leading-tight">
        {title}
      </h1>
      {subtitle != null && (
        <p className="text-sm text-zinc-500">{subtitle}</p>
      )}
    </div>
    {rightSlot != null && <div className="flex-shrink-0">{rightSlot}</div>}
  </div>
);
