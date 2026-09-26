/** Which categories may be offered as a resolved payee's default category.
 *
 *  Not transfers (those have their own "Me" path), and not `my_ferrari`: that
 *  category is gated by the entity's `is_ferrari` flag — small payments (≤ ₹220)
 *  on the ₹20 grid only — but a `default_category` is applied at any amount, so
 *  offering it here would quietly drop the gate. Tag the payee as a Ferrari shop
 *  (the retag flow) instead. */
export function isEntityDefaultCategory(c: { kind: string; slug: string }): boolean {
  return c.kind !== 'transfer' && c.slug !== 'my_ferrari';
}
