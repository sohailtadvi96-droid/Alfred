import { useState } from 'react';
import { CATEGORY_LABELS, CATEGORY_ORDER, categoryOf, type TagCategory } from './tagVocabulary';

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

  // Virtual grouping by the fixed tag vocabulary — nothing here is stored,
  // it's just how this list of already-existing tags gets organized for
  // browsing. A tag outside the vocabulary (legacy, or typed by hand into
  // the manual add-reference form) lands under "Other" rather than vanishing.
  const grouped = new Map<TagCategory | 'other', typeof visible>();
  for (const t of visible) {
    const cat = categoryOf(t.tag);
    const arr = grouped.get(cat);
    if (arr) arr.push(t);
    else grouped.set(cat, [t]);
  }

  return (
    <div className="tag-filter">
      {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
        <div className="tag-filter-group" key={cat}>
          <span className="tag-filter-group-label">{cat === 'other' ? 'Other' : CATEGORY_LABELS[cat]}</span>
          <div className="tag-filter-group-tags">
            {grouped.get(cat)!.map(({ tag, count }) => (
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
          </div>
        </div>
      ))}
      <div className="tag-filter-meta">
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
    </div>
  );
}
