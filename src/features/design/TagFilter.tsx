import { useState } from 'react';

// Below this, a tag is noise, not a filter — at small collection sizes most
// tags land at count 1 and the cloud stops being scannable.
const MIN_COUNT = 3;

export function TagFilter({
  tags,
  active,
  onToggle,
  onClear,
}: {
  tags: { tag: string; count: number }[];
  active: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (tags.length === 0) return null;

  // A tag already filtering the grid stays visible even if it's below the
  // threshold — collapsing it away would hide what's currently active with
  // no way to toggle it back off short of Clear.
  const visible = tags.filter((t) => showAll || t.count >= MIN_COUNT || active.includes(t.tag));
  const hiddenCount = tags.length - visible.length;
  const belowThreshold = tags.some((t) => t.count < MIN_COUNT);

  return (
    <div className="tag-filter">
      {visible.map(({ tag, count }) => (
        <button
          key={tag}
          type="button"
          className={`tag as-button${active.includes(tag) ? ' on' : ''}`}
          onClick={() => onToggle(tag)}
        >
          {tag}
          <span className="tag-n">{count}</span>
        </button>
      ))}
      {belowThreshold && (
        <button type="button" className="tag-filter-toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `+${hiddenCount} more`}
        </button>
      )}
      {active.length > 0 && (
        <button type="button" className="tag-filter-clear" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  );
}
