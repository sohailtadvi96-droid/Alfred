import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { DeliverableStatus, NewClient, NewProject } from './types';

const keys = {
  clients: ['work', 'clients'] as const,
  projects: ['work', 'projects'] as const,
  project: (id: string) => ['work', 'project', id] as const,
  assets: (id: string) => ['work', 'assets', id] as const,
  deliverables: (id: string) => ['work', 'deliverables', id] as const,
  time: (id: string) => ['work', 'time', id] as const,
};

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['work'] });
}

// ---------- clients ----------
export function useClients() {
  return useQuery({ queryKey: keys.clients, queryFn: api.listClients });
}

export function useAddClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewClient) => api.addClient(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clients }),
  });
}

// ---------- projects ----------
export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: api.listProjects });
}

export function useProject(id: string) {
  return useQuery({ queryKey: keys.project(id), queryFn: () => api.getProject(id), enabled: !!id });
}

export function useUpsertProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewProject) => api.upsertProject(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => invalidateAll(qc),
  });
}

// ---------- assets ----------
export function useAssets(projectId: string) {
  return useQuery({
    queryKey: keys.assets(projectId),
    queryFn: () => api.listAssets(projectId),
    enabled: !!projectId,
  });
}

export function useAddAsset(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, note }: { label: string; note: string }) =>
      api.addAsset(projectId, label, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.assets(projectId) }),
  });
}

export function useUpdateAsset(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { label?: string; provided?: boolean; note?: string | null };
    }) => api.updateAsset(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.assets(projectId) }),
  });
}

export function useDeleteAsset(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAsset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.assets(projectId) }),
  });
}

// ---------- deliverables ----------
export function useDeliverables(projectId: string) {
  return useQuery({
    queryKey: keys.deliverables(projectId),
    queryFn: () => api.listDeliverables(projectId),
    enabled: !!projectId,
  });
}

export function useAddDeliverable(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, dueDate }: { label: string; dueDate: string | null }) =>
      api.addDeliverable(projectId, label, dueDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.deliverables(projectId) }),
  });
}

export function useSetDeliverableStatus(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: DeliverableStatus }) =>
      api.setDeliverableStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.deliverables(projectId) }),
  });
}

export function useDeleteDeliverable(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteDeliverable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.deliverables(projectId) }),
  });
}

// ---------- time entries ----------
export function useTimeEntries(projectId: string) {
  return useQuery({
    queryKey: keys.time(projectId),
    queryFn: () => api.listTimeEntries(projectId),
    enabled: !!projectId,
  });
}

export function useAddTimeEntry(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entryDate,
      hours,
      note,
    }: {
      entryDate: string;
      hours: number;
      note: string;
    }) => api.addTimeEntry(projectId, entryDate, hours, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.time(projectId) }),
  });
}

export function useDeleteTimeEntry(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTimeEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.time(projectId) }),
  });
}
