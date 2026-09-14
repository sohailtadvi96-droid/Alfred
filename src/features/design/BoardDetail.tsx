import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errMessage } from '@/lib/errors';
import { BoardFormDialog } from './BoardFormDialog';
import { ItemCard } from './ItemCard';
import { ItemFormDialog } from './ItemFormDialog';
import { MediumFilter } from './MediumFilter';
import { TagFilter } from './TagFilter';
import { useBoards, useDeleteBoard, useDeleteItem, useItems, useRetryIngest, useThumbUrls } from './hooks';
import { ALL_BOARD, type DesignItem } from './types';

// ~2x the masonry column width (248px, base.css) for legible retina tiles
// without requesting a full-size original.
const GRID_THUMB_PX = 480;

export function BoardDetail({ boardId }: { boardId: string }) {
  const navigate = useNavigate();
  const isAll = boardId === ALL_BOARD;

  const { data: boards } = useBoards();
  const { data: items, isLoading, error } = useItems(boardId);
  const { data: thumbUrls } = useThumbUrls(items, GRID_THUMB_PX);
  const deleteBoard = useDeleteBoard();
  const deleteItem = useDeleteItem();
  const retryIngest = useRetryIngest();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const board = boards?.find((b) => b.id === boardId);

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<DesignItem | undefined>();
  const [editBoardOpen, setEditBoardOpen] = useState(false);
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

  async function onDeleteBoard() {
    if (!board) return;
    if (!confirm(`Delete "${board.name}"? Its ${board.itemCount} reference(s) go with it.`)) return;
    try {
      await deleteBoard.mutateAsync(board.id);
      navigate('/design');
    } catch (err) {
      setBanner(errMessage(err, 'Could not delete the board.'));
    }
  }

  async function onDeleteItem(it: DesignItem) {
    if (!confirm('Remove this reference?')) return;
    try {
      await deleteItem.mutateAsync(it.id);
    } catch (err) {
      setBanner(errMessage(err, 'Could not remove the reference.'));
    }
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

  const title = isAll ? 'All references' : board?.name ?? 'Board';
  const canAdd = (boards?.length ?? 0) > 0;

  return (
    <div className="design-detail">
      <div className="design-detail-head">
        <div>
          <h2>{title}</h2>
          {!isAll && board?.description && <p className="design-detail-desc">{board.description}</p>}
          <span className="design-detail-count">
            {items?.length ?? 0} {(items?.length ?? 0) === 1 ? 'reference' : 'references'}
          </span>
        </div>
        <div className="design-detail-actions">
          {!isAll && board && (
            <>
              <button className="btn ghost sm" type="button" onClick={() => setEditBoardOpen(true)}>
                Edit
              </button>
              <button className="btn neg sm" type="button" onClick={onDeleteBoard}>
                Delete board
              </button>
            </>
          )}
          <button
            className="btn primary sm"
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={!canAdd}
            data-tip={canAdd ? undefined : 'Create a board first'}
          >
            Add reference
          </button>
        </div>
      </div>

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
        <div className="design-empty">
          Nothing here yet. {canAdd ? 'Add your first reference.' : 'Create a board to start.'}
        </div>
      ) : shown.length === 0 ? (
        <div className="design-empty">No references match those filters.</div>
      ) : (
        <div className="item-grid">
          {shown.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              thumbUrl={it.thumb_path ? thumbUrls?.[it.thumb_path] : undefined}
              onEdit={setEditItem}
              onDelete={onDeleteItem}
              onTagClick={(t) => setActiveTags((p) => (p.includes(t) ? p : [...p, t]))}
              onRetry={onRetryItem}
              retrying={retryingId === it.id}
            />
          ))}
        </div>
      )}

      <ItemFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        boards={boards ?? []}
        defaultBoardId={isAll ? undefined : boardId}
      />
      <ItemFormDialog
        open={!!editItem}
        onOpenChange={(v) => !v && setEditItem(undefined)}
        boards={boards ?? []}
        edit={editItem}
      />
      {board && (
        <BoardFormDialog open={editBoardOpen} onOpenChange={setEditBoardOpen} edit={board} />
      )}
    </div>
  );
}
