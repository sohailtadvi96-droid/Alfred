// Fixed row, always all six — not filtered by what's in the library. A
// packaging or type item is still shown (no medium chip selected shows
// everything) but has no chip of its own.
export const MEDIUMS: { slug: string; label: string }[] = [
  { slug: 'identity', label: 'Identity' },
  { slug: 'editorial', label: 'Editorial' },
  { slug: 'motion', label: 'Motion' },
  { slug: 'web', label: 'Web' },
  { slug: 'illustration', label: 'Illustration' },
  { slug: 'other', label: 'Other' },
];

/** Multi-select: any selected medium matches (OR). */
export function MediumFilter({
  active,
  onToggle,
}: {
  active: string[];
  onToggle: (medium: string) => void;
}) {
  return (
    <div className="ref-mediums">
      {MEDIUMS.map((m) => (
        <button
          key={m.slug}
          type="button"
          className="ref-medium"
          aria-pressed={active.includes(m.slug)}
          onClick={() => onToggle(m.slug)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
