import { useState } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useFerrariShops, usePeople } from './hooks';
import { RetagConfirmDialog, type RetagTarget } from './RetagConfirmDialog';

/** Row-level "tag this payer" control — family / Ferrari toggles, keyed on VPA. */
export function VpaTagButton({ vpa, name }: { vpa: string; name: string | null }) {
  const { data: people } = usePeople();
  const { data: shops } = useFerrariShops();
  const [target, setTarget] = useState<RetagTarget | null>(null);

  const isFamily = (people ?? []).some((p) => p.vpa === vpa && p.is_family);
  const isShop = (shops ?? []).some((s) => s.vpa === vpa);

  return (
    <>
      <DM.Root>
        <DM.Trigger asChild>
          <button
            className="row-tag"
            data-tip={isFamily ? 'Family' : isShop ? 'Ferrari shop' : 'Tag payer'}
            aria-label="Tag this payer"
            data-on={isFamily || isShop ? 'true' : undefined}
          >
            @
          </button>
        </DM.Trigger>
        <DM.Portal>
          <DM.Content className="menu" align="end" sideOffset={6}>
            <DM.Label className="menu-label mono">{vpa}</DM.Label>
            <DM.Item
              className="menu-item"
              onSelect={() => setTarget({ vpa, name, kind: 'family', next: !isFamily })}
            >
              {isFamily ? 'Remove from family' : 'Add payer to family'}
            </DM.Item>
            <DM.Item
              className="menu-item"
              onSelect={() => setTarget({ vpa, name, kind: 'ferrari', next: !isShop })}
            >
              {isShop ? 'Unpin Ferrari shop' : 'Pin as Ferrari shop'}
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
      <RetagConfirmDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
