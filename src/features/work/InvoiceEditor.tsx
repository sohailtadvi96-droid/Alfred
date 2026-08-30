import { useState } from 'react';
import { InvoiceFormDialog } from './InvoiceFormDialog';
import { useInvoice } from './hooks';

/** Shared "edit an invoice picked from a list" wiring: the list only holds
 *  summary rows, so we fetch the full invoice (with line items) before the
 *  form opens. Returns a trigger and the dialog node to render. */
export function useInvoiceEditor() {
  const [editId, setEditId] = useState<string | null>(null);
  const { data: full } = useInvoice(editId ?? '');
  const open = !!editId && full?.id === editId;

  const editorNode = (
    <InvoiceFormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setEditId(null);
      }}
      edit={full ?? undefined}
    />
  );

  return { editInvoice: (id: string) => setEditId(id), editorNode };
}
