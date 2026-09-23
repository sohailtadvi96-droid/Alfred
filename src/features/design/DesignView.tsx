import { useState } from 'react';
import { errMessage } from '@/lib/errors';
import { BoardFormDialog } from './BoardFormDialog';
import { BoardGrid } from './BoardGrid';
import { ItemFormDialog } from './ItemFormDialog';
import { ReferenceGrid } from './ReferenceGrid';
import { useBoards, useDeleteItem, useItems } from './hooks';
import { ALL_BOARD, type BoardWithCover, type DesignItem } from './types';

export function DesignView({
  newBoardOpen,
  onNewBoardOpenChange,
  addRefOpen,
  onAddRefOpenChange,
}: {
  newBoardOpen: boolean;
  onNewBoardOpenChange: (v: boolean) => void;
  addRefOpen: boolean;
  onAddRefOpenChange: (v: boolean) => void;
}) {
  const { data: boards, isLoading, error } = useBoards();
  // Landing on Design shows every reference, newest first, mixed across
  // boards — the board grid below is for organizing/navigating into one,
  // not the default view. useItems(ALL_BOARD) already sorts created_at desc.
  const { data: items, isLoading: itemsLoading, error: itemsError } = useItems(ALL_BOARD);
  const deleteItem = useDeleteItem();
  const [editBoard, setEditBoard] = useState<BoardWithCover | undefined>();
  const [editItem, setEditItem] = useState<DesignItem | undefined>();
  const [banner, setBanner] = useState<string | null>(null);

  const hasBoards = (boards?.length ?? 0) > 0;

  async function onDeleteItem(it: DesignItem) {
    if (!confirm('Remove this reference?')) return;
    try {
      await deleteItem.mutateAsync(it.id);
    } catch (err) {
      setBanner(errMessage(err, 'Could not remove the reference.'));
    }
  }

  return (
    <div className="design">
      {banner && <div className="err">{banner}</div>}

      {error ? (
        <div className="design-empty">Couldn’t load your boards.</div>
      ) : isLoading ? (
        <div className="design-empty">Loading…</div>
      ) : !hasBoards ? (
        <div className="design-empty">
          No boards yet. Create one to start collecting references.
        </div>
      ) : (
        <>
          <ReferenceGrid
            items={items}
            isLoading={itemsLoading}
            error={itemsError}
            emptyMessage="Nothing saved yet. Add your first reference."
            onEdit={setEditItem}
            onDelete={onDeleteItem}
          />

          <section className="design-boards-section">
            <h3 className="design-boards-heading">Boards</h3>
            <BoardGrid boards={boards ?? []} onEdit={setEditBoard} onNew={() => onNewBoardOpenChange(true)} />
          </section>
        </>
      )}

      <BoardFormDialog open={newBoardOpen} onOpenChange={onNewBoardOpenChange} />
      <BoardFormDialog
        open={!!editBoard}
        onOpenChange={(v) => !v && setEditBoard(undefined)}
        edit={editBoard}
      />
      <ItemFormDialog open={addRefOpen} onOpenChange={onAddRefOpenChange} boards={boards ?? []} />
      <ItemFormDialog
        open={!!editItem}
        onOpenChange={(v) => !v && setEditItem(undefined)}
        boards={boards ?? []}
        edit={editItem}
      />
    </div>
  );
}
