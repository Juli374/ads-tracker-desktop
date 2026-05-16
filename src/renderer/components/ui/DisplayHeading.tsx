// DisplayHeading — Phase Q.1 primitive.
// Editorial heading in Playfair Display (font-display token), used by:
//   - PageHeader (after Q.2.2 refactor — currently uses inline text-3xl font-semibold)
//   - standalone "marketing feel" hero sections (LockedFeatureCard title, briefing
//     splash, etc.)
//
// Three canonical sizes. `hero` and `page` use clamp() so they scale gracefully
// from narrow drill-down panes to full-window dashboards. `section` is fixed —
// section H2 inside a page should remain stable across widths.
import React from 'react';

export type DisplayHeadingSize = 'page' | 'section' | 'hero';

const SIZE: Record<DisplayHeadingSize, string> = {
  hero: 'text-[clamp(2.5rem,5vw,4rem)] font-bold tracking-[-0.02em]',
  page: 'text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold tracking-[-0.02em]',
  section: 'text-2xl font-bold tracking-tight',
};

export interface DisplayHeadingProps {
  as?: 'h1' | 'h2' | 'h3';
  size?: DisplayHeadingSize;
  children: React.ReactNode;
  className?: string;
}

export const DisplayHeading: React.FC<DisplayHeadingProps> = ({
  as: Tag = 'h1',
  size = 'page',
  children,
  className = '',
}) => (
  <Tag className={`font-display text-zinc-900 ${SIZE[size]} ${className}`}>
    {children}
  </Tag>
);
