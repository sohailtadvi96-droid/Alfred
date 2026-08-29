import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_GROUND, GROUND_STORAGE_KEY, isKnownGround } from './grounds';

interface ThemeContextValue {
  ground: string;
  setGround: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): string {
  try {
    const v = localStorage.getItem(GROUND_STORAGE_KEY);
    if (isKnownGround(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_GROUND;
}

function applyGround(id: string) {
  const root = document.documentElement;
  if (id === DEFAULT_GROUND) root.removeAttribute('data-ground');
  else root.setAttribute('data-ground', id);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [ground, setGroundState] = useState<string>(readStored);

  useEffect(() => {
    applyGround(ground);
  }, [ground]);

  const setGround = useCallback((id: string) => {
    const next = isKnownGround(id) ? id : DEFAULT_GROUND;
    setGroundState(next);
    try {
      localStorage.setItem(GROUND_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ ground, setGround }), [ground, setGround]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
