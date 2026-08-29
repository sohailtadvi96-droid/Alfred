import * as RD from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="dlg-overlay" />
        <RD.Content className="dlg" aria-describedby={description ? undefined : 'dlg-no-desc'}>
          <div className="dlg-h">
            <RD.Title asChild>
              <h3>{title}</h3>
            </RD.Title>
            <div className="dlg-rule" />
            {description ? (
              <RD.Description className="dlg-desc">{description}</RD.Description>
            ) : (
              <span id="dlg-no-desc" hidden />
            )}
          </div>
          <div className="dlg-b">{children}</div>
          {footer && <div className="dlg-f">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export const DialogClose = RD.Close;
