import { supabase } from '@/lib/supabase';
import type { Reminder, ReminderDraft, ReminderToday, ReminderUpcoming } from './types';

// ---------- reads ----------

/** reminders_today (0041). Omit `date` (the normal case -- every caller but
 *  a future "view an earlier/later day" affordance) so the server's
 *  user_today() decides, not the browser clock -- see plan §2 rule 5 and
 *  the R0 timezone finding. Passing an explicit date is only for that kind
 *  of deliberate day-navigation, never for "what day is it now". */
export async function listToday(date?: string): Promise<ReminderToday[]> {
  const { data, error } = await supabase.rpc('reminders_today', date ? { p_date: date } : {});
  if (error) throw error;
  return (data ?? []) as ReminderToday[];
}

/** reminders_upcoming (0041) -- the next `days` days, server-computed from user_today(). */
export async function listUpcoming(days = 7): Promise<ReminderUpcoming[]> {
  const { data, error } = await supabase.rpc('reminders_upcoming', { p_days: days });
  if (error) throw error;
  return (data ?? []) as ReminderUpcoming[];
}

/** Every non-archived rule, for the All tab. Ordered by kind, then by
 *  whichever time field applies to that kind -- due_time (one_time) and
 *  time_of_day (recurring) are mutually exclusive per row (0040's shape
 *  checks), so chaining both `.order()` calls only ever sorts the field
 *  that's actually populated within each kind group; the other is null for
 *  every row in that group and so never disturbs the order. */
export async function listRules(): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .neq('status', 'archived')
    .order('kind', { ascending: true })
    .order('due_time', { ascending: true, nullsFirst: false })
    .order('time_of_day', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as Reminder[];
}

/** reminder_streak (0041). No p_today passed -- same "let the server decide
 *  today" rule as listToday. */
export async function getStreak(id: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('reminder_streak', { p_id: id });
  if (error) throw error;
  return data as number | null;
}

// ---------- create / update / archive ----------

/** Maps whichever ReminderDraft fields are present onto DB columns of the
 *  same name -- used for both a full create (every field present) and a
 *  partial update (only the touched fields), so update never accidentally
 *  nulls a field the caller didn't mean to touch. */
function toRow(d: Partial<ReminderDraft>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.title !== undefined) row.title = d.title.trim();
  if (d.notes !== undefined) row.notes = d.notes.trim() || null;
  if (d.kind !== undefined) row.kind = d.kind;
  if (d.goal_id !== undefined) row.goal_id = d.goal_id;
  if (d.counts_as_task !== undefined) row.counts_as_task = d.counts_as_task;
  if (d.due_date !== undefined) row.due_date = d.due_date;
  if (d.due_time !== undefined) row.due_time = d.due_time;
  if (d.freq !== undefined) row.freq = d.freq;
  if (d.interval_n !== undefined) row.interval_n = d.interval_n;
  if (d.weekdays !== undefined) row.weekdays = d.weekdays;
  if (d.month_day !== undefined) row.month_day = d.month_day;
  if (d.time_of_day !== undefined) row.time_of_day = d.time_of_day;
  if (d.start_date !== undefined) row.start_date = d.start_date;
  if (d.end_date !== undefined) row.end_date = d.end_date;
  if (d.satisfied_by !== undefined) row.satisfied_by = d.satisfied_by;
  return row;
}

export async function createReminder(draft: ReminderDraft): Promise<void> {
  const { error } = await supabase.from('reminders').insert(toRow(draft));
  if (error) throw error;
}

export async function updateReminder(id: string, patch: Partial<ReminderDraft>): Promise<void> {
  const { error } = await supabase.from('reminders').update(toRow(patch)).eq('id', id);
  if (error) throw error;
}

/** Archiving, not deleting -- keeps history (streak, completions) intact. */
export async function archiveReminder(id: string): Promise<void> {
  const { error } = await supabase.from('reminders').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
}

// ---------- completion / pause RPCs (0041) ----------
// occurrenceDate is optional everywhere it appears in the RPC signature and
// is omitted here when the caller doesn't have one -- same "let user_today()
// decide" rule as listToday, never `new Date()` on the client.

export async function completeReminder(id: string, occurrenceDate?: string): Promise<void> {
  const { error } = await supabase.rpc(
    'reminder_complete',
    occurrenceDate ? { p_id: id, p_date: occurrenceDate } : { p_id: id },
  );
  if (error) throw error;
}

export async function uncompleteReminder(id: string, occurrenceDate?: string): Promise<void> {
  const { error } = await supabase.rpc(
    'reminder_uncomplete',
    occurrenceDate ? { p_id: id, p_date: occurrenceDate } : { p_id: id },
  );
  if (error) throw error;
}

/** Recurring only -- the RPC itself raises for a one_time reminder. */
export async function skipReminder(id: string, occurrenceDate?: string): Promise<void> {
  const { error } = await supabase.rpc(
    'reminder_skip',
    occurrenceDate ? { p_id: id, p_date: occurrenceDate } : { p_id: id },
  );
  if (error) throw error;
}

export async function pauseReminder(id: string): Promise<void> {
  const { error } = await supabase.rpc('reminder_pause', { p_id: id });
  if (error) throw error;
}

export async function resumeReminder(id: string): Promise<void> {
  const { error } = await supabase.rpc('reminder_resume', { p_id: id });
  if (error) throw error;
}
