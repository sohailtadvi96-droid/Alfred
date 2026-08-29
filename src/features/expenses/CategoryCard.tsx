import { money } from '@/lib/format';
import { readableInk } from '@/lib/color';
import { CategoryColorButton } from './CategoryColorButton';
import type { Category } from './categories';

export function CategoryCard({
  cat,
  rank,
  spentCents,
  count,
  sharePct,
  active,
  onToggle,
  style,
}: {
  cat: Category;
  rank: number;
  spentCents: number;
  count: number;
  sharePct: number;
  active: boolean;
  onToggle: () => void;
  style?: React.CSSProperties;
}) {
  const ink = readableInk(cat.color);
  const empty = count === 0;

  return (
    <div
      className={`catcard${active ? ' active' : ''}${empty ? ' empty' : ''}`}
      style={style}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      data-tip={active ? 'Showing this category — click to clear' : 'Filter the ledger to this category'}
    >
      <div
        className="catcard-band"
        style={{
          background: `linear-gradient(135deg, ${cat.color}, color-mix(in srgb, ${cat.color} 62%, #000))`,
          color: ink,
        }}
      >
        <span className="catcard-rank">{String(rank).padStart(2, '0')}</span>
        <div className="catcard-tools" onClick={(e) => e.stopPropagation()}>
          <CategoryColorButton cat={cat} />
        </div>
        <span className="catcard-share" style={{ color: ink }}>
          {empty ? '—' : `${sharePct}% of month`}
        </span>
      </div>

      <div className="catcard-body">
        <div className="catcard-title">{cat.label}</div>
        <div className="catcard-sub">{cat.direction === 'credit' ? 'Money in' : 'Money out'}</div>

        <div className="catcard-foot">
          <span className="catcard-big">
            {money(spentCents, true)}
            <small>spent</small>
          </span>
          <span className="catcard-entries">
            {count} {count === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>
    </div>
  );
}
