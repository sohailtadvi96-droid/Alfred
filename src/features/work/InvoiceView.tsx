import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { errMessage } from '@/lib/errors';
import { fullDate, moneyIn } from '@/lib/format';
import { InvoiceFormDialog } from './InvoiceFormDialog';
import { INVOICE_STATUSES, invoiceStatusMeta, isEffectivelyOverdue } from './status';
import { useDeleteInvoice, useInvoice, useSetInvoiceStatus } from './hooks';
import type { InvoiceStatus } from './types';

const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2));

/** Print with the invoice number as the document title so a "Save as PDF"
 *  lands as e.g. "ALF-2026-0007.pdf", then restore the app title. */
function printAs(name: string) {
  const prev = document.title;
  document.title = name;
  const restore = () => {
    document.title = prev;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
  // Safari/Firefox may not fire afterprint reliably.
  setTimeout(restore, 1000);
}

export function InvoiceView({ invoiceId }: { invoiceId: string }) {
  const { data: inv, isLoading, error } = useInvoice(invoiceId);
  const { user } = useAuth();
  const setStatus = useSetInvoiceStatus();
  const del = useDeleteInvoice();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const doPrint = useCallback(() => {
    if (inv) printAs(inv.invoice_number);
  }, [inv]);

  // arriving with ?print=1 (from a list "PDF" action) → auto-open the dialog once
  const autoPrinted = useRef(false);
  useEffect(() => {
    if (!inv || autoPrinted.current || searchParams.get('print') !== '1') return;
    autoPrinted.current = true;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('print');
        return p;
      },
      { replace: true },
    );
    const t = setTimeout(doPrint, 250);
    return () => clearTimeout(t);
  }, [inv, searchParams, setSearchParams, doPrint]);

  if (error) return <div className="ledger-empty">Couldn’t load this invoice.</div>;
  if (isLoading || !inv) return <div className="ledger-empty">Loading…</div>;

  const overdue = isEffectivelyOverdue(inv.status, inv.due_date);
  const meta = invoiceStatusMeta(overdue ? 'overdue' : inv.status);

  function onDelete() {
    if (!inv) return;
    if (!confirm(`Delete ${inv.invoice_number}? This cannot be undone.`)) return;
    del.mutate(inv.id, {
      onSuccess: () => navigate('/work/invoices'),
      onError: (err) => setBanner(errMessage(err, 'Could not delete the invoice.')),
    });
  }

  return (
    <div className="inv-page">
      {banner && <div className="secrets-banner">{banner}</div>}

      <div className="inv-toolbar">
        <div className="inv-toolbar-l">
          <label className="inv-status-pick">
            <span>Status</span>
            <select
              className="input sm-select"
              value={inv.status}
              onChange={(e) =>
                setStatus.mutate(
                  { id: inv.id, status: e.target.value as InvoiceStatus },
                  { onError: (err) => setBanner(errMessage(err, 'Could not update status.')) },
                )
              }
            >
              {INVOICE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {overdue && inv.status !== 'overdue' && (
            <span className="inv-overdue-note">past due {fullDate(inv.due_date as string)}</span>
          )}
        </div>
        <div className="inv-toolbar-r">
          <button className="btn sec sm" onClick={() => setEditOpen(true)}>
            Edit
          </button>
          <button className="btn sec sm" onClick={doPrint}>
            Print / PDF
          </button>
          <button className="btn neg sm" onClick={onDelete} disabled={del.isPending}>
            Delete
          </button>
        </div>
      </div>

      <article className="inv-doc">
        <header className="inv-doc-head">
          <div>
            <div className="inv-doc-kicker">Invoice</div>
            <div className="inv-doc-number">{inv.invoice_number}</div>
          </div>
          <span
            className="work-status inv-doc-status"
            style={{ ['--st' as string]: meta.color }}
          >
            {meta.label}
          </span>
        </header>

        <div className="inv-doc-parties">
          <div>
            <div className="inv-doc-label">From</div>
            <div className="inv-doc-strong">ALFRED</div>
            {user?.email && <div>{user.email}</div>}
          </div>
          <div>
            <div className="inv-doc-label">Bill to</div>
            <div className="inv-doc-strong">{inv.client?.name ?? '—'}</div>
            {inv.client?.email && <div>{inv.client.email}</div>}
            {inv.client?.billing_address && (
              <div className="inv-doc-addr">{inv.client.billing_address}</div>
            )}
          </div>
          <div>
            <div className="inv-doc-label">Issued</div>
            <div>{fullDate(inv.issue_date)}</div>
            <div className="inv-doc-label" style={{ marginTop: 8 }}>
              Due
            </div>
            <div>{inv.due_date ? fullDate(inv.due_date) : '—'}</div>
            {inv.project?.name && (
              <>
                <div className="inv-doc-label" style={{ marginTop: 8 }}>
                  Project
                </div>
                <div>{inv.project.name}</div>
              </>
            )}
          </div>
        </div>

        <table className="inv-doc-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="ta-r">Qty</th>
              <th className="ta-r">Unit price</th>
              <th className="ta-r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.line_items.map((li) => (
              <tr key={li.id}>
                <td>{li.description}</td>
                <td className="ta-r mono">{fmtQty(li.quantity)}</td>
                <td className="ta-r mono">{moneyIn(li.unit_price_cents, inv.currency)}</td>
                <td className="ta-r mono">{moneyIn(li.amount_cents, inv.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-doc-totals">
          <div>
            <span>Subtotal</span>
            <span className="mono">{moneyIn(inv.subtotal_cents, inv.currency)}</span>
          </div>
          <div>
            <span>Tax</span>
            <span className="mono">{moneyIn(inv.tax_cents, inv.currency)}</span>
          </div>
          <div className="inv-doc-grand">
            <span>Total due</span>
            <span className="mono">{moneyIn(inv.total_cents, inv.currency)}</span>
          </div>
        </div>

        {inv.notes && (
          <div className="inv-doc-notes">
            <div className="inv-doc-label">Notes</div>
            <p>{inv.notes}</p>
          </div>
        )}
      </article>

      <InvoiceFormDialog open={editOpen} onOpenChange={setEditOpen} edit={inv} />
    </div>
  );
}
