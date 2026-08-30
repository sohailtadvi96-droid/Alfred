import { supabase } from '@/lib/supabase';
import type {
  Client,
  Deliverable,
  DeliverableStatus,
  InvoiceFull,
  InvoiceRow,
  InvoiceStatus,
  NewClient,
  NewProject,
  ProjectAsset,
  ProjectWithClient,
  SaveInvoiceInput,
  TimeEntry,
} from './types';

// ---------- clients ----------
export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data as Client[];
}

export async function addClient(input: NewClient): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: input.name.trim(),
      email: input.email.trim() || null,
      billing_address: input.billing_address.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Client;
}

// ---------- projects ----------
export async function listProjects(): Promise<ProjectWithClient[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, client:clients(id,name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ProjectWithClient[];
}

export async function getProject(id: string): Promise<ProjectWithClient> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, client:clients(id,name)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as ProjectWithClient;
}

export async function upsertProject(input: NewProject): Promise<string> {
  const row = {
    name: input.name.trim(),
    client_id: input.client_id,
    description: input.description.trim() || null,
    status: input.status,
    rate_type: input.rate_type,
    rate_cents: input.rate_type === 'hourly' ? input.rate_cents : null,
    fixed_amount_cents: input.rate_type === 'fixed' ? input.fixed_amount_cents : null,
    currency: input.currency,
    started_on: input.started_on,
    target_delivery_on: input.target_delivery_on,
  };

  if (input.id) {
    const { error } = await supabase.from('projects').update(row).eq('id', input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase.from('projects').insert(row).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// ---------- project assets ----------
export async function listAssets(projectId: string): Promise<ProjectAsset[]> {
  const { data, error } = await supabase
    .from('project_assets')
    .select('*')
    .eq('project_id', projectId)
    .order('id', { ascending: true });
  if (error) throw error;
  return data as ProjectAsset[];
}

export async function addAsset(projectId: string, label: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('project_assets')
    .insert({ project_id: projectId, label: label.trim(), note: note.trim() || null });
  if (error) throw error;
}

export async function updateAsset(
  id: string,
  patch: Partial<Pick<ProjectAsset, 'label' | 'provided' | 'note'>>,
): Promise<void> {
  const { error } = await supabase.from('project_assets').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteAsset(id: string): Promise<void> {
  const { error } = await supabase.from('project_assets').delete().eq('id', id);
  if (error) throw error;
}

// ---------- deliverables ----------
export async function listDeliverables(projectId: string): Promise<Deliverable[]> {
  const { data, error } = await supabase
    .from('deliverables')
    .select('*')
    .eq('project_id', projectId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });
  if (error) throw error;
  return data as Deliverable[];
}

export async function addDeliverable(
  projectId: string,
  label: string,
  dueDate: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('deliverables')
    .insert({ project_id: projectId, label: label.trim(), due_date: dueDate });
  if (error) throw error;
}

export async function setDeliverableStatus(id: string, status: DeliverableStatus): Promise<void> {
  const { error } = await supabase
    .from('deliverables')
    .update({
      status,
      delivered_at: status === 'delivered' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteDeliverable(id: string): Promise<void> {
  const { error } = await supabase.from('deliverables').delete().eq('id', id);
  if (error) throw error;
}

// ---------- time entries ----------
export async function listTimeEntries(projectId: string): Promise<TimeEntry[]> {
  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as TimeEntry[]).map((r) => ({ ...r, hours: Number(r.hours) }));
}

export async function addTimeEntry(
  projectId: string,
  entryDate: string,
  hours: number,
  note: string,
): Promise<void> {
  const { error } = await supabase
    .from('time_entries')
    .insert({ project_id: projectId, entry_date: entryDate, hours, note: note.trim() || null });
  if (error) throw error;
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const { error } = await supabase.from('time_entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------- invoices ----------
const INVOICE_SELECT_ROW = '*, project:projects(id,name), client:clients(id,name)';
const INVOICE_SELECT_FULL =
  '*, project:projects(id,name), client:clients(*), line_items:invoice_line_items(*)';

/** quantity carries 2 decimals; amount is rounded to whole cents. */
function lineAmountCents(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

export async function listInvoices(): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT_ROW)
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as InvoiceRow[];
}

export async function listProjectInvoices(projectId: string): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT_ROW)
    .eq('project_id', projectId)
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as InvoiceRow[];
}

export async function getInvoice(id: string): Promise<InvoiceFull> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT_FULL)
    .eq('id', id)
    .single();
  if (error) throw error;
  const inv = data as InvoiceFull;
  inv.line_items = [...(inv.line_items ?? [])]
    .map((li) => ({ ...li, quantity: Number(li.quantity) }))
    .sort((a, b) => a.position - b.position);
  return inv;
}

/** Insert the invoice header + its line items, or replace them on update.
 *  A new invoice draws its number from `next_invoice_number()`; an existing
 *  one keeps the number it already has. */
export async function saveInvoice(input: SaveInvoiceInput): Promise<string> {
  const items = input.lineItems.map((li, i) => ({
    description: li.description.trim(),
    quantity: li.quantity,
    unit_price_cents: li.unit_price_cents,
    amount_cents: lineAmountCents(li.quantity, li.unit_price_cents),
    position: i,
  }));
  const subtotal = items.reduce((s, li) => s + li.amount_cents, 0);
  const tax = Math.max(0, Math.round(input.tax_cents));
  const header = {
    project_id: input.project_id,
    client_id: input.client_id,
    issue_date: input.issue_date,
    due_date: input.due_date,
    currency: input.currency,
    notes: input.notes.trim() || null,
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: subtotal + tax,
  };

  let invoiceId = input.id;
  if (invoiceId) {
    const { error } = await supabase.from('invoices').update(header).eq('id', invoiceId);
    if (error) throw error;
    const { error: delErr } = await supabase
      .from('invoice_line_items')
      .delete()
      .eq('invoice_id', invoiceId);
    if (delErr) throw delErr;
  } else {
    const { data: num, error: numErr } = await supabase.rpc('next_invoice_number');
    if (numErr) throw numErr;
    const { data, error } = await supabase
      .from('invoices')
      .insert({ ...header, invoice_number: num as string, status: 'draft' })
      .select('id')
      .single();
    if (error) throw error;
    invoiceId = (data as { id: string }).id;
  }

  if (items.length > 0) {
    const { error } = await supabase
      .from('invoice_line_items')
      .insert(items.map((li) => ({ ...li, invoice_id: invoiceId })));
    if (error) throw error;
  }
  return invoiceId;
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
  const { error } = await supabase.from('invoices').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}
