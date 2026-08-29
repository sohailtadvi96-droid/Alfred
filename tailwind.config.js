/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: 'var(--ground)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        text: 'var(--text)',
        'text-dim': 'var(--text-dim)',
        'text-faint': 'var(--text-faint)',
        base: 'var(--base)',
        'base-ink': 'var(--base-ink)',
        pos: 'var(--pos)',
        neg: 'var(--neg)',
        wip: 'var(--wip)',
        'c-rust': 'var(--c-rust)',
        'c-ochre': 'var(--c-ochre)',
        'c-sage': 'var(--c-sage)',
        'c-slate': 'var(--c-slate)',
        'c-clay': 'var(--c-clay)',
        'c-plum': 'var(--c-plum)',
      },
      fontFamily: {
        sans: ['Archivo', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['"Spline Sans Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xs: '6px',
        sm: '10px',
        DEFAULT: '15px',
        lg: '22px',
      },
      boxShadow: {
        card: 'var(--sh)',
        'card-sm': 'var(--sh-sm)',
      },
    },
  },
  plugins: [],
};
