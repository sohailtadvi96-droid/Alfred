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

  // a fresh "sheet" drops into the folder whenever an entry lands here
  const prev = useRef(count);
  const [printKey, setPrintKey] = useState(0);
  useEffect(() => {
    if (count > prev.current) {
      setPrintKey((k) => k + 1);
      const t = setTimeout(() => setPrintKey(0), 900);
      prev.current = count;
      return () => clearTimeout(t);
    }
    prev.current = count;
  }, [count]);

  const cardStyle = { ...style, ['--c']: cat.color, ['--fink']: ink } as CSSProperties;

  const paper = (i: number) => {
    const r = recent[i];
    return (
      <div className={`paper paper-${i}${printKey > 0 && i === 0 ? ' printing' : ''}`} key={i}>
        {r ? (
          <>
            <span className="paper-d">{shortDate(r.date)}</span>
            <span className="paper-m">{r.merchant || '—'}</span>
            <span className={`paper-a${r.direction === 'credit' ? ' in' : ''}`}>
              {signedMoney(r.amountCents, r.direction)}
            </span>
          </>
        ) : (
          <span className="paper-empty">No entry</span>
        )}
      </div>
    );
  };

  return (
    <div
      className={`folder${empty ? ' empty' : ''}`}
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
      <div className="folder-papers">
        {paper(1)}
        {paper(0)}
      </div>

      <div className="folder-front">
        <span className="folder-share">{empty ? '—' : `${sharePct}% of month`}</span>
        <div className="folder-tools" onClick={(e) => e.stopPropagation()}>
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
        <div className="folder-title">{cat.label}</div>
        <div className="folder-row">
          <span className={`folder-amt${printKey > 0 ? ' bumped' : ''}`}>
            {money(spentCents, true)}
            <small>{cat.direction === 'credit' ? 'in' : 'spent'}</small>
          </span>
          <span className="folder-count">
            {count} {count === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>
    </div>
  );
}
