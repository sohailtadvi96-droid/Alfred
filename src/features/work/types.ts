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
