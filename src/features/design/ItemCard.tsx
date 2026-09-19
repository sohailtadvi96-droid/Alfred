import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useOriginalUrl } from './hooks';
import { Lightbox } from './Lightbox';
import { hostOf } from './tags';
import type { DesignItem } from './types';

// Card aspect ratio (width/height) is floored at 1:2.1 so one extremely
// tall image can't dominate a masonry column — excess height is cropped
// off, top-anchored (see item-card-img-sized in base.css). Only the tall
// side is capped, Pinterest-style: a landscape or square image renders at
// its natural ratio uncropped, same as before.
const MIN_RATIO = 1 / 2.1;

export function ItemCard({
  item,
  thumbUrl,
  onEdit,
  onDelete,
  onTagClick,
  onRetry,
  retrying,
}: {
  item: DesignItem;
  /** Batched, transformed signed URL for item.thumb_path — undefined while
   *  the batch is still loading, not just when there's no thumb yet. */
  thumbUrl: string | undefined;
  onEdit: (item: DesignItem) => void;
  onDelete: (item: DesignItem) => void;
  onTagClick: (tag: string) => void;
  onRetry: (item: DesignItem) => void;
  retrying: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const href = item.link_url ?? item.image_url ?? undefined;
  const source = item.source ?? hostOf(item.link_url ?? item.image_url ?? '');

  const isPending = item.enrich_status === 'pending' || item.enrich_status === 'running';
  const isFailed = item.enrich_status === 'failed';
  // thumbUrl (cached, transformed) first; the raw still — poster_url for
  // video, image_url for everything else — while the batch is still loading
  // or for a pre-pipeline / manually-added row that never gets a thumb_path.
  const displaySrc = thumbUrl ?? item.image_url ?? item.poster_url ?? null;

  // The lightbox's "original size" — thumb_path's cache holds the real
  // original (unresized, see docs/DESIGN.md), so this is a fresh
  // untransformed signed URL, never the grid's resized thumbUrl. No
  // thumb_path (a manual save, or a row still pending) just means the only
  // "original" that ever existed is the external image_url/poster_url.
  const { data: originalUrl, isFetching: originalLoading } = useOriginalUrl(
    item.thumb_path,
    lightboxOpen,
  );
  const lightboxSrc = item.thumb_path ? originalUrl : (item.image_url ?? item.poster_url ?? undefined);

  const rawRatio = item.width && item.height ? item.width / item.height : null;
  const clampedRatio = rawRatio === null ? null : Math.max(rawRatio, MIN_RATIO);
  const imgStyle = clampedRatio !== null ? ({ '--item-ratio': clampedRatio } as React.CSSProperties) : undefined;

  return (
    <figure className="item-card">
      <div className="item-card-frame">
        {isPending ? (
          <div className="item-card-shimmer" aria-label="Processing…" />
        ) : isFailed ? (
          <div className="item-card-state item-card-failed">
            <span>Couldn’t process this reference</span>
            {item.enrich_error && <span className="item-card-state-detail">{item.enrich_error}</span>}
            <button
              type="button"
              className="btn sec sm"
              onClick={() => onRetry(item)}
              disabled={retrying}
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : broken || !displaySrc ? (
          <div className="item-card-state item-card-broken">
            <Icon name="design" size={20} />
            <span>No image</span>
          </div>
        ) : (
          <img
            src={displaySrc}
            alt={item.title ?? ''}
            loading="lazy"
            className={clampedRatio !== null ? 'item-card-img-sized' : undefined}
            style={imgStyle}
            onError={() => setBroken(true)}
            onClick={() => setLightboxOpen(true)}
          />
        )}
        <div className="item-card-actions">
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="item-card-btn"
            data-tip="Open source"
            aria-label="Open source in a new tab"
          >
            <Icon name="eye" size={13} />
          </a>
          <button
            className="item-card-btn"
            type="button"
            onClick={() => onEdit(item)}
            data-tip="Edit"
            aria-label="Edit reference"
          >
            <Icon name="pencil" size={13} />
          </button>
          <button
            className="item-card-btn"
            type="button"
            onClick={() => onDelete(item)}
            data-tip="Remove"
            aria-label="Remove reference"
          >
            ×
          </button>
        </div>
      </div>

      {(item.title || source || item.note || item.tags.length > 0) && (
        <figcaption className="item-card-body">
          {item.title && <span className="item-card-title">{item.title}</span>}
          {item.note && <p className="item-card-note">{item.note}</p>}
          <div className="item-card-foot">
            {source && <span className="item-card-src">{source}</span>}
            {item.tags.map((t) => (
              <button
                key={t}
                type="button"
                className="tag as-button"
                onClick={() => onTagClick(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </figcaption>
      )}

      <Lightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        item={item}
        src={lightboxSrc}
        loading={originalLoading && !originalUrl}
      />
    </figure>
  );
}
