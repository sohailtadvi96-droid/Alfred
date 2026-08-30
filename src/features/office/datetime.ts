const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
const dateShort = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** whole-days between two dates (b − a), by local midnight */
function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function timeLabel(iso: string): string {
  return time.format(new Date(iso));
}

/** "Today" / "Tomorrow" / "Yesterday" / "Fri 29 Aug" for a datetime or date */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const delta = dayDiff(new Date(), d);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return weekday.format(d);
}

export function isToday(iso: string): boolean {
  return dayDiff(new Date(), new Date(iso)) === 0;
}

/** Task due-date label (date-only strings). null → '' */
export function dueLabel(dateStr: string | null): { text: string; tone: 'overdue' | 'today' | 'soon' | 'later' } {
  if (!dateStr) return { text: '', tone: 'later' };
  const d = new Date(`${dateStr}T00:00:00`);
  const delta = dayDiff(new Date(), d);
  if (delta < 0) return { text: `Overdue · ${dateShort.format(d)}`, tone: 'overdue' };
  if (delta === 0) return { text: 'Due today', tone: 'today' };
  if (delta === 1) return { text: 'Due tomorrow', tone: 'soon' };
  if (delta <= 6) return { text: `Due ${weekday.format(d)}`, tone: 'soon' };
  return { text: `Due ${dateShort.format(d)}`, tone: 'later' };
}

/** ISO → value for <input type="datetime-local"> (local wall clock, no tz) */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO string */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function todayDateValue(): string {
  return localDateKey(new Date().toISOString());
}

/** local YYYY-MM-DD for an ISO datetime (for day-bucketing the agenda) */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
