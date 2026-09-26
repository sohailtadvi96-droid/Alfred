import * as DM from '@radix-ui/react-dropdown-menu';
import { errMessage } from '@/lib/errors';
import { useCategories, usePinMerchant, useRecategorise } from './hooks';
import type { Transaction } from './types';

export function RecategoriseMenu({ txn }: { txn: Transaction }) {
  const recat = useRecategorise();
  const pin = usePinMerchant();
  const cats = useCategories();
  const options = cats.forDirection(txn.direction);
  const merchant = txn.merchant_display?.trim();
  const current = cats.get(txn.category, txn.direction);

  // The payee's merchant_rules pin — keyed like pinMerchant / PinCategoryMenu do:
  // the VPA when the row has one, else the counterparty name. Writing it again
  // for an already-pinned payee replaces that pin, which is how a wrong pin is
  // corrected after the payee has left the review queue.
  const vpa = txn.vpa_prefix?.trim() || null;
  const matchType: 'vpa' | 'counterparty' = vpa ? 'vpa' : 'counterparty';
  const matchValue = vpa ?? txn.counterparty?.trim() ?? '';

  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button
          className="tag as-button"
          data-tip={pin.isError ? errMessage(pin.error, 'Could not pin.') : 'Recategorise'}
          disabled={pin.isPending}
          style={
            current
              ? { borderColor: current.color, color: current.color }
              : undefined
          }
        >
          <i style={current ? { background: current.color } : undefined} />
          {pin.isPending ? 'Pinning…' : pin.isError ? 'Pin failed — retry' : cats.label(txn.category, txn.direction)}
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="menu" align="start" sideOffset={6}>
          <DM.Label className="menu-label">Set category</DM.Label>
          {options.map((c) => (
            <DM.Item
              key={c.slug}
              className="menu-item"
              onSelect={() => recat.mutate({ txn, category: c.slug, makeRule: false })}
            >
              <span className="menu-dot" style={{ background: c.color }} />
              {c.label}
              {c.slug === txn.category && <span className="menu-check">✓</span>}
            </DM.Item>
          ))}

          {matchValue && (
            <>
              <DM.Separator className="menu-sep" />
              <DM.Sub>
                <DM.SubTrigger className="menu-item">
                  Pin {matchType === 'vpa' ? 'this VPA' : `“${matchValue}”`} as… <span className="menu-arrow">›</span>
                </DM.SubTrigger>
                <DM.Portal>
                  <DM.SubContent className="menu" sideOffset={4}>
                    <DM.Label className="menu-label">Kept when categories are re-run</DM.Label>
                    {options.map((c) => (
                      <DM.Item
                        key={c.slug}
                        className="menu-item"
                        onSelect={() =>
                          pin.mutate({
                            matchType,
                            matchValue,
                            categorySlug: c.slug,
                            merchant: txn.merchant_display,
                          })
                        }
                      >
                        <span className="menu-dot" style={{ background: c.color }} />
                        {c.label}
                        {c.slug === txn.category && <span className="menu-check">✓</span>}
                      </DM.Item>
                    ))}
                  </DM.SubContent>
                </DM.Portal>
              </DM.Sub>
            </>
          )}

          {merchant && (
            <>
              <DM.Separator className="menu-sep" />
              <DM.Sub>
                <DM.SubTrigger className="menu-item">
                  Always “{merchant}” as… <span className="menu-arrow">›</span>
                </DM.SubTrigger>
                <DM.Portal>
                  <DM.SubContent className="menu" sideOffset={4}>
                    {options.map((c) => (
                      <DM.Item
                        key={c.slug}
                        className="menu-item"
                        onSelect={() => recat.mutate({ txn, category: c.slug, makeRule: true })}
                      >
                        <span className="menu-dot" style={{ background: c.color }} />
                        {c.label}
                      </DM.Item>
                    ))}
                  </DM.SubContent>
                </DM.Portal>
              </DM.Sub>
            </>
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
