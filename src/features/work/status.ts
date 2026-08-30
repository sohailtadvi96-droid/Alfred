import type { DeliverableStatus, InvoiceStatus, ProjectStatus } from './types';

export const PROJECT_STATUSES: { value: ProjectStatus; label: string; color: string }[] = [
  { value: 'prospective', label: 'Prospective', color: 'var(--text-faint)' },
  { value: 'active', label: 'Active', color: 'var(--wip)' },
  { value: 'delivered', label: 'Delivered', color: 'var(--pos)' },
  { value: 'on_hold', label: 'On hold', color: 'var(--c-ochre)' },
  { value: 'closed', label: 'Closed', color: 'var(--text-dim)' },
];

export function projectStatusMeta(status: ProjectStatus) {
  return PROJECT_STATUSES.find((s) => s.value === status) ?? PROJECT_STATUSES[0];
}

export function deliverableStatusLabel(status: DeliverableStatus): string {
  return status === 'delivered' ? 'Delivered' : 'Pending';
}

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'var(--text-faint)' },
  { value: 'sent', label: 'Sent', color: 'var(--wip)' },
  { value: 'paid', label: 'Paid', color: 'var(--pos)' },
  { value: 'overdue', label: 'Overdue', color: 'var(--neg)' },
];

export function invoiceStatusMeta(status: InvoiceStatus) {
  return INVOICE_STATUSES.find((s) => s.value === status) ?? INVOICE_STATUSES[0];
}

/** A 'sent' invoice past its due date reads as overdue even if not stamped. */
export function isEffectivelyOverdue(status: InvoiceStatus, dueDate: string | null): boolean {
  if (status === 'paid') return false;
  if (status === 'overdue') return true;
  if (status === 'sent' && dueDate) return new Date(dueDate) < new Date(new Date().toDateString());
  return false;
}
