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

const moneyFmtCache = new Map<string, Intl.NumberFormat>();

/** cents -> currency string for an arbitrary ISO code (projects/invoices
 *  carry their own currency; Expenses stays INR-only via `money`). */
export function moneyIn(cents: number, currency: string, whole = false): string {
  const key = `${currency}:${whole}`;
  let fmt = moneyFmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: whole ? 0 : 2,
    });
    moneyFmtCache.set(key, fmt);
  }
  return fmt.format(cents / 100);
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

/** "just now" / "5 mins ago" / "2 days ago" — coarse, for freshness labels */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} month${mo === 1 ? '' : 's'} ago`;
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
