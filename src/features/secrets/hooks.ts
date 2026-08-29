import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { NewSecret } from './types';

const keys = {
  list: ['secrets', 'list'] as const,
  log: ['secrets', 'log'] as const,
};

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['secrets'] });
}

export function useSecrets() {
  return useQuery({ queryKey: keys.list, queryFn: api.listSecrets });
}

export function useAccessLog() {
  return useQuery({ queryKey: keys.log, queryFn: () => api.listAccessLog() });
}

export function useUpsertSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSecret) => api.upsertSecret(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSecret(id),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Reveal + refresh the log/list (last_revealed_at moved). */
export function useRevealSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revealSecret(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useLogCopy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.logCopy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.log }),
  });
}
