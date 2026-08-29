import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import * as gate from './gate';

interface GateCtx {
  /** Resolves true once the vault is unlocked, false if the user backs out. */
  ensureUnlocked: () => Promise<boolean>;
  lock: () => void;
}

const Ctx = createContext<GateCtx | null>(null);

export function useSecretGate(): GateCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSecretGate must be used inside <SecretGateProvider>');
  return v;
}

export function SecretGateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const ensureUnlocked = useCallback(() => {
    if (gate.isUnlocked()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpen(true);
    });
  }, []);

  const value = useMemo<GateCtx>(
    () => ({ ensureUnlocked, lock: () => gate.lockNow() }),
    [ensureUnlocked],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <GateDialog
        open={open}
        onCancel={() => settle(false)}
        onUnlocked={() => settle(true)}
      />
    </Ctx.Provider>
  );
}

function GateDialog({
  open,
  onCancel,
  onUnlocked,
}: {
  open: boolean;
  onCancel: () => void;
  onUnlocked: () => void;
}) {
  const [platformAuth, setPlatformAuth] = useState(false);
  const [mode, setMode] = useState<'unlock' | 'enroll'>('unlock');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gate.platformAuthAvailable().then(setPlatformAuth);
  }, []);

  useEffect(() => {
    if (open) {
      setMode(gate.gateConfigured() ? 'unlock' : 'enroll');
      setPin('');
      setPin2('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function run(fn: () => Promise<void>, fail: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errMessage(err, fail));
      setBusy(false);
    }
  }

  const doTouchId = () =>
    run(async () => {
      await gate.unlock({ method: 'webauthn' });
      onUnlocked();
    }, 'Touch ID check did not pass.');

  const doPinUnlock = () =>
    run(async () => {
      await gate.unlock({ method: 'pin', pin });
      onUnlocked();
    }, 'That PIN is not right.');

  const doEnrollTouchId = () =>
    run(async () => {
      await gate.enrollWebAuthn();
      await gate.unlock({ method: 'webauthn' });
      onUnlocked();
    }, 'Could not set up Touch ID.');

  const doEnrollPin = () =>
    run(async () => {
      if (pin !== pin2) throw new Error('The two PINs do not match.');
      await gate.enrollPin(pin);
      await gate.unlock({ method: 'pin', pin });
      onUnlocked();
    }, 'Could not set the PIN.');

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onCancel()}
      title={mode === 'enroll' ? 'Set up the vault gate' : 'Unlock the vault'}
      description={
        mode === 'enroll'
          ? 'A separate check, on top of your login, before any secret is shown.'
          : 'Confirm it is you before ALFRED decrypts anything.'
      }
      footer={
        <button className="btn ghost sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      }
    >
      {mode === 'unlock' ? (
        <div className="gate-body">
          {gate.webauthnEnrolled() && (
            <button className="btn primary" type="button" disabled={busy} onClick={doTouchId}>
              {busy ? 'Waiting…' : 'Use Touch ID'}
            </button>
          )}
          {gate.pinEnrolled() && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                doPinUnlock();
              }}
            >
              <div className={`field${error ? ' bad' : ''}`}>
                <label htmlFor="gate-pin">Master PIN</label>
                <input
                  id="gate-pin"
                  className="input mono"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  autoFocus={!gate.webauthnEnrolled()}
                />
              </div>
              <button className="btn sec sm" type="submit" disabled={busy || pin.length < 4}>
                Unlock
              </button>
            </form>
          )}
          <button className="gate-link" type="button" onClick={() => setMode('enroll')}>
            Reconfigure the gate
          </button>
          {error && <div className="err">{error}</div>}
        </div>
      ) : (
        <div className="gate-body">
          {platformAuth && (
            <button className="btn primary" type="button" disabled={busy} onClick={doEnrollTouchId}>
              Enable Touch ID
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doEnrollPin();
            }}
          >
            <div className="field">
              <label htmlFor="gate-newpin">Master PIN (4–12 digits)</label>
              <input
                id="gate-newpin"
                className="input mono"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className={`field${error ? ' bad' : ''}`}>
              <label htmlFor="gate-newpin2">Repeat PIN</label>
              <input
                id="gate-newpin2"
                className="input mono"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button className="btn sec sm" type="submit" disabled={busy || pin.length < 4}>
              Save PIN
            </button>
          </form>
          {gate.gateConfigured() && (
            <button className="gate-link" type="button" onClick={() => setMode('unlock')}>
              Back to unlock
            </button>
          )}
          {error && <div className="err">{error}</div>}
          <p className="gate-note">
            Stored on this device only. Server-verified WebAuthn arrives with the decrypt Edge
            Function (Phase 3b).
          </p>
        </div>
      )}
    </Dialog>
  );
}
