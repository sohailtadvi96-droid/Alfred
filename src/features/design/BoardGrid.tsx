import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import type { BoardWithCover } from './types';

export function BoardGrid({
  boards,
  onEdit,
}: {
  boards: BoardWithCover[];
  onEdit: (board: BoardWithCover) => void;
}) {
  return (
    <div className="board-grid">
      {boards.map((b) => (
        <div className="board-card" key={b.id}>
          <Link to={`/design/${b.id}`} className="board-card-link">
            <div className={`board-cover n${Math.min(b.covers.length, 4)}`}>
              {b.covers.length === 0 ? (
                <span className="board-cover-empty">
                  <Icon name="design" size={22} />
                </span>
              ) : (
                b.covers.map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)
              )}
            </div>
            <div className="board-card-meta">
              <span className="board-card-name">{b.name}</span>
              <span className="board-card-count">
                {b.itemCount} {b.itemCount === 1 ? 'ref' : 'refs'}
              </span>
            </div>
            {b.description && <p className="board-card-desc">{b.description}</p>}
          </Link>
          <button
            className="board-card-edit"
            type="button"
            onClick={() => onEdit(b)}
            data-tip="Edit board"
            aria-label={`Edit ${b.name}`}
          >
            <Icon name="pencil" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
