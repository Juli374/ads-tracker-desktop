import React from 'react';

interface CardProps {
  title?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  'data-testid'?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  rightSlot,
  className = '',
  bodyClassName = '',
  children,
  'data-testid': dataTestId,
}) => (
  <div
    data-testid={dataTestId}
    className={`bg-white border border-zinc-200 rounded-lg shadow-soft overflow-hidden ${className}`}
  >
    {(title || rightSlot) && (
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        {rightSlot}
      </div>
    )}
    <div className={bodyClassName}>{children}</div>
  </div>
);
