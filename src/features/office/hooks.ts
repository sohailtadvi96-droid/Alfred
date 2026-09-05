import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import { dayEndISO, dayStartISO } from './calendar';
import type { NewEvent, NewTask, OfficeNote, TaskStatus } from './types';

const keys = {
  tasks: ['office', 'tasks'] as const,
  dayTasks: (date: string, overdue: boolean) => ['office', 'dayTasks', date, overdue] as const,
  events: ['office', 'events'] as const,
  dayEvents: (date: string) => ['office', 'dayEvents', date] as const,
  notes: ['office', 'notes'] as const,
  dayNotes: (date: string) => ['office', 'dayNotes', date] as const,
  journal: (date: string) => ['office', 'journal', date] as const,
  month: (key: string) => ['office', 'month', key] as const,
};

/** single-user app — after any write just refresh the whole Office subtree */
function refresh(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['office'] });
}

// ---------- tasks ----------
export function useTasks() {
  return useQuery({ queryKey: keys.tasks, queryFn: api.listTasks });
}

export function useDayTasks(date: string, includeOverdue: boolean) {
  return useQuery({
    queryKey: keys.dayTasks(date, includeOverdue),
    queryFn: () => api.listDayTasks(date, includeOverdue),
    enabled: !!date,
  });
}

export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTask) => api.saveTask(input),
    onSuccess: () => refresh(qc),
  });
}

export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api.setTaskStatus(id, status),
    onSuccess: () => refresh(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => refresh(qc),
  });
}

// ---------- events ----------
export function useEvents() {
  return useQuery({ queryKey: keys.events, queryFn: api.listEvents });
}

export function useDayEvents(date: string) {
  return useQuery({
    queryKey: keys.dayEvents(date),
    queryFn: () => api.listEventsOn(dayStartISO(date), dayEndISO(date)),
    enabled: !!date,
  });
}

export function useSaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewEvent) => api.saveEvent(input),
    onSuccess: () => refresh(qc),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess: () => refresh(qc),
  });
}

// ---------- notes ----------
export function useNotes() {
  return useQuery({ queryKey: keys.notes, queryFn: api.listNotes });
}

export function useDayNotes(date: string) {
  return useQuery({ queryKey: keys.dayNotes(date), queryFn: () => api.listDayNotes(date), enabled: !!date });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, entryDate = null }: { body: string; entryDate?: string | null }) =>
      api.addNote(body, entryDate),
    onSuccess: () => refresh(qc),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<OfficeNote, 'body' | 'pinned' | 'archived'>>;
    }) => api.updateNote(id, patch),
    onSuccess: () => refresh(qc),
  });
}

// ---------- journal ----------
export function useJournal(date: string) {
  return useQuery({ queryKey: keys.journal(date), queryFn: () => api.getJournal(date), enabled: !!date });
}

export function useSaveJournal(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.saveJournal(date, body),
    onSuccess: () => refresh(qc),
  });
}

// ---------- calendar ----------
export function useMonthActivity(start: string, end: string) {
  return useQuery({
    queryKey: keys.month(`${start}_${end}`),
    queryFn: () => api.monthActivity(start, end),
    enabled: !!start && !!end,
  });
}
