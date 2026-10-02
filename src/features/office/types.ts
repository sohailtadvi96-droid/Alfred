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

/** done_today_feed row (0045) -- a task or a reminder completion, done on
 *  the same local day. reminder_kind is null for a task row. */
export interface DoneFeedRow {
  source: 'task' | 'reminder';
  id: string;
  title: string;
  completed_at: string;
  counts_as_task: boolean;
  reminder_kind: 'one_time' | 'recurring' | null;
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
  /** null → running quick note (calendar landing); a date → that day's page */
  entry_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** what a calendar day holds — drives the cell's dots and its hover preview */
export interface DaySummary {
  /** local meeting titles (Google titles are merged in on the client) */
  events: string[];
  tasks: { title: string; done: boolean }[];
  noteCount: number;
  /** first line of the journal entry, trimmed — null when empty */
  journal: string | null;
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
