import { useCallback, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '@/components/Icon';
import type { TileSize } from '@/features/home/layout';
import type { Snapshot } from '@/features/home/types';

const SIZES: TileSize[] = ['sm', 'md', 'lg'];

export function Tile({
  snapshot,
  size,
  onSizeChange,
}: {
  snapshot: Snapshot;
  size: TileSize;
  onSizeChange: (size: TileSize) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: snapshot.module,
  });
  const [glow, setGlow] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setGlow({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const style: CSSProperties & Record<`--${string}`, string | number> = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    ...(glow ? { '--hx': `${glow.x}px`, '--hy': `${glow.y}px` } : {}),
  };

  // sm = basic info only; md = + moreStats and the primary action; lg = + detail and every action.
  const stats = size === 'sm' ? snapshot.stats : [...snapshot.stats, ...(snapshot.moreStats ?? [])];
  const showDetail = size === 'lg' && !!snapshot.detail;
  const actions = size === 'lg' ? (snapshot.actions ?? []) : size === 'md' ? (snapshot.actions ?? []).slice(0, 1) : [];
  const showFoot = showDetail || actions.length > 0;

  function cycleSize() {
    onSizeChange(SIZES[(SIZES.indexOf(size) + 1) % SIZES.length]);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="home-tile"
      data-span={size}
      data-module={snapshot.module}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setGlow(null)}
    >
      <div className="home-tile-glow" aria-hidden="true" />
      <div className="home-tile-head">
        <span className="home-tile-icon" data-module={snapshot.module}>
          <Icon name={snapshot.icon} size={14} strokeOverlay />
        </span>
        <span className="home-tile-title">{snapshot.title}</span>
        <span className="home-tile-hint" aria-hidden="true">
          Open
          <Icon name="chevron" size={10} />
        </span>
        {!snapshot.live && <span className="home-tile-preview">Preview</span>}
        <button
          type="button"
          className="home-tile-drag"
          aria-label={`Reorder ${snapshot.title}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <button
          type="button"
          className="home-tile-size"
          onClick={cycleSize}
          aria-label={`Resize ${snapshot.title} (currently ${size})`}
        >
          {size.toUpperCase()}
        </button>
      </div>
      <div className="home-tile-stats">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="home-tile-stat-value num">{s.value}</div>
            <div className="home-tile-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      {showFoot && (
        <div className="home-tile-foot">
          {showDetail && <div className="home-tile-meta">{snapshot.detail}</div>}
          {actions.length > 0 && (
            <div className="home-tile-actions">
              {actions.map((a) => (
                <Link key={a.href} to={a.href} className="home-tile-action">
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      {snapshot.href !== '#' && (
        <Link to={snapshot.href} className="home-tile-link" aria-label={`Open ${snapshot.title}`} />
      )}
    </div>
  );
}
