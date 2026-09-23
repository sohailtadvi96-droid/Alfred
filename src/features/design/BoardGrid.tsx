import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import type { BoardWithCover } from './types';

/** Compact board row at the bottom of the page: a 2×2 mosaic of the board's
 *  four most recent items (BoardWithCover.covers is already newest-first),
 *  name and reference count, then a dashed "New board" tile the same size. */
export function BoardGrid({
  boards,
  onEdit,
  onNew,
}: {
  boards: BoardWithCover[];
  onEdit: (board: BoardWithCover) => void;
  onNew: () => void;
}) {
  return (
    <div className="board-row">
      {boards.map((b) => (
        <div className="board-tile" key={b.id}>
          <Link
            to={`/design/${b.id}`}
            className="board-tile-link"
            aria-label={`Open board: ${b.name}, ${b.itemCount} ${b.itemCount === 1 ? 'reference' : 'references'}`}
          >
            <div className="board-tile-mosaic">
              {b.covers.length === 0 ? (
                <span className="board-tile-empty">
                  <Icon name="design" size={22} />
                </span>
              ) : (
                b.covers.slice(0, 4).map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)
              )}
            </div>
            <span className="board-tile-name">{b.name}</span>
            <span className="board-tile-count">
              {b.itemCount} {b.itemCount === 1 ? 'reference' : 'references'}
            </span>
          </Link>
          <button
            className="board-tile-edit"
            type="button"
            onClick={() => onEdit(b)}
            aria-label={`Edit ${b.name}`}
          >
            <Icon name="pencil" size={12} />
          </button>
        </div>
      ))}
      <div className="board-tile">
        <button type="button" className="board-tile-new" onClick={onNew} aria-label="Create a new board">
          <div className="board-tile-mosaic">
            <span className="board-tile-plus">+</span>
          </div>
          <span className="board-tile-name">New board</span>
        </button>
      </div>
    </div>
  );
}
