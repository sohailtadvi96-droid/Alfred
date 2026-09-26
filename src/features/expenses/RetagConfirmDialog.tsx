import { useEffect, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import * as api from './api';
import type { RetagResult } from './api';
import { useCommitVpaTag } from './hooks';
import { notSaved } from './recategoriseSummary';

export interface RetagTarget {
  vpa: string;
  name: string | null;
  kind: 'family' | 'ferrari';
  next: boolean; // true = add/pin, false = remove/unpin
}

const KIND_LABEL = { family: 'family', ferrari: 'Ferrari shop' } as const;

/** The flag is on the payee, so tagging one VPA also tags the payee's others. */
const scopeText = (vpas: number) => (vpas > 1 ? `for this payee's ${vpas} VPAs` : 'for this VPA');

export function RetagConfirmDialog({
  target,
  onClose,
}: {
  target: RetagTarget | null;
  onClose: () => void;
}) {
  const commit = useCommitVpaTag();
  const [preview, setPreview] = useState<RetagResult | null>(null);
  const [done, setDone] = useState<RetagResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setDone(null);
    setError(null);
    if (!target) return;
    let live = true;
    api
      .previewVpaTag(target.vpa, target.kind, target.next)
      .then((r) => live && setPreview(r))
      .catch((e) => live && setError(errMessage(e, 'Could not work out what would change.')));
    return () => {
      live = false;
    };
  }, [target]);

  if (!target) return null;

  const label = KIND_LABEL[target.kind];
  const name = target.name || target.vpa;
  const dest =
    target.kind === 'family'
      ? 'money out → Family, money in → Income'
      : 'small payments on the ₹20 grid → My Ferrari';

  async function confirm() {
    if (!target) return;
    setError(null);
    try {
      const r = await commit.mutateAsync({
        vpa: target.vpa,
        displayName: target.name,
        kind: target.kind,
        next: target.next,
      });
      setDone(r);
    } catch (e) {
      setError(errMessage(e, 'Could not save.'));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={
        target.next
          ? `Add ${name} to ${label}`
          : `Remove ${name} from ${label}`
      }
      description={
        done
          ? undefined
          : `Keyed on the VPA ${target.vpa}. This is sticky — every future import honours it.`
      }
      footer={
        done ? (
          <button className="btn primary sm" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn ghost sm" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn primary sm"
              type="button"
              onClick={confirm}
              disabled={commit.isPending || !preview}
            >
              {commit.isPending
                ? 'Saving…'
                : preview && preview.moved > 0
                  ? `${target.next ? 'Add' : 'Remove'} & move ${preview.moved}`
                  : preview && preview.refreshed > 0
                    ? `${target.next ? 'Add' : 'Remove'} & refresh ${preview.refreshed}`
                    : target.next
                      ? 'Add'
                      : 'Remove'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <p>
          {done.moved === 0 && done.refreshed === 0 ? (
            <>Saved. No existing transactions needed re-categorising.{notSaved(done.unwritten)}</>
          ) : (
            <>
              Saved. Of {done.scanned} existing transaction{done.scanned === 1 ? '' : 's'} {scopeText(done.vpas)},{' '}
              <b>{done.moved}</b> changed category
              {done.refreshed > 0 && (
                <>
                  {' '}
                  and <b>{done.refreshed}</b> {done.refreshed === 1 ? 'was' : 'were'} refreshed
                </>
              )}
              .{notSaved(done.unwritten)}
            </>
          )}
        </p>
      ) : !preview ? (
        <p className="tlabel">Checking existing transactions…</p>
      ) : (
        <p>
          {preview.scanned === 0 ? (
            <>No existing transactions {scopeText(preview.vpas)} — this only affects future imports.</>
          ) : preview.moved === 0 && preview.refreshed === 0 ? (
            <>
              {preview.scanned} existing transaction{preview.scanned === 1 ? '' : 's'} {scopeText(preview.vpas)} —
              none change category.
            </>
          ) : (
            <>
              <b>{preview.moved}</b> of {preview.scanned} existing transaction
              {preview.scanned === 1 ? '' : 's'} will change category ({dest})
              {preview.refreshed > 0 && (
                <>
                  , <b>{preview.refreshed}</b> more will be refreshed (same category; confidence and match
                  details brought up to date)
                </>
              )}
              .
            </>
          )}
        </p>
      )}
      {error && (
        <div className="err" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
    </Dialog>
  );
}
