import * as DM from '@radix-ui/react-dropdown-menu';
import type { BoardWithCover } from './types';

/** "Also show in…" checklist for one item. Checking a board adds a
 *  design_item_boards row; unchecking removes it — the item's home board
 *  (design_items.board_id) is never touched, and is shown checked + disabled.
 *
 *  Anchored to a zero-size point inside the card (right-click position, or
 *  the hover button), not to a trigger the user clicks — the card decides
 *  when and where to open it. The menu stays open across toggles so several
 *  boards can be ticked in one go. */
export function BoardPicker({
  open,
  onOpenChange,
  point,
  homeBoardId,
  boards,
  linkedBoardIds,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** anchor, in px relative to the card frame */
  point: { x: number; y: number };
  homeBoardId: string;
  boards: BoardWithCover[];
  linkedBoardIds: string[];
  onToggle: (boardId: string, on: boolean) => void;
}) {
  const linked = new Set(linkedBoardIds);
  return (
    <DM.Root open={open} onOpenChange={onOpenChange}>
      <DM.Trigger asChild>
        <span className="board-picker-anchor" style={{ left: point.x, top: point.y }} aria-hidden="true" />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          className="menu"
          align="start"
          sideOffset={4}
          collisionPadding={12}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DM.Label className="menu-label">Also show in</DM.Label>
          {boards.length === 0 && <div className="menu-empty">No boards yet.</div>}
          {boards.map((b) => {
            const isHome = b.id === homeBoardId;
            return (
              <DM.CheckboxItem
                key={b.id}
                className="menu-item"
                checked={isHome || linked.has(b.id)}
                disabled={isHome}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) => onToggle(b.id, on === true)}
              >
                <span className="menu-item-name">
                  {b.name}
                  {isHome && <span className="menu-note">home</span>}
                </span>
                <DM.ItemIndicator className="menu-check">✓</DM.ItemIndicator>
              </DM.CheckboxItem>
            );
          })}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
