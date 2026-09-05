import { useState } from 'react';
import { Icon } from '@/components/Icon';
import type { DesignItem } from './types';

export function ItemCard({
  item,
  onEdit,
  onDelete,
  onTagClick,
}: {
  item: DesignItem;
  onEdit: (item: DesignItem) => void;
  onDelete: (item: DesignItem) => void;
  onTagClick: (tag: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const href = item.link_url ?? item.image_url;

  return (
    <figure className="item-card">
      <div className="item-card-frame">
        {broken ? (
          <div className="item-card-broken">Image didn’t load</div>
        ) : (
          <img
            src={item.image_url}
            alt={item.title ?? ''}
            loading="lazy"
            onError={() => setBroken(true)}
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

      {(item.title || item.source || item.note || item.tags.length > 0) && (
        <figcaption className="item-card-body">
          {item.title && <span className="item-card-title">{item.title}</span>}
          {item.note && <p className="item-card-note">{item.note}</p>}
          <div className="item-card-foot">
            {item.source && <span className="item-card-src">{item.source}</span>}
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
    </figure>
  );
}
