import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { money, shortDate, signedMoney } from '@/lib/format';
import { readableInk } from '@/lib/color';
import { Icon } from '@/components/Icon';
import { CategoryColorButton } from './CategoryColorButton';
import type { Category, Direction } from './categories';

export interface RecentEntry {
  merchant: string | null;
  amountCents: number;
  direction: Direction;
  date: string;
}

export function CategoryCard({
  cat,
  spentCents,
  count,
  sharePct,
  recent,
  onOpen,
  onEdit,
  style,
}: {
  cat: Category;
  spentCents: number;
  count: number;
  sharePct: number;
  recent: RecentEntry[];
  onOpen: () => void;
  onEdit: () => void;
  style?: CSSProperties;
}) {
  const ink = readableInk(cat.color);
  const empty = count === 0;

  // a sheet prints out whenever an entry lands in this category
  const prev = useRef(count);
  const [printKey, setPrintKey] = useState(0);
  useEffect(() => {
    if (count > prev.current) {
      setPrintKey((k) => k + 1);
      const t = setTimeout(() => setPrintKey(0), 950);
      prev.current = count;
      return () => clearTimeout(t);
    }
    prev.current = count;
  }, [count]);

  const cardStyle = {
    ...style,
    '--band': `linear-gradient(135deg, ${cat.color}, color-mix(in srgb, ${cat.color} 60%, #000))`,
  } as CSSProperties;
  const bandStyle = { color: ink } as CSSProperties;

  return (
    <div
      className={`catcard${empty ? ' empty' : ''}`}
      style={cardStyle}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      data-tip={`Open ${cat.label} transactions`}
    >
      {/* front panel: brown band (back) | receipt (middle) | green body (front) */}
      <div className="catcard-front">
        <div className="catcard-band" style={bandStyle}>
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

        {printKey > 0 && recent.length > 0 && (
          <span key={printKey} className="catcard-print" aria-hidden="true" />
        )}

        {recent.length > 0 && (
          <div className="catcard-receipt">
            {recent.map((r, i) => (
              <div className="rc-row" key={i}>
                <span className="rc-d">{shortDate(r.date)}</span>
                <span className="rc-m">{r.merchant || '—'}</span>
                <span className={`rc-a${r.direction === 'credit' ? ' in' : ''}`}>
                  {signedMoney(r.amountCents, r.direction)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="catcard-body">
          <div className="catcard-title">{cat.label}</div>
          <div className="catcard-sub">{cat.direction === 'credit' ? 'Money in' : 'Money out'}</div>

          <div className="catcard-foot">
            <span className={`catcard-big${printKey > 0 ? ' bumped' : ''}`}>
              {money(spentCents, true)}
              <small>{cat.direction === 'credit' ? 'in' : 'spent'}</small>
            </span>
            <span className="catcard-entries">
              {count} {count === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
