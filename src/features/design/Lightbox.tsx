import * as RD from '@radix-ui/react-dialog';

/** Full-size image viewer for a card click — bare Radix primitives, not the
 *  chrome-heavy `Dialog` (title/footer) used for forms. Radix gives focus
 *  trap, Escape-to-close and scroll lock for free. */
export function Lightbox({
  open,
  onOpenChange,
  src,
  alt,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  src: string | undefined;
  alt: string;
  loading: boolean;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="lightbox-overlay" />
        <RD.Content
          className="lightbox-content"
          aria-describedby="lightbox-no-desc"
          onClick={() => onOpenChange(false)}
        >
          <RD.Title asChild>
            <span className="sr-only">{alt || 'Reference, full size'}</span>
          </RD.Title>
          <span id="lightbox-no-desc" hidden />
          {loading || !src ? (
            <span className="lightbox-loading">Loading…</span>
          ) : (
            <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
          )}
          <RD.Close className="lightbox-close" aria-label="Close" onClick={(e) => e.stopPropagation()}>
            ×
          </RD.Close>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
