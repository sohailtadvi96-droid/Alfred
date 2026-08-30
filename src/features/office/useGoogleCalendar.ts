import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { errMessage } from '@/lib/errors';
import {
  connect as gcalConnect,
  disconnect as gcalDisconnect,
  fetchUpcoming,
  isGoogleConfigured,
  wasConnected,
} from './gcal';

export function useGoogleCalendar(days = 14) {
  const configured = isGoogleConfigured();
  const [connected, setConnected] = useState(() => configured && wasConnected());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['office', 'gcal', days],
    queryFn: () => fetchUpcoming(days),
    enabled: configured && connected,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!q.error) return;
    setError(errMessage(q.error, 'Google Calendar sync failed.'));
    // token/API failed — drop back to the Connect prompt (the persisted
    // flag stays, so a later mount still attempts a silent reconnect first)
    setConnected(false);
  }, [q.error]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      await gcalConnect(false);
      setConnected(true);
      await q.refetch();
    } catch (e) {
      setError(errMessage(e, 'Could not connect to Google Calendar.'));
    } finally {
      setConnecting(false);
    }
  }, [q]);

  const disconnect = useCallback(() => {
    gcalDisconnect();
    setConnected(false);
    setError(null);
  }, []);

  return {
    configured,
    connected,
    connecting,
    error,
    events: q.data ?? [],
    loading: q.isFetching,
    connect,
    disconnect,
    refresh: () => q.refetch(),
  };
}
