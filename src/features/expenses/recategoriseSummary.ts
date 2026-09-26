/** Wording for the result of a re-categorise (see RecategoriseOutcome), so every
 *  screen says the same thing. `moved` rows changed category; `refreshed` rows
 *  kept their category but had confidence / match details brought up to date. */

/** "12 changed category, 40 refreshed" — parts with a zero count are left out. */
export function outcomeText(o: { moved: number; refreshed: number }): string {
  const parts: string[] = [];
  if (o.moved) parts.push(`${o.moved} changed category`);
  if (o.refreshed) parts.push(`${o.refreshed} refreshed`);
  return parts.length ? parts.join(', ') : 'nothing needed re-categorising';
}

/** Trailing sentence for a status line when a re-categorise meant to write rows
 *  the database did not accept. Empty when nothing went missing, so the common
 *  case reads exactly as before. */
export function notSaved(unwritten: number): string {
  return unwritten > 0 ? ` ${unwritten} row${unwritten === 1 ? '' : 's'} could not be written.` : '';
}
