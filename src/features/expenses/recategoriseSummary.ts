/** Trailing sentence for a status line when a re-categorise meant to write rows
 *  the database did not accept (see RecategoriseOutcome). Empty when nothing
 *  went missing, so the common case reads exactly as before. */
export function notSaved(unwritten: number): string {
  return unwritten > 0 ? ` ${unwritten} row${unwritten === 1 ? '' : 's'} could not be written.` : '';
}
