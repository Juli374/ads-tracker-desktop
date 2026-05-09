import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
}

// Дефолтный контекст: useTheme() работает без ThemeProvider'а (e.g. в тестах,
// где MainLayout рендерится без обёртки). Setter — no-op, mode='system'.
const noopTheme: ThemeContextValue = {
  mode: 'system',
  resolved: 'light',
  setMode: () => undefined,
  cycle: () => undefined,
};
const ThemeContext = createContext<ThemeContextValue>(noopTheme);
const STORAGE_KEY = 'theme:mode';

const isThemeMode = (s: string): s is ThemeMode =>
  s === 'light' || s === 'dark' || s === 'system';

const readMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage?.getItem(STORAGE_KEY);
  return stored && isThemeMode(stored) ? stored : 'system';
};

const matchPrefersDark = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const resolveMode = (mode: ThemeMode): Resolved =>
  mode === 'system' ? (matchPrefersDark() ? 'dark' : 'light') : mode;

const applyClass = (resolved: Resolved) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [resolved, setResolved] = useState<Resolved>(() => resolveMode(readMode()));

  // Apply class и persist при смене mode.
  useEffect(() => {
    const r = resolveMode(mode);
    setResolved(r);
    applyClass(r);
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem(STORAGE_KEY, mode);
    }
  }, [mode]);

  // Слушаем системную тему — реагируем только в режиме 'system'.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (mode === 'system') {
        const r: Resolved = mq.matches ? 'dark' : 'light';
        setResolved(r);
        applyClass(r);
      }
    };
    // Совместимость со старыми Safari.
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
  }, []);

  const cycle = useCallback(() => {
    setModeState((cur) => (cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
