import type { Snapshot } from './types';

/** Static, non-live tiles for modules with no backend yet. Illustrative
 *  numbers only — see the Home Build Spec mockup. No `actions` — there's no
 *  real page to link to yet. */
export const PLACEHOLDER_SNAPSHOTS: Snapshot[] = [
  {
    module: 'invest',
    title: 'Invest',
    icon: 'invest',
    live: false,
    href: '#',
    stats: [{ label: 'Portfolio value', value: '₹5,64,393' }],
    moreStats: [{ label: 'All time', value: '▲ 12.4%' }],
    detail: 'SIP · 12 Sep',
  },
  {
    module: 'health',
    title: 'Health',
    icon: 'health',
    live: false,
    href: '#',
    stats: [{ label: 'Steps today', value: '7,240' }],
    moreStats: [{ label: 'Sleep', value: '6h 30m' }],
    detail: null,
  },
  {
    module: 'travel',
    title: 'Travel',
    icon: 'travel',
    live: false,
    href: '#',
    stats: [{ label: 'Upcoming trips', value: '3' }],
    moreStats: [{ label: 'Next trip', value: '12 Oct' }],
    detail: 'Bali, Indonesia · 12 Oct 2026',
  },
];
