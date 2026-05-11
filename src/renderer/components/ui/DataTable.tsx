import React from 'react';

/**
 * DataTable primitives — style-only wrappers for HTML <table>.
 *
 * Per DESIGN.md:
 * - thead text-xs uppercase tracking-wider text-fg-subtle, border-b border-border
 * - tbody rows ~10px 16px padding, border-b border-border
 * - NO zebra stripes
 * - hover row gets surface-2 background
 * - number columns right-aligned, mono+tabular-nums (use `numCol` prop on Td/Th)
 *
 * These are intentionally minimal: virtualization, sorting, etc. live in
 * higher-level page components — these primitives only enforce the visual.
 */

type TableProps = React.TableHTMLAttributes<HTMLTableElement>;

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className = '', children, ...rest }, ref) => (
    <table
      ref={ref}
      className={`w-full border-collapse text-sm text-fg ${className}`.trim()}
      {...rest}
    >
      {children}
    </table>
  ),
);
Table.displayName = 'Table';

type TheadProps = React.HTMLAttributes<HTMLTableSectionElement>;

export const Thead = React.forwardRef<HTMLTableSectionElement, TheadProps>(
  ({ className = '', children, ...rest }, ref) => (
    <thead
      ref={ref}
      className={`bg-bg ${className}`.trim()}
      {...rest}
    >
      {children}
    </thead>
  ),
);
Thead.displayName = 'Thead';

type TbodyProps = React.HTMLAttributes<HTMLTableSectionElement>;

export const Tbody = React.forwardRef<HTMLTableSectionElement, TbodyProps>(
  ({ className = '', children, ...rest }, ref) => (
    <tbody ref={ref} className={className} {...rest}>
      {children}
    </tbody>
  ),
);
Tbody.displayName = 'Tbody';

type TrProps = React.HTMLAttributes<HTMLTableRowElement> & {
  /** Apply a hover-bg state. Default: true (turn off for non-interactive rows). */
  hoverable?: boolean;
};

export const Tr = React.forwardRef<HTMLTableRowElement, TrProps>(
  ({ className = '', hoverable = true, children, ...rest }, ref) => (
    <tr
      ref={ref}
      className={`
        border-b border-border
        ${hoverable ? 'hover:bg-surface-2 transition-colors duration-100 ease-out' : ''}
        ${className}
      `.trim()}
      {...rest}
    >
      {children}
    </tr>
  ),
);
Tr.displayName = 'Tr';

type ThProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  /** Right-align + monospace tabular numerals (for number columns). */
  numCol?: boolean;
};

export const Th = React.forwardRef<HTMLTableCellElement, ThProps>(
  ({ className = '', numCol = false, children, ...rest }, ref) => (
    <th
      ref={ref}
      className={`
        px-4 py-2.5
        text-xs font-medium uppercase tracking-wider text-fg-subtle
        ${numCol ? 'text-right' : 'text-left'}
        ${className}
      `.trim()}
      {...rest}
    >
      {children}
    </th>
  ),
);
Th.displayName = 'Th';

type TdProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  /** Right-align + monospace tabular numerals (for number columns). */
  numCol?: boolean;
};

export const Td = React.forwardRef<HTMLTableCellElement, TdProps>(
  ({ className = '', numCol = false, children, ...rest }, ref) => (
    <td
      ref={ref}
      className={`
        px-4 py-2.5 text-sm
        ${numCol ? 'text-right font-mono tabular-nums' : 'text-left'}
        ${className}
      `.trim()}
      {...rest}
    >
      {children}
    </td>
  ),
);
Td.displayName = 'Td';

/**
 * DataTable — convenience wrapper around `<Table>` for the common case where
 * you just want a styled table without manually composing primitives.
 */
export const DataTable = Table;
