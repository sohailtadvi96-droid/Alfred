export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'open' | 'done';

export interface OfficeTask {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfficeEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  attendees: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfficeNote {
  id: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewTask {
  id: string | null;
  title: string;
  notes: string;
  due_date: string | null;
  priority: TaskPriority;
}

export interface NewEvent {
  id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  attendees: string;
  notes: string;
}

/** A calendar entry as shown in the UI — either a local meeting or a
 *  read-only event pulled from Google Calendar. */
export interface AgendaEvent {
  id: string;
  source: 'local' | 'google';
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  /** htmlLink for google events, so the row can deep-link back */
  url: string | null;
}
