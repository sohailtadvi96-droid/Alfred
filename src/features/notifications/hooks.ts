import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

const keys = {
  state: ['push', 'state'] as const,
};

/** Permission can change outside the app (iOS Settings, the browser's site
 *  settings), so re-read whenever the window regains focus. */
export function usePushState() {
  return useQuery({
    queryKey: keys.state,
    queryFn: () => api.readPushState(),
    refetchOnWindowFocus: true,
  });
}

export function useEnablePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (permission: Promise<NotificationPermission>) => api.enablePush(permission),
    onSettled: () => qc.invalidateQueries({ queryKey: ['push'] }),
  });
}

export function useDisablePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.disablePush(),
    onSettled: () => qc.invalidateQueries({ queryKey: ['push'] }),
  });
}

export function useSendTestPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.sendTestPush(),
    // a 404/410 deletes the row server-side; re-read in case it was this device
    onSettled: () => qc.invalidateQueries({ queryKey: ['push'] }),
  });
}

/** Once per signed-in app launch: re-assert this device's subscription row
 *  (last_seen_at). Failures are ignored — this is bookkeeping, not a feature. */
export function useReassertPush(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    api.reassertPush().catch(() => {
      /* offline, or push not set up here — nothing to do */
    });
  }, [userId]);
}
