import { addMonths, monthKey, monthLabel } from '@/lib/format';

export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const atCurrent = month === monthKey();
  return (
    <div className="monthnav">
      <button
        className="railtoggle"
        onClick={() => onChange(addMonths(month, -1))}
        aria-label="Previous month"
        data-tip="Previous month"
      >
        ‹
      </button>
      <span className="mn-label">{monthLabel(month)}</span>
      <button
        className="railtoggle"
        onClick={() => onChange(addMonths(month, 1))}
        aria-label="Next month"
        disabled={atCurrent}
        data-tip={atCurrent ? undefined : 'Next month'}
      >
        ›
      </button>
    </div>
  );
}
