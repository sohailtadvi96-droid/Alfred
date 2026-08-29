import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_GEN, generatePassword, strength, type GenOptions } from './generate';

const STRENGTH_LABEL = ['—', 'weak', 'fair', 'good', 'strong'];

export function PasswordGenerator({ onUse }: { onUse: (pw: string) => void }) {
  const [opts, setOpts] = useState<GenOptions>(DEFAULT_GEN);
  const [pw, setPw] = useState('');

  const roll = useCallback(() => setPw(generatePassword(opts)), [opts]);

  useEffect(() => {
    roll();
  }, [roll]);

  const set = <K extends keyof GenOptions>(k: K, v: GenOptions[K]) =>
    setOpts((o) => ({ ...o, [k]: v }));

  const toggle = (k: 'lower' | 'upper' | 'digits' | 'symbols') => {
    setOpts((o) => {
      const next = { ...o, [k]: !o[k] };
      if (!next.lower && !next.upper && !next.digits && !next.symbols) return o; // keep ≥1
      return next;
    });
  };

  const s = strength(pw);

  return (
    <div className="gen">
      <div className="gen-out">
        <code className="mono">{pw || '—'}</code>
        <button type="button" className="row-x" onClick={roll} data-tip="Regenerate" aria-label="Regenerate">
          ↻
        </button>
      </div>

      <div className={`gen-meter s${s}`} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="gen-meter-label">{STRENGTH_LABEL[s]}</div>

      <label className="gen-len">
        <span>Length</span>
        <input
          type="range"
          min={8}
          max={64}
          value={opts.length}
          onChange={(e) => set('length', Number(e.target.value))}
        />
        <b className="mono">{opts.length}</b>
      </label>

      <div className="gen-classes">
        {(['lower', 'upper', 'digits', 'symbols'] as const).map((k) => (
          <label key={k} className="gen-check">
            <input type="checkbox" checked={opts[k]} onChange={() => toggle(k)} />
            <span>{k === 'digits' ? '0-9' : k === 'symbols' ? '!@#' : k === 'lower' ? 'a-z' : 'A-Z'}</span>
          </label>
        ))}
      </div>

      <button type="button" className="btn sec sm" disabled={!pw} onClick={() => onUse(pw)}>
        Use this password
      </button>
    </div>
  );
}
