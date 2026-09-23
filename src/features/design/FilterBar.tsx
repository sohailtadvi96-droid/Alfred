import { DesignPopover } from './DesignPopover';
import { TagFilterPanel } from './TagFilterPanel';

/** Search field + Filters button/popover. The search is a client-side
 *  substring match (ReferenceGrid) until semantic search (docs/DESIGN.md
 *  Step 7) replaces the implementation — same field, same placeholder. */
export function FilterBar({
  query,
  onQueryChange,
  tags,
  activeTags,
  onToggleTag,
  filterCount,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  tags: { tag: string; count: number }[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  filterCount: number;
}) {
  return (
    <div className="ref-search-row">
      <label className="ref-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="sr-only">Search your references</span>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search your references"
        />
      </label>
      <DesignPopover
        label="Filters"
        renderTrigger={({ open, toggle }) => (
          <button type="button" className="ref-filter-btn" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filters
            {filterCount > 0 && <span className="ref-filter-badge">{filterCount}</span>}
          </button>
        )}
      >
        <TagFilterPanel tags={tags} active={activeTags} onToggle={onToggleTag} />
      </DesignPopover>
    </div>
  );
}
