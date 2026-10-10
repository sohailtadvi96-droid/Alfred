import { errMessage } from '@/lib/errors';
import { useDisablePush, useEnablePush, usePushState, useSendTestPush } from './hooks';
import type { TestResult } from './api';

// Same text styles the rest of the Settings page uses inline.
const lead = { color: 'var(--text-dim)', fontSize: 13, margin: '0 0 12px' } as const;
const hint = { color: 'var(--text-faint)', fontSize: 12, marginTop: 12, marginBottom: 0 } as const;
const fail = { ...hint, color: 'var(--neg)' } as const;
const row = { display: 'flex', gap: 8, flexWrap: 'wrap' } as const;

function describe(r: TestResult): string {
  const who = r.device_label ?? 'A device';
  if (r.outcome === 'sent') return `${who}: sent.`;
  if (r.outcome === 'gone') return `${who}: no longer subscribed (${r.status}), removed.`;
  return `${who}: failed (${r.status || 'no response'})${r.detail ? ` — ${r.detail}` : ''}.`;
}

/** Settings → Notifications: one switch for this device. */
export function EnablePush() {
  const { data: state, isLoading } = usePushState();
  const enable = useEnablePush();
  const disable = useDisablePush();
  const test = useSendTestPush();
  const error = enable.error ?? disable.error ?? test.error;

  if (isLoading || !state) return <p style={lead}>Checking this device…</p>;

  if (state.kind === 'unavailable') {
    if (state.reason === 'not-configured') {
      return <p style={lead}>Notifications aren’t set up for this build (no VAPID public key).</p>;
    }
    if (state.reason === 'no-worker') {
      return <p style={lead}>Notifications need the production build — the service worker doesn’t run in dev.</p>;
    }
    return (
      <>
        <p style={lead}>Notifications need Alfred installed on this device.</p>
        <p style={hint}>
          On iPhone: open Alfred in Safari, tap Share → Add to Home Screen, then open Alfred from the Home
          Screen and come back here.
        </p>
      </>
    );
  }

  if (state.kind === 'denied') {
    return (
      <>
        <p style={lead}>Notifications are blocked for Alfred on this device.</p>
        <p style={hint}>
          On iPhone: Settings → Notifications → Alfred → Allow Notifications. In a desktop browser: the site
          settings next to the address bar.
        </p>
      </>
    );
  }

  // Requested inside the tap itself, before anything is awaited — iOS ignores
  // a permission prompt that isn't.
  const askAndEnable = () => enable.mutate(Notification.requestPermission());

  return (
    <>
      {state.kind === 'ask' && (
        <>
          <p style={lead}>Get reminders on this device, even when Alfred is closed.</p>
          <button className="btn sec sm" onClick={askAndEnable} disabled={enable.isPending}>
            {enable.isPending ? 'Enabling…' : 'Enable notifications on this device'}
          </button>
        </>
      )}

      {state.kind === 'resubscribe' && (
        <>
          <p style={lead}>Notifications are allowed, but this device is no longer subscribed.</p>
          <button className="btn sec sm" onClick={askAndEnable} disabled={enable.isPending}>
            {enable.isPending ? 'Enabling…' : 'Re-enable'}
          </button>
        </>
      )}

      {state.kind === 'enabled' && (
        <>
          <p style={lead}>On for this device.</p>
          <div style={row}>
            <button className="btn sec sm" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? 'Sending…' : 'Send test'}
            </button>
            <button className="btn sec sm" onClick={() => disable.mutate()} disabled={disable.isPending}>
              {disable.isPending ? 'Turning off…' : 'Turn off'}
            </button>
          </div>
          {test.data &&
            (test.data.results.length === 0 ? (
              <p style={hint}>No subscribed devices found.</p>
            ) : (
              test.data.results.map((r) => (
                <p key={r.id} style={r.outcome === 'sent' ? hint : fail}>
                  {describe(r)}
                </p>
              ))
            ))}
        </>
      )}

      {error && <p style={fail}>{errMessage(error)}</p>}
    </>
  );
}
