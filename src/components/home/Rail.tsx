import { forwardRef, useEffect, useRef } from 'react';
import { CommandBar } from './CommandBar';
import { RailItem } from './RailItem';
import { useCompleteRailItem } from '@/features/home/hooks';
import type { RailWidth } from '@/features/home/layout';
import type { RailRow } from '@/features/home/types';

function gapLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m free`;
  if (m === 0) return `${h}h free`;
  return `${h}h ${m}m free`;
}

export const Rail = forwardRef<HTMLInputElement, {
  rows: RailRow[];
  width: RailWidth;
  onWidthChange: (w: RailWidth) => void;
}>(function Rail({ rows, width, onWidthChange }, cmdkRef) {
  const nowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const complete = useCompleteRailItem();

  useEffect(() => {
    if (width === 'hidden') return;
    const el = nowRef.current;
    const container = listRef.current;
    if (!el || !container) return;
    el.scrollIntoView({ block: 'center' });
    const raf = requestAnimationFrame(() => {
      container.scrollTop = Math.max(0, container.scrollTop - container.clientHeight * 0.15);
    });
    return () => cancelAnimationFrame(raf);
  }, [width, rows.length]);

  function cycle() {
    onWidthChange(width === 'expanded' ? 'slim' : width === 'slim' ? 'hidden' : 'expanded');
  }

  if (width === 'hidden') {
    // Fully hidden — press '[' (global shortcut, see HomePage) to bring it back.
    return <div className="home-rail" data-width="hidden" aria-hidden="true" />;
  }

  return (
    <aside className="home-rail" data-width={width}>
      <div className="home-rail-head">Today</div>
      <div className="home-rail-list" ref={listRef}>
        {rows.length === 0 && <div className="home-rail-empty">Nothing on today's rail.</div>}
        {rows.map((row) => {
          if (row.kind === 'now') {
            return (
              <div key={row.id} ref={nowRef} className="home-now">
                <span className="home-now-label">NOW</span>
                <span className="home-now-line" />
              </div>
            );
          }
          if (row.kind === 'gap') {
            return (
              <div key={row.id} className="home-gap">
                {gapLabel(row.minutes)}
              </div>
            );
          }
          if (row.kind === 'spacer') {
            return <div key={row.id} style={{ height: row.px }} aria-hidden="true" />;
          }
          return <RailItem key={row.id} item={row} onComplete={(i) => complete.mutate(i)} />;
        })}
      </div>
      <CommandBar ref={cmdkRef} />
      <button
        type="button"
        className="railtoggle"
        onClick={cycle}
        data-tip="Cycle rail width ([)"
        aria-label="Cycle rail width"
        style={{ position: 'absolute', top: 12, right: 12 }}
      >
        [
      </button>
    </aside>
  );
});
