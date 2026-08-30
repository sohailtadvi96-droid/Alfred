import { supabase } from '@/lib/supabase';
import type { NewEvent, NewTask, OfficeEvent, OfficeNote, OfficeTask, TaskStatus } from './types';

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
export async function listNotes(): Promise<OfficeNote[]> {
  const { data, error } = await supabase
    .from('office_notes')
    .select('*')
    .eq('archived', false)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as OfficeNote[];
}

export async function addNote(body: string): Promise<void> {
  const { error } = await supabase.from('office_notes').insert({ body: body.trim() });
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
