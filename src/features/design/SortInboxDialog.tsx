import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogClose } from '@/components/Dialog';
import { useThumbUrls } from './hooks';
import { planInboxSort } from './inboxSort';
import type { BoardWithCover, DesignItem } from './types';

const THUMB_PX = 160;

/** Preview-first sweep of the Inbox: which items would move where, grouped by
 *  target board. This is a dry run — it renders what a move WOULD do and
 *  writes nothing. The confirm button is deliberately not wired yet. */
export function SortInboxDialog({
  open,
  onOpenChange,
  inboxItems,
  boards,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inboxItems: DesignItem[];
  boards: BoardWithCover[];
}) {
  const groups = useMemo(() => planInboxSort(inboxItems, boards), [inboxItems, boards]);
  const matched = groups.filter((g) => g.board);
  const allItems = groups.flatMap((g) => g.items);
  const { data: thumbUrls } = useThumbUrls(allItems, THUMB_PX);

  // Everything that has a target starts selected; the "no matching board"
  // group is never selectable, whatever happens next.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setSelected(new Set(matched.flatMap((g) => g.items.map((it) => it.id))));
    // re-seed only when the dialog opens, not on every background refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(items: DesignItem[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = items.every((it) => next.has(it.id));
      for (const it of items) {
        if (allOn) next.delete(it.id);
        else next.add(it.id);
      }
      return next;
    });
  }

  const count = matched.reduce((n, g) => n + g.items.filter((it) => selected.has(it.id)).length, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="Sort Inbox"
      description="Preview only — this shows where items would go, based on their medium and a board of the same name. Nothing moves until you confirm."
      footer={
        <>
          <span className="sort-note">Preview only — moving isn’t wired up yet.</span>
          <DialogClose asChild>
            <button type="button" className="btn ghost">
              Close
            </button>
          </DialogClose>
          <button type="button" className="btn primary" disabled>
            Move {count} {count === 1 ? 'item' : 'items'}
          </button>
        </>
      }
    >
      {groups.length === 0 ? (
        <div className="design-empty">
          Nothing to sort — no Inbox item has a medium set. Items without a medium are left alone.
        </div>
      ) : (
        <div className="sort-groups">
          {groups.map((g) => {
            const key = g.board?.id ?? 'none';
            const on = g.board ? g.items.filter((it) => selected.has(it.id)).length : 0;
            return (
              <section key={key} className={`sort-group${g.board ? '' : ' sort-group-none'}`}>
                <header className="sort-group-head">
                  {g.board ? (
                    <label className="sort-group-toggle">
                      <input
                        type="checkbox"
                        checked={on === g.items.length}
                        ref={(el) => {
                          if (el) el.indeterminate = on > 0 && on < g.items.length;
                        }}
                        onChange={() => toggleGroup(g.items)}
                      />
                      <span className="sort-group-name">{g.board.name}</span>
                      <span className="sort-group-count">({g.items.length})</span>
                    </label>
                  ) : (
                    <div className="sort-group-toggle">
                      <span className="sort-group-name">No matching board</span>
                      <span className="sort-group-count">({g.items.length})</span>
                    </div>
                  )}
                  {!g.board && <span className="sort-group-hint">Won’t move — no board with that name</span>}
                </header>
                <div className="sort-items">
                  {g.items.map((it) => (
                    <SortItem
                      key={it.id}
                      item={it}
                      src={(it.thumb_path && thumbUrls?.[it.thumb_path]) || it.image_url || it.poster_url}
                      selectable={!!g.board}
                      checked={selected.has(it.id)}
                      onToggle={() => toggleItem(it.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

function SortItem({
  item,
  src,
  selectable,
  checked,
  onToggle,
}: {
  item: DesignItem;
  src: string | null | undefined;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const label = item.title ?? item.caption ?? 'Untitled reference';
  return (
    <label
      className={`sort-item${selectable ? '' : ' sort-item-static'}${selectable && !checked ? ' sort-item-off' : ''}`}
      title={`${label} — ${item.medium}`}
    >
      {selectable && <input type="checkbox" checked={checked} onChange={onToggle} aria-label={label} />}
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="sort-item-blank" />}
      <span className="sort-item-medium">{item.medium}</span>
    </label>
  );
}
