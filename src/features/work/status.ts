import type { DeliverableStatus, ProjectStatus } from './types';

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
