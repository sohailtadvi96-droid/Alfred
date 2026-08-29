/** Woodcut icon set — solid fills, one hard offset shadow applied by the
 *  consumer via CSS `filter: var(--cut)` where wanted. */
const PATHS: Record<string, string> = {
  expenses:
    'M4 5h13l3 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 6v2h9v-2H6Zm0 4v2h6v-2H6Z',
  secrets:
    'M9 3a6 6 0 0 1 5.65 8H21l1.5 1.5L21 15l-2-1.5L17 15l-2-1.5-.6.4A6 6 0 1 1 9 3Zm-1.5 5A1.5 1.5 0 1 0 6 6.5 1.5 1.5 0 0 0 7.5 8Z',
  work:
    'M9 3h6l1 3h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4l1-3Zm3 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  design: 'M4 4h16v13H4z M2 19h20v2H2z M8 8l4 6 3-4 3 5H6z',
  invest: 'M4 18h3v-6H4zM10 18h3V6h-3zM16 18h3v-9h-3z',
  health: 'M12 21S3 14.5 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 14.5 12 21 12 21Z',
  settings:
    'M12 2c1 0 2 1 2 2l3 1 1 3 2 2-1 3 1 3-3 1-1 3-3 1-2 2-2-2-3-1-1-3-3-1 1-3-1-3 3-1 1-3 3-1c0-1 1-2 2-2Zm0 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  eye: 'M12 5c6 0 10 7 10 7s-4 7-10 7S2 12 2 12s4-7 10-7Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  chevron: 'M9 6l6 6-6 6',
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={name === 'chevron' ? 'none' : 'currentColor'}
      stroke={name === 'chevron' ? 'currentColor' : undefined}
      strokeWidth={name === 'chevron' ? 2.4 : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
