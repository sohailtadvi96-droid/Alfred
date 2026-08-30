import { Link } from 'react-router-dom';
import { fullDate, moneyIn } from '@/lib/format';
import { invoiceStatusMeta, isEffectivelyOverdue } from './status';
import type { InvoiceRow } from './types';

export function InvoiceList({
  invoices,
  isLoading,
  error,
  showProject = true,
  emptyHint,
  onEdit,
}: {
  invoices: InvoiceRow[] | undefined;
  isLoading: boolean;
  error: unknown;
  showProject?: boolean;
  emptyHint?: string;
  /** when set, each row gets an Edit action that opens the invoice form */
  onEdit?: (id: string) => void;
}) {
  if (error) return <div className="ledger-empty">Couldn’t load invoices. Try again.</div>;
  if (isLoading) return <div className="ledger-empty">Loading…</div>;
  if (!invoices || invoices.length === 0) {
    return (
      <div className="ledger-empty">
        <strong>No invoices yet.</strong>
        {emptyHint && <span>{emptyHint}</span>}
      </div>
    );
  }

  return (
    <div className="ledger">
      <table className="inv-table">
        <thead>
          <tr>
            <th>Number</th>
            {showProject && <th>Project</th>}
            <th>Client</th>
            <th>Issued</th>
            <th>Due</th>
            <th className="ta-r">Total</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const overdue = isEffectivelyOverdue(inv.status, inv.due_date);
            const meta = invoiceStatusMeta(overdue ? 'overdue' : inv.status);
            return (
              <tr key={inv.id}>
                <td className="mc">
                  <Link to={`/work/invoices/${inv.id}`}>{inv.invoice_number}</Link>
                </td>
                {showProject && <td className="dt">{inv.project?.name ?? '—'}</td>}
                <td className="dt">{inv.client?.name ?? '—'}</td>
                <td className="dt">{fullDate(inv.issue_date)}</td>
                <td className="dt">{inv.due_date ? fullDate(inv.due_date) : '—'}</td>
                <td className="ta-r mono">{moneyIn(inv.total_cents, inv.currency)}</td>
                <td>
                  <span className="work-status" style={{ ['--st' as string]: meta.color }}>
                    {meta.label}
                  </span>
                </td>
                <td className="inv-row-actions">
                  {onEdit && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => onEdit(inv.id)}
                      data-tip="Edit invoice"
                    >
                      Edit
                    </button>
                  )}
                  <Link
                    className="btn ghost"
                    to={`/work/invoices/${inv.id}?print=1`}
                    data-tip="Open and print / save as PDF"
                  >
                    PDF
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
