import { useEffect, useRef, useState } from 'react';

/** Staggered rise-in for a grid of cards. Children set style={{ ['--i' as any]: n }}. */
export function SeatedEnter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [play, setPlay] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    raf.current = requestAnimationFrame(() => setPlay(true));
    return () => cancelAnimationFrame(raf.current);
  }, []);

  return (
    <div className={`seated-enter${play ? ' play' : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
