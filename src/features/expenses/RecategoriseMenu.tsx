import * as DM from '@radix-ui/react-dropdown-menu';
import { useCategories, useRecategorise } from './hooks';
import type { Transaction } from './types';

export function RecategoriseMenu({ txn }: { txn: Transaction }) {
  const recat = useRecategorise();
  const cats = useCategories();
  const options = cats.forDirection(txn.direction);
  const merchant = txn.merchant_raw?.trim();
  const current = cats.get(txn.category, txn.direction);

  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button
          className="tag as-button"
          data-tip="Recategorise"
          style={
            current
              ? { borderColor: current.color, color: current.color }
              : undefined
          }
        >
          <i style={current ? { background: current.color } : undefined} />
          {cats.label(txn.category, txn.direction)}
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
