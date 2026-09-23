/** Dismissible chips for every active tag/medium filter, plus Clear all.
 *  Renders nothing — and reserves no space — when no filter is active. */
export function ActiveFilters({
  tags,
  mediums,
  onRemoveTag,
  onRemoveMedium,
  onClear,
}: {
  tags: string[];
  mediums: string[];
  onRemoveTag: (tag: string) => void;
  onRemoveMedium: (medium: string) => void;
  onClear: () => void;
}) {
  if (tags.length + mediums.length === 0) return null;

  return (
    <div className="ref-active">
      {tags.map((t) => (
        <span className="ref-chip" key={`tag:${t}`}>
          {t}
          <button type="button" aria-label={`Remove ${t} filter`} onClick={() => onRemoveTag(t)}>
            ×
          </button>
        </span>
      ))}
      {mediums.map((m) => (
        <span className="ref-chip" key={`medium:${m}`}>
          {m}
          <button type="button" aria-label={`Remove ${m} filter`} onClick={() => onRemoveMedium(m)}>
            ×
          </button>
        </span>
      ))}
      <button type="button" className="ref-clear" onClick={onClear}>
        Clear all
      </button>
    </div>
  );
}
