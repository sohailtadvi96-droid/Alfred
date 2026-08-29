import { useCallback, useEffect, useRef, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { AccessLogPanel } from './AccessLogPanel';
import { useSecretGate } from './SecretGate';
import { SecretFormDialog, type EditTarget } from './SecretFormDialog';
import { VaultList, type VaultRowState } from './VaultList';
import * as api from './api';
import { useDeleteSecret, useLogCopy, useRevealSecret, useSecrets } from './hooks';
import type { Secret } from './types';

const REVEAL_HIDE_MS = 20_000;
const CLIPBOARD_CLEAR_MS = 30_000;
const LOG_PREF_KEY = 'alfred.secrets.showLog';

export function SecretsView({
  addOpen,
  onAddOpenChange,
}: {
  addOpen: boolean;
  onAddOpenChange: (v: boolean) => void;
}) {
  const gate = useSecretGate();
  const { data: secrets, isLoading, error } = useSecrets();
  const reveal = useRevealSecret();
  const del = useDeleteSecret();
  const logCopy = useLogCopy();

  const [rows, setRows] = useState<Record<string, VaultRowState>>({});
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [showLog, setShowLog] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOG_PREF_KEY) !== '0';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LOG_PREF_KEY, showLog ? '1' : '0');
    } catch {
      /* storage disabled — preference just won't persist */
    }
  }, [showLog]);

  const hideTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const clipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = (id: string, p: VaultRowState) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));

  const hide = useCallback((id: string) => {
    const t = hideTimers.current.get(id);
    if (t) clearTimeout(t);
    hideTimers.current.delete(id);
    setRows((r) => ({ ...r, [id]: { ...r[id], revealed: undefined } }));
  }, []);

  useEffect(() => {
    const timers = hideTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      if (clipTimer.current) clearTimeout(clipTimer.current);
    };
  }, []);

  const flash = (msg: string) => {
    setBanner(msg);
    setTimeout(() => setBanner((b) => (b === msg ? null : b)), 4000);
  };

  async function withUnlock<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (!(await gate.ensureUnlocked())) return undefined;
    return fn();
  }

  const doReveal = (s: Secret) =>
    withUnlock(async () => {
      patch(s.id, { busy: true });
      try {
        const revealed = await reveal.mutateAsync(s.id);
        patch(s.id, { revealed, busy: false });
        const t = setTimeout(() => hide(s.id), REVEAL_HIDE_MS);
        hideTimers.current.set(s.id, t);
      } catch (err) {
        patch(s.id, { busy: false });
        flash(errMessage(err, 'Could not reveal that entry.'));
      }
    });

  const doCopy = (s: Secret) =>
    withUnlock(async () => {
      patch(s.id, { busy: true });
      try {
        const value = rows[s.id]?.revealed?.secret ?? (await reveal.mutateAsync(s.id)).secret;
        await navigator.clipboard.writeText(value);
        await logCopy.mutateAsync(s.id);
        patch(s.id, { busy: false });
        flash('Copied — clipboard clears in 30s.');
        if (clipTimer.current) clearTimeout(clipTimer.current);
        clipTimer.current = setTimeout(() => {
          navigator.clipboard.writeText('').catch(() => {});
        }, CLIPBOARD_CLEAR_MS);
      } catch (err) {
        patch(s.id, { busy: false });
        flash(errMessage(err, 'Could not copy that entry.'));
      }
    });

  const doEdit = (s: Secret) =>
    withUnlock(async () => {
      patch(s.id, { busy: true });
      try {
        const revealed = await api.revealSecret(s.id);
        setEdit({ secret: s, revealed });
      } catch (err) {
        flash(errMessage(err, 'Could not open that entry.'));
      } finally {
        patch(s.id, { busy: false });
      }
    });

  const doDelete = (s: Secret) => {
    if (!confirm(`Delete “${s.label}” from the vault? This cannot be undone.`)) return;
    del.mutate(s.id, {
      onError: (err) => flash(errMessage(err, 'Could not delete that entry.')),
    });
  };

  return (
    <div className="wrap secrets">
      {banner && <div className="secrets-banner">{banner}</div>}

      <div className="secrets-toolbar">
        <button
          className="btn ghost sm"
          type="button"
          aria-pressed={showLog}
          onClick={() => setShowLog((v) => !v)}
        >
          {showLog ? 'Hide access log' : 'Show access log'}
        </button>
      </div>

      <div className={`secrets-grid${showLog ? '' : ' no-log'}`}>
        <VaultList
          secrets={secrets}
          isLoading={isLoading}
          error={error}
          rowState={rows}
          onReveal={doReveal}
          onHide={hide}
          onCopy={doCopy}
          onEdit={doEdit}
          onDelete={doDelete}
        />
        {showLog && <AccessLogPanel secrets={secrets} />}
      </div>

      <SecretFormDialog open={addOpen} onOpenChange={onAddOpenChange} />
      <SecretFormDialog
        open={edit != null}
        onOpenChange={(v) => !v && setEdit(null)}
        edit={edit ?? undefined}
      />
    </div>
  );
}
