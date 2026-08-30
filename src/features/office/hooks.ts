import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { NewEvent, NewTask, OfficeNote, TaskStatus } from './types';

const keys = {
  tasks: ['office', 'tasks'] as const,
  events: ['office', 'events'] as const,
  notes: ['office', 'notes'] as const,
};

function invalidate(qc: ReturnType<typeof useQueryClient>, key: readonly string[]) {
  qc.invalidateQueries({ queryKey: key });
}

// ---------- tasks ----------
export function useTasks() {
  return useQuery({ queryKey: keys.tasks, queryFn: api.listTasks });
}

export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTask) => api.saveTask(input),
    onSuccess: () => invalidate(qc, keys.tasks),
  });
}

export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api.setTaskStatus(id, status),
    onSuccess: () => invalidate(qc, keys.tasks),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => invalidate(qc, keys.tasks),
  });
}

// ---------- events ----------
export function useEvents() {
  return useQuery({ queryKey: keys.events, queryFn: api.listEvents });
}

export function useSaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewEvent) => api.saveEvent(input),
    onSuccess: () => invalidate(qc, keys.events),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess: () => invalidate(qc, keys.events),
  });
}

// ---------- notes ----------
export function useNotes() {
  return useQuery({ queryKey: keys.notes, queryFn: api.listNotes });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.addNote(body),
    onSuccess: () => invalidate(qc, keys.notes),
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
    onSuccess: () => invalidate(qc, keys.notes),
  });
}
