import { FormEvent, useEffect, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { PasswordGenerator } from './PasswordGenerator';
import { useUpsertSecret } from './hooks';
import type { RevealedSecret, Secret } from './types';

export interface EditTarget {
  secret: Secret;
  revealed: RevealedSecret;
}

export function SecretFormDialog({
  open,
  onOpenChange,
  edit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** absent → add mode; present → edit mode with decrypted values pre-filled */
  edit?: EditTarget;
}) {
  const save = useUpsertSecret();

  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [secret, setSecret] = useState('');
  const [notes, setNotes] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel(edit?.secret.label ?? '');
    setUsername(edit?.secret.username ?? '');
    setUrl(edit?.secret.url ?? '');
    setTags((edit?.secret.tags ?? []).join(', '));
    setSecret(edit?.revealed.secret ?? '');
    setNotes(edit?.revealed.notes ?? '');
    setShowSecret(false);
    setShowGen(false);
    setError(null);
  }, [open, edit]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) return setError('Give it a name.');
    if (!secret) return setError('The secret itself cannot be empty.');
    try {
      await save.mutateAsync({
        id: edit?.secret.id ?? null,
        label,
        username,
        url,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        secret,
        notes,
      });
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err, 'Could not save the entry.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit entry' : 'Add to vault'}
      description="The secret and notes are encrypted server-side before they touch the database."
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            type="submit"
            form="secret-form"
            disabled={save.isPending || !label.trim() || !secret}
          >
            {save.isPending ? 'Saving…' : edit ? 'Save changes' : 'Add entry'}
          </button>
        </>
      }
    >
      <form id="secret-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="s-name">Name</label>
          <input
            id="s-name"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Gmail"
            autoFocus
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="s-user">Email / username</label>
            <input
              id="s-user"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. you@gmail.com"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="s-url">URL</label>
            <input
              id="s-url"
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="optional"
              inputMode="url"
            />
          </div>
        </div>

        <div className={`field${error && !secret ? ' bad' : ''}`}>
          <label htmlFor="s-secret">Secret</label>
          <div className="secret-input">
            <input
              id="s-secret"
              className="input mono"
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />
            <button type="button" className="row-x" onClick={() => setShowSecret((v) => !v)}>
              {showSecret ? 'hide' : 'show'}
            </button>
          </div>
          <button type="button" className="gate-link" onClick={() => setShowGen((v) => !v)}>
            {showGen ? 'Hide generator' : 'Generate a password'}
          </button>
        </div>

        {showGen && (
          <PasswordGenerator
            onUse={(pw) => {
              setSecret(pw);
              setShowSecret(true);
              setShowGen(false);
            }}
          />
        )}

        <div className="field">
          <label htmlFor="s-tags">Tags</label>
          <input
            id="s-tags"
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma, separated"
          />
        </div>

        <div className="field">
          <label htmlFor="s-notes">Notes</label>
          <textarea
            id="s-notes"
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional — also encrypted"
          />
        </div>

        {error && <div className="err" style={{ marginTop: -6 }}>{error}</div>}
      </form>
    </Dialog>
  );
}
