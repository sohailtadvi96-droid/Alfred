/** Calendar-grid math for the Office journal. Weeks are Monday-first;
 *  every value crossing an API boundary is a local "YYYY-MM-DD" string. */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad2 = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function todayKey(): string {
  return dateKey(new Date());
}
export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
export function monthOfDay(dayKey: string): string {
  return dayKey.slice(0, 7);
}
export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
export function dayTitle(key: string): string {
  return parseKey(key).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** [dayStartISO, dayEndISO) spans one local calendar day, as UTC ISO strings. */
export function dayStartISO(key: string): string {
  return parseKey(key).toISOString();
}
export function dayEndISO(key: string): string {
  return parseKey(addDays(key, 1)).toISOString();
}

export interface GridCell {
  key: string;
  inMonth: boolean;
}
/** 6×7 cells covering `monthKey`, with leading/trailing days from the
 *  neighbouring months. */
export function monthGrid(key: string): { cells: GridCell[]; start: string; end: string } {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m - 1, 1 - offset + i);
    cells.push({ key: dateKey(d), inMonth: d.getMonth() === m - 1 });
  }
  return { cells, start: cells[0].key, end: cells[41].key };
}
