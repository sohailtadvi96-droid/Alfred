import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { ReminderDraft, ReminderToday } from './types';

const keys = {
  today: ['reminders', 'today'] as const,
  upcoming: (days: number) => ['reminders', 'upcoming', days] as const,
  rules: ['reminders', 'rules'] as const,
  streak: (id: string) => ['reminders', 'streak', id] as const,
};

/** single-user app — after a non-tick write just refresh the whole
 *  Reminders subtree, same pattern as goals/hooks.ts and office/hooks.ts. */
function refresh(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['reminders'] });
}

/** Also invalidates the Goals subtree with the exact same top-level key
 *  goals/hooks.ts's own refresh() uses — a tick can write a goal_progress
 *  row (reminder_complete/uncomplete/skip, 0041), so a goal's pace/plan
 *  cache is just as stale as the reminders list is. */
function refreshGoalsToo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['reminders'] });
  qc.invalidateQueries({ queryKey: ['goals'] });
}

// ---------- reads ----------

/** due_now/overdue are computed server-side at query time (reminders_today,
 *  0041), so a stale cache doesn't just look wrong, it looks wrong about a
 *  fact that changed on its own -- refetch on window focus and every 5
 *  minutes to keep that honest without the user having to reload. */
export function useRemindersToday() {
  return useQuery({
    queryKey: keys.today,
    queryFn: () => api.listToday(),
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
  });
}

/** The one client source for "today" in this module (user_today(), 0040).
 *  staleTime: Infinity means it never goes stale on its own -- refetchOnWindowFocus:
 *  'always' forces exactly one refresh the moment the window regains focus
 *  (a plain `true` wouldn't refetch at all once staleTime is Infinity). So
 *  it's fresh as of the last time this tab was focused, never older. */
export function useUserToday() {
  return useQuery({
    queryKey: ['reminders', 'user-today'],
    queryFn: api.getUserToday,
    staleTime: Infinity,
    refetchOnWindowFocus: 'always',
  });
}

export function useUpcoming(days = 7) {
  return useQuery({ queryKey: keys.upcoming(days), queryFn: () => api.listUpcoming(days) });
}

export function useReminderRules() {
  return useQuery({ queryKey: keys.rules, queryFn: api.listRules });
}

export function useReminderStreak(id: string | undefined) {
  return useQuery({
    queryKey: id ? keys.streak(id) : keys.streak('none'),
    queryFn: () => api.getStreak(id as string),
    enabled: !!id,
  });
}

// ---------- optimistic tick mutations ----------
// complete/uncomplete/skip all touch the same ['reminders','today'] list a
// user is looking at when they tap a card, so each flips that row's done-ness
// in the cache immediately and rolls back on error, rather than waiting on a
// round trip to reflect a tap. due_state's fallback on the way back to "not
// done" reads is_overdue off the row already in cache — never a fresh
// "what day is it" computation on the client.

interface TickVars {
  id: string;
  occurrenceDate?: string;
}

function patchTodayRow(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  patch: (row: ReminderToday) => Partial<ReminderToday>,
) {
  const previous = qc.getQueryData<ReminderToday[]>(keys.today);
  qc.setQueryData<ReminderToday[]>(keys.today, (rows) =>
    rows?.map((row) => (row.id === id ? { ...row, ...patch(row) } : row)),
  );
  return previous;
}

export function useCompleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, occurrenceDate }: TickVars) => api.completeReminder(id, occurrenceDate),
    onMutate: async ({ id }: TickVars) => {
      await qc.cancelQueries({ queryKey: keys.today });
      const previous = patchTodayRow(qc, id, () => ({
        is_done: true,
        completion_status: 'done',
        done_via: 'tick',
        due_state: 'done',
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(keys.today, context.previous);
    },
    onSettled: () => refreshGoalsToo(qc),
  });
}

export function useUncompleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, occurrenceDate }: TickVars) => api.uncompleteReminder(id, occurrenceDate),
    onMutate: async ({ id }: TickVars) => {
      await qc.cancelQueries({ queryKey: keys.today });
      const previous = patchTodayRow(qc, id, (row) => ({
        is_done: false,
        completion_status: null,
        completed_at: null,
        done_via: null,
        due_state: row.is_overdue ? 'overdue' : 'later',
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(keys.today, context.previous);
    },
    onSettled: () => refreshGoalsToo(qc),
  });
}

/** Recurring only -- the RPC raises for a one_time reminder, which rolls
 *  the optimistic patch back same as any other error. */
export function useSkipReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, occurrenceDate }: TickVars) => api.skipReminder(id, occurrenceDate),
    onMutate: async ({ id }: TickVars) => {
      await qc.cancelQueries({ queryKey: keys.today });
      const previous = patchTodayRow(qc, id, (row) => ({
        completion_status: 'skipped',
        is_done: false,
        done_via: null,
        due_state: row.is_overdue ? 'overdue' : 'later',
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(keys.today, context.previous);
    },
    onSettled: () => refreshGoalsToo(qc),
  });
}

// ---------- rule CRUD + pause/resume ----------

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: ReminderDraft) => api.createReminder(draft),
    onSuccess: () => refresh(qc),
  });
}

export function useUpdateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ReminderDraft> }) => api.updateReminder(id, patch),
    onSuccess: () => refresh(qc),
  });
}

export function useArchiveReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveReminder(id),
    onSuccess: () => refresh(qc),
  });
}

export function useSnoozeReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) => api.snoozeReminder(id, until),
    onSuccess: () => refresh(qc),
  });
}

export function useRescheduleReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string }) => api.rescheduleReminder(id, dueDate),
    onSuccess: () => refresh(qc),
  });
}

export function usePauseReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.pauseReminder(id),
    onSuccess: () => refresh(qc),
  });
}

export function useResumeReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.resumeReminder(id),
    onSuccess: () => refresh(qc),
  });
}
