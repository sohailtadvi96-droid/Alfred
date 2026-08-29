import { GROUNDS } from '@/theme/grounds';
import { useTheme } from '@/theme/ThemeProvider';

export function GroundPicker() {
  const { ground, setGround } = useTheme();

  return (
    <div className="groundgrid" role="radiogroup" aria-label="Background">
      {GROUNDS.map((g) => (
        <button
          key={g.id}
          type="button"
          className="gt"
          role="radio"
          aria-checked={ground === g.id}
          aria-pressed={ground === g.id}
          data-tip={`Ground ${g.ground} · Text ${g.text} · Accent ${g.base}`}
          onClick={() => setGround(g.id)}
        >
          <span className="gt-prev" style={{ background: g.ground, color: g.text }}>
            Aa
            <i style={{ background: g.base }} />
          </span>
          <span className="gt-nm">{g.name}</span>
        </button>
      ))}
    </div>
  );
}
