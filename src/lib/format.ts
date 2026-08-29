const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});
const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** cents (paise) -> "₹1,234.00" */
export function money(cents: number, whole = false): string {
  return (whole ? inrWhole : inr).format(cents / 100);
}

/** cents -> "−₹1,234.00" / "+₹1,234.00" for a debit/credit */
export function signedMoney(cents: number, direction: 'debit' | 'credit', whole = false): string {
  const sign = direction === 'credit' ? '+' : '−';
  return `${sign}${money(cents, whole)}`;
}

/** "12,000.00" text -> paise integer. Returns null if unparseable. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!cleaned || !/^\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

const dayFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
const fullFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function shortDate(iso: string): string {
  return dayFmt.format(new Date(iso)).toUpperCase();
}
export function fullDate(iso: string): string {
  return fullFmt.format(new Date(iso));
}

/** YYYY-MM for a Date (local) */
export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function monthRange(key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
