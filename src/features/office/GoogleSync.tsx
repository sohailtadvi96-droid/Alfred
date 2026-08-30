import type { useGoogleCalendar } from './useGoogleCalendar';

type Gcal = ReturnType<typeof useGoogleCalendar>;

export function GoogleSync({ gcal }: { gcal: Gcal }) {
  if (!gcal.configured) {
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

  if (!gcal.connected) {
    return (
      <div className="gsync">
        <span className={`gsync-dot ${gcal.error ? 'err' : 'off'}`} />
        <div className="gsync-text">
          <strong>Google Calendar</strong>
          <span>
            {gcal.error ?? 'Pull your upcoming events in alongside local meetings.'}
          </span>
        </div>
        <button className="btn primary sm" onClick={gcal.connect} disabled={gcal.connecting}>
          {gcal.connecting ? 'Connecting…' : gcal.error ? 'Reconnect' : 'Connect'}
        </button>
      </div>
    );
  }

  return (
    <div className="gsync">
      <span className={`gsync-dot ${gcal.error ? 'err' : 'on'}`} />
      <div className="gsync-text">
        <strong>Google Calendar {gcal.error ? '— sync issue' : 'synced'}</strong>
        {gcal.error ? (
          <span>{gcal.error}</span>
        ) : (
          <span>
            {gcal.events.length} event{gcal.events.length === 1 ? '' : 's'} in the next two weeks
          </span>
        )}
      </div>
      <button className="btn ghost sm" onClick={() => gcal.refresh()} disabled={gcal.loading}>
        {gcal.loading ? '…' : 'Refresh'}
      </button>
      <button className="btn ghost sm" onClick={gcal.disconnect}>
        Disconnect
      </button>
    </div>
  );
}
