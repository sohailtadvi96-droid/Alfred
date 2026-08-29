import * as DM from '@radix-ui/react-dropdown-menu';
import { categoriesFor, categoryLabel } from './categories';
import { useRecategorise } from './hooks';
import type { Transaction } from './types';

export function RecategoriseMenu({ txn }: { txn: Transaction }) {
  const recat = useRecategorise();
  const options = categoriesFor(txn.direction);
  const merchant = txn.merchant_raw?.trim();

  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className={`tag as-button cat-${txn.category}`} data-tip="Recategorise">
          <i />
          {categoryLabel(txn.category)}
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="menu" align="start" sideOffset={6}>
          <DM.Label className="menu-label">Set category</DM.Label>
          {options.map((c) => (
            <DM.Item
              key={c.id}
              className="menu-item"
              onSelect={() => recat.mutate({ txn, category: c.id, makeRule: false })}
            >
              {c.label}
              {c.id === txn.category && <span className="menu-check">✓</span>}
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
                        key={c.id}
                        className="menu-item"
                        onSelect={() => recat.mutate({ txn, category: c.id, makeRule: true })}
                      >
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
