import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { InvoiceList } from '@/features/work/InvoiceList';
import { InvoiceFormDialog } from '@/features/work/InvoiceFormDialog';
import { useInvoices } from '@/features/work/hooks';

export function InvoicesPage() {
  const { data: invoices, isLoading, error } = useInvoices();
  const [addOpen, setAddOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <TopBar
        title="Invoices"
        crumb="03 / WORK"
        showWallet={false}
        action={
          <>
            <Link className="btn sec" to="/work">
              ‹ Projects
            </Link>
            <button className="btn primary" onClick={() => setAddOpen(true)}>
              New invoice
            </button>
          </>
        }
      />
      <div className="wrap work">
        <InvoiceList
          invoices={invoices}
          isLoading={isLoading}
          error={error}
          emptyHint="Generate one from a project, or start a blank invoice here."
        />
      </div>

      <InvoiceFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={(id) => navigate(`/work/invoices/${id}`)}
      />
    </>
  );
}
