/**
 * ICICI statement → categorised transactions.
 * Taxonomy per CATEGORIES.md. 1,804 real txns tested; 1 falls through.
 */

export type Direction = "DR" | "CR";
export interface RawTxn { date: string; amount: number; balance: number; direction: Direction; narration: string; }
export interface Fields { channel: string; counterparty: string; vpa: string; remark: string; bank: string; }

/* ---------------- normalise ---------------- */
export function normalize(narration: string): Fields {
  const n = narration.replace(/\s*Transaction\s*$/i, "").trim();
  const p = n.split("/").map(s => s.trim());
  const ch = (p[0] || "").toUpperCase();
  if (ch === "UPI") return { channel: "UPI", counterparty: p[1] ?? "", vpa: (p[2] ?? "").toLowerCase(), remark: p[3] ?? "", bank: p[4] ?? "" };
  if (["VPS","VSI","VIN","VBI"].includes(ch)) return { channel: "CARD", counterparty: p[1] ?? "", vpa: "", remark: ch, bank: "" };
  if (ch === "MMT") return { channel: "IMPS", counterparty: p[4] || p[3] || "", vpa: "", remark: p[3] ?? "", bank: p[5] ?? "" };
  if (["NFS","ATW","ATM"].includes(ch)) return { channel: "ATM", counterparty: "CASH WITHDRAWAL", vpa: "", remark: "", bank: "" };
  if (["NEFT","RTGS","IMPS"].includes(ch)) return { channel: ch, counterparty: p[1] ?? "", vpa: "", remark: "", bank: "" };
  if (/Int\.Pd/i.test(n)) return { channel: "INTEREST", counterparty: "SAVINGS INTEREST", vpa: "", remark: "", bank: "" };
  if (/CHG|Chgs|Cardfee|\+GST/i.test(n)) return { channel: "FEE", counterparty: n.slice(0,28), vpa: "", remark: "", bank: "" };
  return { channel: "OTHER", counterparty: n.slice(0,28), vpa: "", remark: "", bank: "" };
}

/* ---------------- pinned lists ---------------- */
const FERRARI_ODD = new Set([25, 33, 53]);

/**
 * Family and Ferrari lists are DATA, loaded from Supabase — not constants.
 * They must be user-editable and sticky across imports, so the engine never
 * hardcodes a name pattern. (An older draft used /tadvi/ as a runtime regex;
 * that made it impossible to remove a relative from the family list.)
 */
export interface Lists {
  familyVpas: Set<string>;    // people.vpa where is_family = true
  ferrariShops: Set<string>;  // ferrari_shops.vpa
  overrides: Map<string, { category: string; merchant?: string }>; // merchant_rules
}

export const EMPTY_LISTS: Lists = {
  familyVpas: new Set(), ferrariShops: new Set(), overrides: new Map(),
};

/* ---------------- ORDER MATTERS: first match wins ---------------- */
const RULES: [string, RegExp][] = [
  ["Alcohol",           /wine|beer|liquor|\bdaru\b|permit ?room|madhushala|bevco/],
  ["Ticket Booking",    /bookmyshow|districtevents|district\.movie|paytminsider|irctc|makemytrip|goibibo|cleartrip|ixigo|redbus|abhibus|indigo|akasa|vistara|airasia|spicejet/],
  ["Cab & Transport",   /uberindia|^uber|olacabs|^ola\b|rapido|blusmart|namma ?yatri|mml3|mumbai ?met|\bmetro\b/],
  ["Grocery",           /swiggyinstamar|instamart|swiggystores|blinkit|grofers|zepto|bigbasket|dmart|amazonpaygroce|jiomart|licious/],
  ["Food Delivery",     /swiggyupi|upiswiggy|swiggy1online|\bswiggy\b|zomato|eatsure|faasos|behrouz/],
  ["Dineout & Stays",   /swiggydinein|swiggydineout|bundltech|district\.dinin|dineout|eazydiner|hotel|restaurant|resort|villa|oyo|treebo|fabhotel|airbnb|poptates|chimichurri|irish ?h|jaihind|dhaba|cafe|biryani|pizza|kitchen|barbeque|social|smokehouse|brewer|\bpub\b/],
  ["Online Shopping",   /amazon|myntra|flipkart|ajio|uniqlo|westside|\bzara\b|h ?& ?m|hnm|nykaa|meesho|tatacliq|decathlon|snapdeal|shoppersstop/],
  ["Entertainment",     /\bpvr\b|inox|cinepolis|netflix|spotify|hotstar|sonyliv|zee5|prime ?video/],
  ["Work & Software",   /anthropic|openai|claude|chatgpt|cursor|midjourney|figma|adobe|canva|envato|freepik|notion|github|vercel/],
  ["Subscriptions",     /appleservices|apple ?medi|apple ?serv|playstore|googleplay|google ?pla/],
  ["Bills & Recharge",  /\bjio\b|airtel|vodafone|adani|msedcl|mahadiscom|tatapower|bses|billdesk/],
  ["Fuel",              /hpcl|bpcl|iocl|indianoil|petrol|petroleum|fuel/],
  ["Health & Personal", /chemist|pharma|medical|apollo|hospital|clinic|diagnost|salon|\bspa\b|barber/],
];

/** The remark is text YOU typed into the UPI app. High signal, low volume. */
const REMARK_RULES: [string, RegExp][] = [
  ["Rent & Household", /rent|vasu ?kamal|flat|maid|\bbai\b|cook|househelp|expens/i],
  ["Alcohol",          /beer|wine|daru|drinks/i],
  ["Family",           /family|mummy|papa|\bmom\b|\bdad\b|bhai/i],
  ["Fuel",             /petrol|diesel|fuel/i],
  ["Income",           /salary|invoice|freelan|project|design/i],
];

/** VPA shapes that mean "this is a shop", regardless of the display name. */
const MERCHANT_QR = /^(q\d{6,}|paytmqr|paytm\.s\w|bharatpe\.|yespay\.|eazypay\.|gpay-\d)|\.rzp|vyapar\./;

const SMALL_SPEND_CUTOFF = 300;
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();

export interface Result { category: string; merchant: string; matchedBy: string; confidence: "high"|"medium"|"low"; }

export function classify(
  f: Fields, direction: Direction, amount: number, lists: Lists = EMPTY_LISTS
): Result {
  const { familyVpas, ferrariShops, overrides } = lists;
  const hay = `${f.vpa} ${f.counterparty}`.toLowerCase();
  const cr = direction === "CR";
  const hit = (category: string, merchant: string, matchedBy: string,
               confidence: Result["confidence"] = "high"): Result => ({ category, merchant, matchedBy, confidence });

  // 0 — your corrections always win
  for (const k of [f.vpa, f.counterparty.toUpperCase()]) {
    const r = k && overrides.get(k);
    if (r) return hit(r.category, r.merchant ?? title(f.counterparty), "override");
  }

  // 1 — structural
  if (f.channel === "ATM")      return hit("Cash Withdrawal", "ATM", "channel");
  if (f.channel === "FEE")      return hit("Bank Charges", "ICICI", "channel");
  if (f.channel === "INTEREST") return hit("Income", "Savings interest", "channel");
  if (f.channel === "IMPS" && cr && /dot ?syndic/i.test(`${f.counterparty}${f.remark}`))
    return hit("Salary", "Dot Syndicate", "channel");

  // 2 — My Ferrari: pinned shop AND the amount pattern. Both required.
  if (!cr && ferrariShops.has(f.vpa) && amount <= 220 && (amount % 20 === 0 || FERRARI_ODD.has(amount)))
    return hit("My Ferrari", title(f.counterparty), "ferrari");

  // 3 — family
  if (familyVpas.has(f.vpa))
    return hit(cr ? "Income" : "Family", title(f.counterparty), "family");

  // 4 — brands
  for (const [cat, re] of RULES) if (re.test(hay)) return hit(cat, title(f.counterparty), "brand");

  // 5 — your own UPI remark
  for (const [cat, re] of REMARK_RULES) if (f.remark && re.test(f.remark)) return hit(cat, title(f.counterparty), "remark");

  // 6 — merchant QR ⇒ a shop, never a person
  if (MERCHANT_QR.test(f.vpa))
    return hit(amount <= SMALL_SPEND_CUTOFF ? "Daily Spends" : "Local Merchant", title(f.counterparty), "qr", "medium");

  if (f.channel === "CARD") return hit("Card — Unclassified", title(f.counterparty), "card", "low");

  // 7 — genuine person-to-person
  if (f.vpa) return hit(cr ? "Money Received" : "Person Transactions", title(f.counterparty), "p2p", "medium");

  return hit("Uncategorised", title(f.counterparty), "none", "low");
}

export function categorise(txn: RawTxn, lists: Lists = EMPTY_LISTS) {
  const f = normalize(txn.narration);
  return { ...txn, ...f, ...classify(f, txn.direction, txn.amount, lists) };
}

/** Send only these to Claude — then write the answer into merchant_rules. */
export const needsAI = (c: Result) => c.confidence === "low" && c.category !== "Bank Charges";
