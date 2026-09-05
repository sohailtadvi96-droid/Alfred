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
  if (tags.length === 0) return null;

  return (
    <div className="tag-filter">
      {tags.map(({ tag, count }) => (
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
      {active.length > 0 && (
        <button type="button" className="tag-filter-clear" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  );
}
