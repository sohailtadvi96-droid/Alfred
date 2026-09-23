import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Minimal anchored popover — a trigger plus a panel that closes on an
 *  outside click or Escape. Hand-rolled because @radix-ui/react-popover isn't
 *  a dependency, and a portal-less panel keeps the Design tokens in scope. */
export function DesignPopover({
  label,
  align = 'right',
  panelClassName,
  renderTrigger,
  children,
}: {
  label: string;
  align?: 'left' | 'right';
  panelClassName?: string;
  renderTrigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="design-popover" ref={root}>
      {renderTrigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={`design-popover-panel align-${align}${panelClassName ? ` ${panelClassName}` : ''}`}
          role="dialog"
          aria-label={label}
        >
          {children}
        </div>
      )}
    </div>
  );
}
