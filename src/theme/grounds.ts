/** The 12 shipped ground presets. Append here to add more — the picker
 *  and ThemeProvider read this list. `id` matches the [data-ground] value
 *  and the CSS selectors in styles/tokens.css. */
export interface Ground {
  id: string;
  name: string;
  tone: 'dark' | 'light';
  /** preview + tooltip only; the real values live in tokens.css */
  ground: string;
  text: string;
  base: string;
}

export const GROUNDS: Ground[] = [
  { id: 'ink', name: 'Ink', tone: 'dark', ground: '#17150F', text: '#F1ECDD', base: '#E4C56B' },
  { id: 'slate', name: 'Slate', tone: 'dark', ground: '#16171A', text: '#ECEEF2', base: '#E0C36A' },
  { id: 'char', name: 'Char', tone: 'dark', ground: '#1A1A1A', text: '#EDEDEC', base: '#E2C368' },
  { id: 'pine', name: 'Pine', tone: 'dark', ground: '#10201A', text: '#E8F0EA', base: '#E7C873' },
  { id: 'navy', name: 'Navy', tone: 'dark', ground: '#111A2B', text: '#E9EEF6', base: '#E6C87A' },
  { id: 'dusk', name: 'Dusk', tone: 'dark', ground: '#171525', text: '#ECE9F4', base: '#E4C56B' },
  { id: 'oxblood', name: 'Oxblood', tone: 'dark', ground: '#1E1214', text: '#F2E7E6', base: '#E0B36A' },
  { id: 'espresso', name: 'Espresso', tone: 'dark', ground: '#1B1510', text: '#F0E9DD', base: '#E3C36B' },
  { id: 'parchment', name: 'Parchment', tone: 'light', ground: '#F3EDDF', text: '#2A2417', base: '#B07C24' },
  { id: 'linen', name: 'Linen', tone: 'light', ground: '#EFEEE9', text: '#24231E', base: '#9A6E2C' },
  { id: 'fog', name: 'Fog', tone: 'light', ground: '#E9E9E6', text: '#1E1F1F', base: '#9E6A28' },
  { id: 'oat', name: 'Oat', tone: 'light', ground: '#E4DBC8', text: '#262013', base: '#8A5A22' },
];

export const DEFAULT_GROUND = 'ink';
export const GROUND_STORAGE_KEY = 'alfred-ground';

export function isKnownGround(id: string | null | undefined): id is string {
  return !!id && GROUNDS.some((g) => g.id === id);
}
