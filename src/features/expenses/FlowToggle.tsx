import type { Direction } from './categories';

const OPTIONS: { value: Direction | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'debit', label: 'Money out' },
  { value: 'credit', label: 'Money in' },
];

export function FlowToggle({
  value,
  onChange,
}: {
  value: Direction | undefined;
  onChange: (v: Direction | undefined) => void;
}) {
  return (
    <div className="flowtoggle" role="tablist" aria-label="Flow">
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
