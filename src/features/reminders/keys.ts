import { useEffect, useRef } from 'react';
import { useCompleteReminder, useUncompleteReminder } from './hooks';

/** True when a single-letter shortcut must stand down: a modifier is held,
 *  the user is typing in a field, or a Radix layer (the reminder sheet, a row
 *  menu, any other dialog) is open. Radix traps focus and handles Esc inside
 *  its own layers, so the page's shortcuts simply don't run while one is up
 *  rather than competing with it. */
export function shortcutBlocked(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return true;
  const target = e.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
  }
  return document.querySelector('[role="dialog"], [role="menu"]') !== null;
}

/** "n" opens the New reminder sheet from anywhere on the page. */
export function useNewReminderKey(onNew: () => void) {
  const latest = useRef(onNew);
  latest.current = onNew;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'n' || shortcutBlocked(e)) return;
      // the sheet's title input autofocuses -- don't let this keystroke land in it
      e.preventDefault();
      latest.current();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const ROW = '[data-rem-row]';
/** how long after a tick settles focus keeps following its row */
const FOCUS_FOLLOW_MS = 1500;

/** Today tab keys. "x" toggles a row's tick: the row holding focus, or the
 *  first tickable one when nothing on the list is focused. ↑/↓ move between
 *  rows once one is focused.
 *
 *  A ticked row leaves its section and reappears under Done today (and back
 *  again on undo), and each move is a remount that drops keyboard focus on
 *  the floor -- so focus follows the reminder to wherever it lands. That
 *  keeps "x" a true toggle: pressing it twice puts the row back, instead of
 *  ticking the next one down. A row can move more than once per tick (the
 *  optimistic placement, then the refetch correcting it -- an un-ticked
 *  overdue row only learns it's overdue again from the server), so the
 *  follow stays live until shortly after the mutation settles rather than
 *  ending at the first landing.
 *
 *  Rows are read from the DOM (data-rem-* on each row) rather than from the
 *  query cache, so "first row" is always the first one actually on screen. */
export function useTickKeys() {
  const complete = useCompleteReminder();
  const uncomplete = useUncompleteReminder();
  const follow = useRef<{ id: string; until: number } | null>(null);
  const mutations = useRef({ complete, uncomplete });
  mutations.current = { complete, uncomplete };

  // After every render while a tick is being followed: if its row remounted
  // and focus fell back to <body>, put focus on the row again. If the user
  // has focused something else in the meantime, they've moved on -- stop.
  useEffect(() => {
    const pending = follow.current;
    if (!pending) return;
    if (Date.now() > pending.until) {
      follow.current = null;
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-rem-row="${CSS.escape(pending.id)}"]`);
    const active = document.activeElement;
    if (active && active !== document.body && active !== el) {
      follow.current = null;
      return;
    }
    if (el && active !== el) el.focus();
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (shortcutBlocked(e)) return;
      const active = document.activeElement as HTMLElement | null;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // only from a row itself -- never hijack arrows from a button inside one
        if (!active?.matches(ROW)) return;
        const rows = Array.from(document.querySelectorAll<HTMLElement>(ROW));
        const next = rows[rows.indexOf(active) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) {
          e.preventDefault();
          follow.current = null;
          next.focus();
        }
        return;
      }

      if (e.key.toLowerCase() !== 'x') return;
      const row =
        active?.closest<HTMLElement>(ROW) ??
        document.querySelector<HTMLElement>(`${ROW}[data-rem-done="false"][data-rem-tickable="true"]`);
      if (!row || row.dataset.remTickable !== 'true') return;

      const id = row.dataset.remRow as string;
      const occurrenceDate = row.dataset.remDate;
      const wasDone = row.dataset.remDone === 'true';
      e.preventDefault();
      // focus the row itself (not a button inside it, not <body>) so the
      // follow above has one element to track through the remounts
      row.focus();
      const following = { id, until: Number.POSITIVE_INFINITY };
      follow.current = following;
      const mutation = wasDone ? mutations.current.uncomplete : mutations.current.complete;
      mutation.mutate(
        { id, occurrenceDate },
        {
          // success or rollback, the row's final place arrives with the
          // refetch that follows -- keep following for a moment past it
          onSettled: () => {
            following.until = Date.now() + FOCUS_FOLLOW_MS;
          },
        },
      );
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
