import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, rightSlot }) => (
  <div className="flex items-end justify-between">
    <div className="space-y-1">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      {subtitle != null && (
        <p className="text-sm text-zinc-500">{subtitle}</p>
      )}
    </div>
    {rightSlot}
  </div>
);
