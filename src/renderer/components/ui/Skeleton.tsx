import React from 'react';

/**
 * Skeleton — pulsing placeholder block. Use for non-blocking layout-stable
 * loading. For tables, use TableRowSkeleton; for KPI cards, use a fixed-height
 * Skeleton inside the existing card frame.
 */
export const Skeleton: React.FC<{
  width?: string;
  height?: string;
  className?: string;
  rounded?: 'sm' | 'md' | 'full' | 'lg';
}> = ({ width, height = 'h-3', className = '', rounded = 'md' }) => {
  const roundedClass =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'lg'
      ? 'rounded-lg'
      : rounded === 'sm'
      ? 'rounded-sm'
      : 'rounded-md';
  return (
    <div
      className={`bg-zinc-100 dark:bg-zinc-800 animate-pulse ${roundedClass} ${height} ${width ?? 'w-full'} ${className}`}
      aria-hidden="true"
    />
  );
};

/**
 * TableRowSkeleton — pre-shaped <tr> with N cells, matching common table widths.
 * Default: first col wider (label), rest narrow tabular cells.
 */
export const TableRowSkeleton: React.FC<{
  columns?: number;
  firstColWide?: boolean;
}> = ({ columns = 6, firstColWide = true }) => (
  <tr className="border-t border-zinc-100">
    {Array.from({ length: columns }).map((_, i) => (
      <td key={i} className={i === 0 ? 'px-5 py-2.5' : 'px-3 py-2.5'}>
        <Skeleton
          width={i === 0 && firstColWide ? 'w-40' : 'w-16'}
          height="h-3"
          className={i === 0 ? '' : 'ml-auto'}
        />
      </td>
    ))}
  </tr>
);

/**
 * Pre-built tbody filled with N row skeletons.
 */
export const TableSkeletonBody: React.FC<{
  rows?: number;
  columns?: number;
}> = ({ rows = 5, columns = 6 }) => (
  <tbody>
    {Array.from({ length: rows }).map((_, i) => (
      <TableRowSkeleton key={i} columns={columns} />
    ))}
  </tbody>
);

/**
 * KPI placeholder: matches the height/visual of the KpiDelta card.
 */
export const KpiSkeleton: React.FC = () => (
  <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-soft">
    <Skeleton width="w-12" height="h-3" />
    <Skeleton width="w-24" height="h-7" className="mt-2" />
    <Skeleton width="w-20" height="h-3" className="mt-1" />
  </div>
);
