import * as RD from '@radix-ui/react-dialog';
import { Icon } from '@/components/Icon';
import { hostOf } from './tags';
import type { DesignItem } from './types';

/** Full-size image viewer for a card click — bare Radix primitives, not the
 *  chrome-heavy `Dialog` (title/footer) used for forms. Radix gives focus
 *  trap, Escape-to-close and scroll lock for free. Shows the full, uncropped
 *  image (never the grid's aspect-clamped rendition) alongside the item's
 *  caption/tags/source and a link out to the original page. */
export function Lightbox({
  open,
  onOpenChange,
  item,
  src,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: DesignItem;
  src: string | undefined;
  loading: boolean;
}) {
  const href = item.link_url ?? item.image_url ?? undefined;
  const source = item.source ?? hostOf(item.link_url ?? item.image_url ?? '');
  const hasMeta = item.title || item.caption || source || item.tags.length > 0;

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="lightbox-overlay" />
        <RD.Content
          className="lightbox-content"
          aria-describedby="lightbox-desc"
          onClick={() => onOpenChange(false)}
        >
          <RD.Title asChild>
            <span className="sr-only">{item.title || 'Reference, full size'}</span>
          </RD.Title>
          <span id="lightbox-desc" hidden>
            {item.caption ?? ''}
          </span>
          {loading || !src ? (
            <span className="lightbox-loading">Loading…</span>
          ) : (
            <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
              <img
                src={src}
                alt={item.title ?? ''}
                width={item.width ?? undefined}
                height={item.height ?? undefined}
              />
              {hasMeta && (
                <div className="lightbox-meta">
                  {item.title && <span className="lightbox-title">{item.title}</span>}
                  {item.caption && <p className="lightbox-caption">{item.caption}</p>}
                  {(source || item.tags.length > 0) && (
                    <div className="lightbox-foot">
                      {source && <span className="lightbox-src">{source}</span>}
                      {item.tags.map((t) => (
                        <span key={t} className="lightbox-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer noopener" className="lightbox-link">
                      <Icon name="eye" size={12} />
                      Open original
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
          <RD.Close className="lightbox-close" aria-label="Close" onClick={(e) => e.stopPropagation()}>
            ×
          </RD.Close>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
