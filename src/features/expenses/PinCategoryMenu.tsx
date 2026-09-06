import * as DM from '@radix-ui/react-dropdown-menu';
import type { Direction } from './categories';
import { useCategories, usePinMerchant } from './hooks';

/** Category picker that writes a merchant_rules pin (engine Tier 0) and
 *  re-categorises every matching transaction. Keyed on VPA when present. */
export function PinCategoryMenu({
  direction,
  category,
  vpa,
  counterparty,
  merchant,
}: {
  direction: Direction;
  category: string;
  vpa: string | null;
  counterparty: string | null;
  merchant: string | null;
}) {
  const pin = usePinMerchant();
  const cats = useCategories();
  const options = cats.forDirection(direction);
  const current = cats.get(category, direction);

  const matchType: 'vpa' | 'counterparty' = vpa ? 'vpa' : 'counterparty';
  const matchValue = (vpa ?? counterparty ?? '').trim();
  const label = cats.label(category, direction);

  if (!matchValue) return <span className="tag">{label}</span>;

  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button
          className="tag as-button"
          data-tip={`Pin ${matchType === 'vpa' ? matchValue : 'this payee'}`}
          style={current ? { borderColor: current.color, color: current.color } : undefined}
          disabled={pin.isPending}
        >
          <i style={current ? { background: current.color } : undefined} />
          {pin.isPending ? 'Pinning…' : label}
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="menu" align="start" sideOffset={6}>
          <DM.Label className="menu-label">Pin “{merchant || matchValue}” as…</DM.Label>
          {options.map((c) => (
            <DM.Item
              key={c.slug}
              className="menu-item"
              onSelect={() =>
                pin.mutate({ matchType, matchValue, categorySlug: c.slug, merchant })
              }
            >
              <span className="menu-dot" style={{ background: c.color }} />
              {c.label}
              {c.slug === category && <span className="menu-check">✓</span>}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
