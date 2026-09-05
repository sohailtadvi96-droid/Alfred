import { useState } from 'react';
import { Icon } from '@/components/Icon';
import type { SearchResult } from './discover';

export function ResultCard({
  result,
  onSave,
}: {
  result: SearchResult;
  onSave: (result: SearchResult) => void;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <figure className="result-card">
      <div className="result-frame">
        {broken ? (
          <div className="item-card-broken">Preview didn’t load</div>
        ) : (
          <img
            src={result.thumb_url}
            alt={result.title ?? ''}
            loading="lazy"
            onError={() => setBroken(true)}
          />
        )}
        <div className="result-actions">
          <button
            className="btn primary sm"
            type="button"
            onClick={() => onSave(result)}
            data-tip="Save to a board"
          >
            Save
          </button>
          <a
            href={result.link_url}
            target="_blank"
            rel="noreferrer noopener"
            className="item-card-btn"
            data-tip="Open at source"
            aria-label="Open at source"
          >
            <Icon name="eye" size={13} />
          </a>
        </div>
      </div>
      <figcaption className="result-foot">
        <span className={`result-src src-${result.source}`}>{result.source}</span>
        {result.author && (
          <span className="result-author">
            {result.author_url ? (
              <a href={result.author_url} target="_blank" rel="noreferrer noopener">
                {result.author}
              </a>
            ) : (
              result.author
            )}
          </span>
        )}
        {result.license && <span className="result-lic">{result.license}</span>}
      </figcaption>
    </figure>
  );
}
