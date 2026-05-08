import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

export const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 flex items-start gap-3">
    <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
    <div className="text-sm text-red-700">{message}</div>
  </div>
);

export const LoadingRow: React.FC<{ message?: string }> = ({ message }) => (
  <div className="px-5 py-12 flex items-center justify-center gap-2">
    <Loader2 size={16} className="animate-spin text-zinc-400" />
    {message && <div className="text-sm text-zinc-500">{message}</div>}
  </div>
);

export const EmptyState: React.FC<{
  title?: string;
  hint?: React.ReactNode;
}> = ({ title = 'Нет данных за выбранный период.', hint }) => (
  <div className="px-5 py-12 text-center">
    <div className="text-sm text-zinc-500">{title}</div>
    {hint && <div className="text-xs text-zinc-400 mt-1">{hint}</div>}
  </div>
);
