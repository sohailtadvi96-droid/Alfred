import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errMessage } from '@/lib/errors';
import { BoardFormDialog } from './BoardFormDialog';
import { ItemFormDialog } from './ItemFormDialog';
import { ReferenceGrid } from './ReferenceGrid';
import { SortInboxDialog } from './SortInboxDialog';
import { useBoards, useDeleteBoard, useDeleteItem, useItems } from './hooks';
import { ALL_BOARD, type DesignItem } from './types';

export function BoardDetail({ boardId }: { boardId: string }) {
  const navigate = useNavigate();
  const isAll = boardId === ALL_BOARD;

  const { data: boards } = useBoards();
  const { data: items, isLoading, error } = useItems(boardId);
  const deleteBoard = useDeleteBoard();
  const deleteItem = useDeleteItem();

  const board = boards?.find((b) => b.id === boardId);

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<DesignItem | undefined>();
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

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
          {board?.is_inbox && (
            <button className="btn sec sm" type="button" onClick={() => setSortOpen(true)}>
              Sort Inbox
            </button>
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

      <ReferenceGrid
        items={items}
        isLoading={isLoading}
        error={error}
        emptyMessage={`Nothing here yet. ${canAdd ? 'Add your first reference.' : 'Create a board to start.'}`}
        onEdit={setEditItem}
        onDelete={onDeleteItem}
      />

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
      {board?.is_inbox && (
        <SortInboxDialog
          open={sortOpen}
          onOpenChange={setSortOpen}
          inboxItems={items ?? []}
          boards={boards ?? []}
        />
      )}
      {board && (
        <BoardFormDialog open={editBoardOpen} onOpenChange={setEditBoardOpen} edit={board} />
      )}
    </div>
  );
}
