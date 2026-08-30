export type ProjectStatus = 'prospective' | 'active' | 'delivered' | 'closed' | 'on_hold';
export type RateType = 'hourly' | 'fixed';
export type DeliverableStatus = 'pending' | 'delivered';

export interface Client {
  id: string;
  name: string;
  email: string | null;
  billing_address: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  client_id: string | null;
  description: string | null;
  /** the full brief the client sent, edited in place on the project page */
  brief: string | null;
  status: ProjectStatus;
  rate_type: RateType;
  rate_cents: number | null;
  fixed_amount_cents: number | null;
  currency: string;
  started_on: string | null;
  target_delivery_on: string | null;
  created_at: string;
  updated_at: string;
}

/** A project row joined with its client (for the list). */
export interface ProjectWithClient extends Project {
  client: Pick<Client, 'id' | 'name'> | null;
}

export interface ProjectAsset {
  id: string;
  project_id: string;
  label: string;
  provided: boolean;
  note: string | null;
}

export interface Deliverable {
  id: string;
  project_id: string;
  label: string;
  status: DeliverableStatus;
  due_date: string | null;
  delivered_at: string | null;
  note: string | null;
}

export interface TimeEntry {
  id: string;
  project_id: string;
  entry_date: string;
  hours: number;
  note: string | null;
  created_at: string;
}

export interface NewProject {
  /** null → insert, otherwise update that row */
  id: string | null;
  name: string;
  client_id: string | null;
  description: string;
  status: ProjectStatus;
  rate_type: RateType;
  rate_cents: number | null;
  fixed_amount_cents: number | null;
  currency: string;
  started_on: string | null;
  target_delivery_on: string | null;
}

export interface NewClient {
  name: string;
  email: string;
  billing_address: string;
}

/** Derived, never stored — computed from time entries + rate. */
export interface Earnings {
  hours: number;
  earnedCents: number;
  /** earned ÷ hours, in cents; null when no hours logged */
  effectiveHourlyCents: number | null;
  basis: RateType;
}

// ---------- invoices ----------
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  position: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  project_id: string | null;
  client_id: string | null;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** List row: invoice joined with project + client names. */
export interface InvoiceRow extends Invoice {
  project: Pick<Project, 'id' | 'name'> | null;
  client: Pick<Client, 'id' | 'name'> | null;
}

/** Full invoice for the document view: line items + the client billing block. */
export interface InvoiceFull extends Invoice {
  project: Pick<Project, 'id' | 'name'> | null;
  client: Client | null;
  line_items: InvoiceLineItem[];
}

/** A row in the invoice form before it's saved. */
export interface DraftLineItem {
  /** existing row id, or null for a new one */
  id: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface SaveInvoiceInput {
  /** null → create (allocates a number), otherwise update that invoice */
  id: string | null;
  project_id: string | null;
  client_id: string | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  notes: string;
  tax_cents: number;
  lineItems: { description: string; quantity: number; unit_price_cents: number }[];
}
