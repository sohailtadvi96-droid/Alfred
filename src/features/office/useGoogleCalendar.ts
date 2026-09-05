import { useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { errMessage } from '@/lib/errors';
import {
  connectInteractive,
  disconnectAll,
  fetchRange,
  getAuthState,
  isGoogleConfigured,
  reportSyncError,
  subscribeAuth,
} from './gcal';

/** Global Google-Calendar connection state (shared across the calendar view
 *  and every day page via a module store in gcal.ts). */
export function useGoogleAuth() {
  const state = useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
  const qc = useQueryClient();
  return {
    configured: isGoogleConfigured(),
    connected: state.connected,
    connecting: state.connecting,
    error: state.error,
    connect: connectInteractive,
    disconnect: disconnectAll,
    refresh: () => qc.invalidateQueries({ queryKey: ['office', 'gcal'] }),
  };
}

/** Events for an explicit window — pass ISO strings for whatever range is on
 *  screen (the visible month grid, or a single day). Fetches only while
 *  configured + connected; a failure drops the shared state to disconnected. */
export function useGoogleEvents(timeMinISO: string | null, timeMaxISO: string | null) {
  const { configured, connected } = useGoogleAuth();

  const q = useQuery({
    queryKey: ['office', 'gcal', timeMinISO, timeMaxISO],
    queryFn: () => fetchRange(timeMinISO as string, timeMaxISO as string),
    enabled: configured && connected && !!timeMinISO && !!timeMaxISO,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!q.error) return;
    // a 401/403 is already handled (disconnected + messaged) inside fetchRange
    if (errMessage(q.error) === '__revoked__') return;
    reportSyncError(errMessage(q.error, 'Google Calendar sync failed.'));
  }, [q.error]);

  useEffect(() => {
    if (q.isSuccess && getAuthState().error) reportSyncError('');
  }, [q.isSuccess]);

  return { events: q.data ?? [], loading: q.isFetching, refetch: q.refetch };
}
