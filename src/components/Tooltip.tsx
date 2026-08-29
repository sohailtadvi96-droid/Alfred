import * as RT from '@radix-ui/react-tooltip';

/** Canonical tooltip primitive. For simple labels you can also just put a
 *  `data-tip="…"` attribute on any element (styled in styles/base.css) —
 *  use this component when the trigger needs Radix behaviour (portal,
 *  collision handling, controlled state). */
export function Tooltip({
  content,
  children,
  side = 'top',
  delayDuration = 300,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: RT.TooltipContentProps['side'];
  delayDuration?: number;
}) {
  return (
    <RT.Root delayDuration={delayDuration}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={8}
          className="alfred-tooltip"
          style={{
            background: 'var(--text)',
            color: 'var(--ground)',
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: '0.02em',
            lineHeight: 1.35,
            padding: '6px 9px',
            borderRadius: 7,
            maxWidth: 220,
            boxShadow: 'var(--sh-sm)',
            zIndex: 120,
          }}
        >
          {content}
          <RT.Arrow style={{ fill: 'var(--text)' }} />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}

export const TooltipProvider = RT.Provider;
