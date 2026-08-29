import type { CSSProperties } from 'react';
import { money } from '@/lib/format';
import { readableInk } from '@/lib/color';
import { Icon } from '@/components/Icon';
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
  onEdit,
  style,
}: {
  cat: Category;
  rank: number;
  spentCents: number;
  count: number;
  sharePct: number;
  active: boolean;
  onToggle: () => void;
  onEdit: () => void;
  style?: CSSProperties;
}) {
  const ink = readableInk(cat.color);
  const empty = count === 0;

  const bandStyle = {
    '--band': `linear-gradient(135deg, ${cat.color}, color-mix(in srgb, ${cat.color} 60%, #000))`,
    color: ink,
  } as CSSProperties;

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
      <div className="catcard-band" style={bandStyle}>
        <span className="catcard-rank">{String(rank).padStart(2, '0')}</span>
        <div className="catcard-tools" onClick={(e) => e.stopPropagation()}>
          <CategoryColorButton cat={cat} />
          <button
            type="button"
            className="cat-edit"
            onClick={onEdit}
            data-tip="Edit category"
            aria-label={`Edit ${cat.label}`}
          >
            <Icon name="pencil" size={12} />
          </button>
        </div>
        <span className="catcard-share">{empty ? '—' : `${sharePct}% of month`}</span>
      </div>

      <div className="catcard-body">
        <div className="catcard-title">{cat.label}</div>
        <div className="catcard-sub">{cat.direction === 'credit' ? 'Money in' : 'Money out'}</div>

        <div className="catcard-foot">
          <span className="catcard-big">
            {money(spentCents, true)}
            <small>{cat.direction === 'credit' ? 'in' : 'spent'}</small>
          </span>
          <span className="catcard-entries">
            {count} {count === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>
    </div>
  );
}
