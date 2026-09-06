/**
 * The engine `Lists` as seeded by supabase/migrations/0013_categorize_engine.sql.
 * Kept in sync with that file by hand — it is the same data the app loads from
 * Supabase at import time (people / ferrari_shops / merchant_rules).
 */

import type { Lists } from '../src/features/expenses/categorize.ts';

export const FAMILY_VPAS = [
  'tadvianjum73@o',
  'jahangir.tadvi',
  'shounaktadvi-1',
  'nayanatadvi196',
  'sahil.tadvi@bo',
];

export const FERRARI_SHOPS = [
  'paytm.s20l53x@', 'q959268521@ybl', 'q699301324@ybl', 'q352469970@ybl',
  'paytmqr6w0av5@', 'paytm.s28e4p0@', 'paytm.s24gzy8@', 'q844291349@ybl',
  'paytmqr5d3v1o@', 'yespay.bizs.bi', 'paytmqr70j253@', 'gpay-121967272',
  'q132663479@ybl', 'q215059646@ybl', 'paytmqrtv8ktii', 'q042303250@ybl',
  'q110287100@ybl', 'paytmqr6tecnd@',
];

/** Empty at seed time — matches migration 0013 and the fixture (no `override`
 *  rows). merchant_rules fills from the review queue (Task 4). */
export const MERCHANT_RULES: Array<{ key: string; category: string; merchant: string }> = [];

export function seedLists(): Lists {
  return {
    familyVpas: new Set(FAMILY_VPAS),
    ferrariShops: new Set(FERRARI_SHOPS),
    overrides: new Map(MERCHANT_RULES.map((r) => [r.key, { category: r.category, merchant: r.merchant }])),
  };
}
