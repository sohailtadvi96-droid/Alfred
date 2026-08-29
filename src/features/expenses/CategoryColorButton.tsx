import { useRef } from 'react';
import type { Category } from './categories';
import { useUpsertCategory } from './hooks';

/** A swatch that opens the native colour picker and saves the choice. */
export function CategoryColorButton({ cat }: { cat: Category }) {
  const up = useUpsertCategory();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <span className="cat-color-wrap">
      <button
        type="button"
        className="cat-color"
        style={{ background: cat.color }}
        onClick={() => inputRef.current?.click()}
        data-tip="Change colour"
        aria-label={`Change colour for ${cat.label}`}
      />
      <input
        ref={inputRef}
        type="color"
        className="cat-color-input"
        defaultValue={cat.color}
        onChange={(e) =>
          up.mutate({
            slug: cat.slug,
            label: cat.label,
            direction: cat.direction,
            color: e.target.value,
            sort: cat.sort,
          })
        }
      />
    </span>
  );
}
