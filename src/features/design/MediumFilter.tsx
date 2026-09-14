import { useMemo } from 'react';

const MEDIUMS: { slug: string; label: string }[] = [
  { slug: 'identity', label: 'Identity' },
  { slug: 'packaging', label: 'Packaging' },
  { slug: 'editorial', label: 'Editorial' },
  { slug: 'motion', label: 'Motion' },
  { slug: 'type', label: 'Type' },
  { slug: 'web', label: 'Web' },
  { slug: 'illustration', label: 'Illustration' },
  { slug: 'other', label: 'Other' },
];

/** Single-select — an item has at most one medium, unlike tags. */
export function MediumFilter({
  items,
  active,
  onChange,
}: {
  items: { medium: string | null }[];
  active: string | null;
  onChange: (medium: string | null) => void;
}) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) if (it.medium) m.set(it.medium, (m.get(it.medium) ?? 0) + 1);
    return m;
  }, [items]);

  const present = MEDIUMS.filter((m) => (counts.get(m.slug) ?? 0) > 0);
  if (present.length === 0) return null;

  return (
    <div className="tag-filter medium-filter">
      {present.map((m) => (
        <button
          key={m.slug}
          type="button"
          className={`tag as-button${active === m.slug ? ' on' : ''}`}
          onClick={() => onChange(active === m.slug ? null : m.slug)}
        >
          {m.label}
          <span className="tag-n">{counts.get(m.slug)}</span>
        </button>
      ))}
      {active && (
        <button type="button" className="tag-filter-clear" onClick={() => onChange(null)}>
          Clear
        </button>
      )}
    </div>
  );
}
