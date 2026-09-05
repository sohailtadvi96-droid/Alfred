import { supabase } from '@/lib/supabase';
import { localDateKey } from './datetime';
import type {
  DaySummary,
  JournalEntry,
  NewEvent,
  NewTask,
  OfficeEvent,
  OfficeNote,
  OfficeTask,
  TaskStatus,
} from './types';

// ---------- tasks ----------
export async function listTasks(): Promise<OfficeTask[]> {
  const { data, error } = await supabase
    .from('office_tasks')
    .select('*')
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as OfficeTask[];
}

export async function saveTask(input: NewTask): Promise<void> {
  const row = {
    title: input.title.trim(),
    notes: input.notes.trim() || null,
    due_date: input.due_date,
    priority: input.priority,
  };
  if (input.id) {
    const { error } = await supabase.from('office_tasks').update(row).eq('id', input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('office_tasks').insert(row);
    if (error) throw error;
  }
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase
    .from('office_tasks')
    .update({ status, done_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('office_tasks').delete().eq('id', id);
  if (error) throw error;
}

// ---------- events ----------
export async function listEvents(): Promise<OfficeEvent[]> {
  const { data, error } = await supabase
    .from('office_events')
    .select('*')
    .gte('starts_at', new Date(Date.now() - 12 * 3600_000).toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data as OfficeEvent[];
}

export async function saveEvent(input: NewEvent): Promise<void> {
  const row = {
    title: input.title.trim(),
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    location: input.location.trim() || null,
    attendees: input.attendees.trim() || null,
    notes: input.notes.trim() || null,
  };
  if (input.id) {
    const { error } = await supabase.from('office_events').update(row).eq('id', input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('office_events').insert(row);
    if (error) throw error;
  }
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('office_events').delete().eq('id', id);
  if (error) throw error;
}

// ---------- notes ----------
/** Running "quick notes" on the calendar landing — the undated ones. */
export async function listNotes(): Promise<OfficeNote[]> {
  const { data, error } = await supabase
    .from('office_notes')
    .select('*')
    .eq('archived', false)
    .is('entry_date', null)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as OfficeNote[];
}

/** Notes attached to one calendar day. */
export async function listDayNotes(date: string): Promise<OfficeNote[]> {
  const { data, error } = await supabase
    .from('office_notes')
    .select('*')
    .eq('archived', false)
    .eq('entry_date', date)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as OfficeNote[];
}

export async function addNote(body: string, entryDate: string | null = null): Promise<void> {
  const { error } = await supabase
    .from('office_notes')
    .insert({ body: body.trim(), entry_date: entryDate });
  if (error) throw error;
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<OfficeNote, 'body' | 'pinned' | 'archived'>>,
): Promise<void> {
  const next = { ...patch };
  if (typeof next.body === 'string') next.body = next.body.trim();
  const { error } = await supabase.from('office_notes').update(next).eq('id', id);
  if (error) throw error;
}

// ---------- day-scoped reads ----------
export async function listEventsOn(dayStartISO: string, dayEndISO: string): Promise<OfficeEvent[]> {
  const { data, error } = await supabase
    .from('office_events')
    .select('*')
    .gte('starts_at', dayStartISO)
    .lt('starts_at', dayEndISO)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data as OfficeEvent[];
}

/** Tasks for one calendar day. When `includeOverdue`, also returns still-open
 *  tasks whose due date has already passed (used on the *today* page). */
export async function listDayTasks(date: string, includeOverdue: boolean): Promise<OfficeTask[]> {
  let q = supabase.from('office_tasks').select('*');
  q = includeOverdue
    ? q.or(`due_date.eq.${date},and(status.eq.open,due_date.lt.${date})`)
    : q.eq('due_date', date);
  const { data, error } = await q
    .order('due_date', { ascending: true })
    .order('priority', { ascending: false });
  if (error) throw error;
  return data as OfficeTask[];
}

// ---------- journal ----------
export async function getJournal(date: string): Promise<JournalEntry | null> {
  const { data, error } = await supabase
    .from('office_journal')
    .select('*')
    .eq('entry_date', date)
    .maybeSingle();
  if (error) throw error;
  return (data as JournalEntry) ?? null;
}

export async function saveJournal(date: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('office_journal')
    .upsert({ entry_date: date, body }, { onConflict: 'user_id,entry_date' });
  if (error) throw error;
}

/** Most recent non-empty journal entries, newest first. */
export async function listRecentJournal(limit = 12): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('office_journal')
    .select('*')
    .order('entry_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as JournalEntry[]).filter((e) => e.body.trim().length > 0);
}

// ---------- calendar month markers ----------
/** For a date window (grid start .. grid end, inclusive date strings), a short
 *  summary of each day: meeting + task titles, note count, journal first line.
 *  Drives both the cell dots and the hover preview. */
export async function monthActivity(
  startDate: string,
  endDate: string,
): Promise<Record<string, DaySummary>> {
  const startISO = new Date(`${startDate}T00:00:00`).toISOString();
  const endISO = new Date(`${endDate}T23:59:59`).toISOString();

  const [ev, tk, nt, jr] = await Promise.all([
    supabase
      .from('office_events')
      .select('starts_at, title')
      .gte('starts_at', startISO)
      .lte('starts_at', endISO)
      .order('starts_at', { ascending: true }),
    supabase
      .from('office_tasks')
      .select('due_date, title, status')
      .gte('due_date', startDate)
      .lte('due_date', endDate),
    supabase
      .from('office_notes')
      .select('entry_date')
      .eq('archived', false)
      .gte('entry_date', startDate)
      .lte('entry_date', endDate),
    supabase.from('office_journal').select('entry_date, body').gte('entry_date', startDate).lte('entry_date', endDate),
  ]);
  for (const r of [ev, tk, nt, jr]) if (r.error) throw r.error;

  const map: Record<string, DaySummary> = {};
  const touch = (key: string): DaySummary =>
    (map[key] ??= { events: [], tasks: [], noteCount: 0, journal: null });

  for (const r of (ev.data ?? []) as { starts_at: string; title: string }[])
    touch(localDateKey(r.starts_at)).events.push(r.title);
  for (const r of (tk.data ?? []) as { due_date: string | null; title: string; status: string }[])
    if (r.due_date) touch(r.due_date).tasks.push({ title: r.title, done: r.status === 'done' });
  for (const r of (nt.data ?? []) as { entry_date: string | null }[])
    if (r.entry_date) touch(r.entry_date).noteCount += 1;
  for (const r of (jr.data ?? []) as { entry_date: string; body: string }[]) {
    const line = r.body.replace(/\s+/g, ' ').trim();
    if (line) touch(r.entry_date).journal = line.slice(0, 90);
  }

  return map;
}
