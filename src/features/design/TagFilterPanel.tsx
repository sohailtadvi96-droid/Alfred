import { categoryOf } from './tagVocabulary';

type Group = 'style' | 'colour' | 'mood' | 'other';

const GROUPS: { key: Group; label: string }[] = [
  { key: 'style', label: 'Style' },
  { key: 'colour', label: 'Colour' },
  { key: 'mood', label: 'Mood' },
  { key: 'other', label: 'Other' },
];

// The vocabulary has five categories plus off-list tags; the popover shows
// four groups, so technique / subject / off-list all land under Other.
function groupOf(tag: string): Group {
  const c = categoryOf(tag);
  return c === 'style' || c === 'colour' || c === 'mood' ? c : 'other';
}

/** Every tag in the library, grouped, with counts — no minimum count, no
 *  "+N more". Scrolling is the panel's job (.ref-filter-panel). */
export function TagFilterPanel({
  tags,
  active,
  onToggle,
}: {
  tags: { tag: string; count: number }[];
  active: string[];
  onToggle: (tag: string) => void;
}) {
  if (tags.length === 0) {
    return <div className="ref-filter-panel ref-filter-empty">No tags yet.</div>;
  }

  const grouped = new Map<Group, typeof tags>();
  for (const t of tags) {
    const g = groupOf(t.tag);
    const arr = grouped.get(g);
    if (arr) arr.push(t);
    else grouped.set(g, [t]);
  }

  return (
    <div className="ref-filter-panel">
      {GROUPS.filter((g) => grouped.has(g.key)).map((g) => (
        <section key={g.key}>
          <div className="ref-filter-group-head">
            <span>{g.label}</span>
            <span>{grouped.get(g.key)!.length}</span>
          </div>
          <div className="ref-filter-tags">
            {grouped.get(g.key)!.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                className="ref-filter-tag"
                aria-pressed={active.includes(tag)}
                onClick={() => onToggle(tag)}
              >
                {tag}
                <span className="ref-filter-tag-n">{count}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
