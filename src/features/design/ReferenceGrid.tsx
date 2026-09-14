import { useMemo, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { ItemCard } from './ItemCard';
import { MediumFilter } from './MediumFilter';
import { TagFilter } from './TagFilter';
import { useRetryIngest, useThumbUrls } from './hooks';
import type { DesignItem } from './types';

// ~2x the masonry column width (248px, base.css) for legible retina tiles
// without requesting a full-size original.
const GRID_THUMB_PX = 480;

/** The filterable, browsable set of references — tag/medium filters,
 *  batched thumbnails, retry, the item grid itself. Shared by BoardDetail
 *  (a specific board, or the ALL_BOARD "All references" view) and
 *  DesignView (the landing page's flat "all items" section) — identical
 *  logic needed in both places now, not speculative reuse. Board-specific
 *  chrome (title, edit/delete board, the add-reference dialogs) stays with
 *  the caller; this only ever renders filters + grid. */
export function ReferenceGrid({
  items,
  isLoading,
  error,
  emptyMessage,
  onEdit,
  onDelete,
}: {
  items: DesignItem[] | undefined;
  isLoading: boolean;
  error: unknown;
  emptyMessage: string;
  onEdit: (item: DesignItem) => void;
  onDelete: (item: DesignItem) => void;
}) {
  const { data: thumbUrls } = useThumbUrls(items, GRID_THUMB_PX);
  const retryIngest = useRetryIngest();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeMedium, setActiveMedium] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items ?? []) for (const t of it.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [items]);

  const shown = useMemo(() => {
    return (items ?? []).filter(
      (it) =>
        (activeTags.length === 0 || activeTags.some((t) => it.tags.includes(t))) &&
        (!activeMedium || it.medium === activeMedium),
    );
  }, [items, activeTags, activeMedium]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function onRetryItem(it: DesignItem) {
    setRetryingId(it.id);
    try {
      await retryIngest.mutateAsync(it.id);
    } catch (err) {
      setBanner(errMessage(err, 'Retry failed — see the error on the card.'));
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <>
      {banner && <div className="err">{banner}</div>}

      <TagFilter
        tags={tagCounts}
        active={activeTags}
        onToggle={toggleTag}
        onClear={() => setActiveTags([])}
      />
      <MediumFilter items={items ?? []} active={activeMedium} onChange={setActiveMedium} />

      {error ? (
        <div className="design-empty">Couldn’t load references.</div>
      ) : isLoading ? (
        <div className="design-empty">Loading…</div>
      ) : (items?.length ?? 0) === 0 ? (
        <div className="design-empty">{emptyMessage}</div>
      ) : shown.length === 0 ? (
        <div className="design-empty">No references match those filters.</div>
      ) : (
        <div className="item-grid">
          {shown.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              thumbUrl={it.thumb_path ? thumbUrls?.[it.thumb_path] : undefined}
              onEdit={onEdit}
              onDelete={onDelete}
              onTagClick={(t) => setActiveTags((p) => (p.includes(t) ? p : [...p, t]))}
              onRetry={onRetryItem}
              retrying={retryingId === it.id}
            />
          ))}
        </div>
      )}
    </>
  );
}
