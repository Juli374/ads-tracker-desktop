import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
}

interface ToastContextValue {
  show(message: string, tone?: ToastTone, durationMs?: number): string;
  success(message: string, durationMs?: number): string;
  error(message: string, durationMs?: number): string;
  info(message: string, durationMs?: number): string;
  dismiss(id: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastTone, number> = {
  info: 3000,
  success: 3000,
  error: 6000,
};

let nextId = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info', durationMs?: number) => {
      const id = `t${++nextId}`;
      const duration = durationMs ?? DEFAULT_DURATION[tone];
      setToasts((prev) => [...prev, { id, message, tone, durationMs: duration }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m, d) => show(m, 'success', d),
      error: (m, d) => show(m, 'error', d),
      info: (m, d) => show(m, 'info', d),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ToastViewport: React.FC<{
  toasts: Toast[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
};

const TONE_STYLES: Record<
  ToastTone,
  { icon: React.ElementType; iconClass: string; ringClass: string }
> = {
  info: {
    icon: Info,
    iconClass: 'text-zinc-500',
    ringClass: 'border-zinc-200',
  },
  success: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-600',
    ringClass: 'border-emerald-200',
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-red-600',
    ringClass: 'border-red-200',
  },
};

const ToastItem: React.FC<{
  toast: Toast;
  onDismiss: () => void;
}> = ({ toast, onDismiss }) => {
  const { icon: Icon, iconClass, ringClass } = TONE_STYLES[toast.tone];
  return (
    <div
      role="status"
      className={`
        pointer-events-auto bg-white border ${ringClass} rounded-lg shadow-card
        px-3.5 py-2.5 flex items-start gap-2.5 min-w-[260px]
      `}
    >
      <Icon size={15} className={`${iconClass} mt-0.5 flex-shrink-0`} strokeWidth={2} />
      <div className="text-xs text-zinc-900 flex-1 leading-relaxed">{toast.message}</div>
      <button
        onClick={onDismiss}
        className="text-zinc-400 hover:text-zinc-700 transition-colors mt-0.5"
        aria-label="Close"
      >
        <X size={13} />
      </button>
    </div>
  );
};
