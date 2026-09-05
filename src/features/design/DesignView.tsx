import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BoardFormDialog } from './BoardFormDialog';
import { BoardGrid } from './BoardGrid';
import { ItemFormDialog } from './ItemFormDialog';
import { useBoards } from './hooks';
import { ALL_BOARD, type BoardWithCover } from './types';

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
  const [editBoard, setEditBoard] = useState<BoardWithCover | undefined>();

  const totalRefs = (boards ?? []).reduce((n, b) => n + b.itemCount, 0);

  return (
    <div className="design">
      <p className="design-intro">
        A private swipe file. Save a reference by its image URL, drop it on a board, tag it so you
        can find it again.
      </p>

      {error ? (
        <div className="design-empty">Couldn’t load your boards.</div>
      ) : isLoading ? (
        <div className="design-empty">Loading…</div>
      ) : (boards?.length ?? 0) === 0 ? (
        <div className="design-empty">
          No boards yet. Create one to start collecting references.
        </div>
      ) : (
        <>
          {totalRefs > 0 && (
            <Link to={`/design/${ALL_BOARD}`} className="design-all-link">
              View all {totalRefs} references across boards ›
            </Link>
          )}
          <BoardGrid boards={boards ?? []} onEdit={setEditBoard} />
        </>
      )}

      <BoardFormDialog open={newBoardOpen} onOpenChange={onNewBoardOpenChange} />
      <BoardFormDialog
        open={!!editBoard}
        onOpenChange={(v) => !v && setEditBoard(undefined)}
        edit={editBoard}
      />
      <ItemFormDialog open={addRefOpen} onOpenChange={onAddRefOpenChange} boards={boards ?? []} />
    </div>
  );
}
