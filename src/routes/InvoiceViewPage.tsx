import { Link, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { InvoiceView } from '@/features/work/InvoiceView';

export function InvoiceViewPage() {
  const { invoiceId = '' } = useParams();

  return (
    <>
      <TopBar
        title="Invoice"
        crumb="03 / WORK"
        showWallet={false}
        action={
          <Link className="btn sec" to="/work/invoices">
            ‹ All invoices
          </Link>
        }
      />
      <div className="wrap work">
        <InvoiceView invoiceId={invoiceId} />
      </div>
    </>
  );
}
