import { useEffect, useRef, useState } from 'react';

/** Staggered rise-in for a grid of cards. Children set style={{ ['--i' as any]: n }}.
 *  Once the entrance finishes it drops the animation classes so per-child
 *  transitions (hover, etc.) are no longer overridden. */
export function SeatedEnter({
  children,
  className,
  count = 12,
}: {
  children: React.ReactNode;
  className?: string;
  count?: number;
}) {
  const [phase, setPhase] = useState<'idle' | 'play' | 'done'>('idle');
  const raf = useRef(0);
  const timer = useRef(0);

  useEffect(() => {
    raf.current = requestAnimationFrame(() => setPhase('play'));
    timer.current = window.setTimeout(() => setPhase('done'), 800 + count * 70 + 200);
    return () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(timer.current);
    };
  }, [count]);

  const cls =
    phase === 'done'
      ? className
      : `seated-enter${phase === 'play' ? ' play' : ''}${className ? ` ${className}` : ''}`;

  return <div className={cls}>{children}</div>;
}
