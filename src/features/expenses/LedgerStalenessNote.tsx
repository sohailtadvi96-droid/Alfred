import { casualDayMonth } from '@/lib/format';
import { useLedgerStaleness } from './hooks';

/** "Ledger current to 5 Sept · 9 days unimported" — shared between the
 *  dashboard header and Insights so neither can quietly imply a partial
 *  month is a complete one. Hidden at 0 days, amber past 3. */
export function LedgerStalenessNote({ className = 'sumcard-s' }: { className?: string }) {
  const { data: ledgerLastTxnDate } = useLedgerStaleness();
  const daysStale =
    ledgerLastTxnDate != null
      ? Math.floor((Date.now() - new Date(ledgerLastTxnDate).getTime()) / 86_400_000)
      : null;

  if (daysStale === null || daysStale <= 0 || !ledgerLastTxnDate) return null;

  return (
    <span className={`${className} sumcard-stale${daysStale > 3 ? ' amber' : ''}`}>
      Ledger current to {casualDayMonth(ledgerLastTxnDate)} · {daysStale} day{daysStale === 1 ? '' : 's'} unimported
    </span>
  );
}
