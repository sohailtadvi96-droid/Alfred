import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { BackfillDimensionsButton } from '@/features/design/BackfillDimensionsButton';
import { DesignPopover } from '@/features/design/DesignPopover';
import { DesignView } from '@/features/design/DesignView';
import { useBoards } from '@/features/design/hooks';

export function DesignPage() {
  const { data: boards } = useBoards();
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [addRefOpen, setAddRefOpen] = useState(false);
  const hasBoards = (boards?.length ?? 0) > 0;

  return (
    <>
      <TopBar
        title="Design"
        crumb="04 / MODULE"
        showWallet={false}
        action={
          <>
            <DesignPopover
              label="More actions"
              panelClassName="design-overflow-panel"
              renderTrigger={({ open, toggle }) => (
                <button
                  type="button"
                  className="design-overflow-btn"
                  aria-label="More actions"
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  onClick={toggle}
                >
                  ⋯
                </button>
              )}
            >
              <BackfillDimensionsButton />
            </DesignPopover>
            <button className="btn sec" onClick={() => setNewBoardOpen(true)}>
              New board
            </button>
            <button
              className="btn primary"
              onClick={() => setAddRefOpen(true)}
              disabled={!hasBoards}
              data-tip={hasBoards ? undefined : 'Create a board first'}
            >
              Add reference
            </button>
          </>
        }
      />
      <div className="wrap design-wrap design-wrap-wide">
        <DesignView
          newBoardOpen={newBoardOpen}
          onNewBoardOpenChange={setNewBoardOpen}
          addRefOpen={addRefOpen}
          onAddRefOpenChange={setAddRefOpen}
        />
      </div>
    </>
  );
}
