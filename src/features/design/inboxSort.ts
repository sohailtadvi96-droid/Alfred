import type { BoardWithCover, DesignItem, ItemBoardLink } from './types';

/** The board a medium routes to: the oldest board whose trimmed name equals
 *  the medium slug, case-insensitively (the slugs are the labels lower-cased —
 *  Identity, Packaging, …). Same rule as design-capture's capture-time
 *  routing (supabase/functions/design-capture/index.ts); that one is Deno and
 *  can't be imported here, so the two are kept identical by hand. The inbox
 *  itself is never a target — moving an inbox item to the inbox is a no-op. */
export function boardForMedium(boards: BoardWithCover[], medium: string): BoardWithCover | undefined {
  return [...boards]
    .filter((b) => !b.is_inbox)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .find((b) => b.name.trim().toLowerCase() === medium);
}

export interface InboxSortGroup {
  /** null = a medium with no board of that name */
  board: BoardWithCover | null;
  items: DesignItem[];
}

/** Dry run only — reads, never writes. Every item with a non-null medium is
 *  placed under the board it would ALSO be listed in, or under the "no
 *  matching board" group (board: null), which is excluded from any change.
 *  Items with no medium are not evidence of anything and don't appear at all.
 *  A pair already present in design_item_boards is dropped, so once an item is
 *  cross-listed a re-run shows nothing new for it. Inbox membership is never
 *  touched either way. */
export function planInboxSort(
  items: DesignItem[],
  boards: BoardWithCover[],
  links: ItemBoardLink[],
): InboxSortGroup[] {
  const existing = new Set(links.map((l) => `${l.item_id}:${l.board_id}`));
  const byBoard = new Map<string, InboxSortGroup>();
  const unmatched: DesignItem[] = [];
  for (const it of items) {
    if (!it.medium) continue;
    const target = boardForMedium(boards, it.medium);
    if (!target) {
      unmatched.push(it);
      continue;
    }
    if (existing.has(`${it.id}:${target.id}`)) continue; // already cross-listed there
    const g = byBoard.get(target.id);
    if (g) g.items.push(it);
    else byBoard.set(target.id, { board: target, items: [it] });
  }
  const groups = [...byBoard.values()].sort((a, b) => a.board!.name.localeCompare(b.board!.name));
  if (unmatched.length > 0) groups.push({ board: null, items: unmatched });
  return groups;
}
