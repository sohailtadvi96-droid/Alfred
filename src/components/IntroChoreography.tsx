import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';

const SESSION_KEY = 'alfred-intro-done';

type Phase = 'in' | 'hold' | 'out' | 'done';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function replayIntro() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/** Full-screen hero that holds, then submerges — once per session. */
export function IntroChoreography({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return 'done';
    } catch {
      /* ignore */
    }
    return prefersReducedMotion() ? 'done' : 'in';
  });
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (phase === 'done') return;
    const t = timers.current;
    t.push(window.setTimeout(() => setPhase('hold'), 80));
    t.push(window.setTimeout(() => setPhase('out'), 1100));
    t.push(
      window.setTimeout(() => {
        setPhase('done');
        try {
          sessionStorage.setItem(SESSION_KEY, '1');
        } catch {
          /* ignore */
        }
      }, 1750),
    );
    return () => {
      t.forEach(clearTimeout);
      timers.current = [];
    };
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = user?.email ? `Good to see you, ${user.email.split('@')[0]}` : 'Personal butler';

  return (
    <>
      {children}
      {phase !== 'done' && (
        <div className="intro-overlay" data-phase={phase} aria-hidden="true">
          <div className="hg">ALFRED</div>
          <div className="hs">{greeting}</div>
          <div className="hline" />
        </div>
      )}
    </>
  );
}
