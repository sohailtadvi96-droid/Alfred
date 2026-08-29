/** Pick a readable ink colour (near-black or near-parchment) for text on `hex`. */
export function readableInk(hex: string): string {
  const h = hex.replace('#', '').trim();
  if (h.length < 6) return '#1c1a15';
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.42 ? '#1c1a15' : '#f4f0e6';
}

export const CATEGORY_PALETTE = [
  '#BC6250',
  '#D6994F',
  '#8D9E79',
  '#7E97AB',
  '#BF8B84',
  '#93839F',
  '#6E9B5F',
  '#6E8CA8',
  '#C08E5A',
  '#A9736B',
];
