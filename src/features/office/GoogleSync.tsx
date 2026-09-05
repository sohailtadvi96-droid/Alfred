import { useGoogleAuth } from './useGoogleCalendar';

export function GoogleSync() {
  const g = useGoogleAuth();

  if (!g.configured) {
    return (
      <div className="gsync gsync-setup">
        <span className="gsync-dot off" />
        <div className="gsync-text">
          <strong>Google Calendar not set up</strong>
          <span>
            Add <code>VITE_GOOGLE_CLIENT_ID</code> (an OAuth web client from Google Cloud, with the{' '}
            <code>calendar.events.readonly</code> scope) to <code>.env</code> and redeploy.
          </span>
        </div>
      </div>
    );
  }

  if (!g.connected) {
    return (
      <div className="gsync">
        <span className={`gsync-dot ${g.error ? 'err' : 'off'}`} />
        <div className="gsync-text">
          <strong>Google Calendar</strong>
          <span>{g.error ?? 'Pull your events in alongside local meetings.'}</span>
        </div>
        <button className="btn primary sm" onClick={g.connect} disabled={g.connecting}>
          {g.connecting ? 'Connecting…' : g.error ? 'Reconnect' : 'Connect'}
        </button>
      </div>
    );
  }

  return (
    <div className="gsync">
      <span className={`gsync-dot ${g.error ? 'err' : 'on'}`} />
      <div className="gsync-text">
        <strong>Google Calendar {g.error ? '— sync issue' : 'synced'}</strong>
        <span>{g.error ?? 'Events show on the calendar and on each day.'}</span>
      </div>
      <button className="btn ghost sm" onClick={g.refresh}>
        Refresh
      </button>
      <button className="btn ghost sm" onClick={g.disconnect}>
        Disconnect
      </button>
    </div>
  );
}
