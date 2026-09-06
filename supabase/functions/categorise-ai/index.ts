// categorise-ai — last-resort classifier for the ~0.1% of transactions the
// rule engine leaves at low confidence (04a-BUILD-BRIEF Task 5). One batched
// Claude call per run, strict JSON out. The caller writes every answer into
// merchant_rules, so a merchant is never sent here twice.
//
//   supabase functions deploy categorise-ai
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Called from the app via supabase.functions.invoke('categorise-ai', {
//   body: { items: AiItem[] }
// }). JWT-verified: only a signed-in ALFRED session can reach it.

import { corsHeaders } from '../_shared/cors.ts';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_ITEMS = 40;

/** Categories the model may choose. Structural ones (salary, bank charges,
 *  cash withdrawal, card-unclassified) are the engine's job, not the model's. */
const CATEGORIES = [
  'rent_household', 'dineout_stays', 'food_delivery', 'grocery', 'alcohol',
  'my_ferrari', 'daily_spends', 'local_merchant', 'cab_transport', 'ticket_booking',
  'online_shopping', 'subscriptions', 'work_software', 'bills_recharge',
  'health_personal', 'entertainment', 'fuel', 'person_transactions',
  'money_received', 'family', 'uncategorised',
];
const CATEGORY_SET = new Set(CATEGORIES);

interface AiItem {
  key: string;
  merchant?: string;
  counterparty?: string;
  vpa?: string;
  remark?: string;
  channel?: string;
  amount?: number;
  direction?: 'debit' | 'credit';
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SYSTEM = `You categorise Indian UPI / bank transactions for a personal expense tracker.
Reply with ONLY a JSON array, one object per input item, no prose, no code fences:
[{"key": "<the item's key>", "category": "<one slug below>", "merchant": "<short clean name>"}]

Allowed category slugs:
${CATEGORIES.join(', ')}

Guidance:
- Decide from the merchant / counterparty / remark. VPA shape hints at a shop.
- Debit to a shop under ~₹300 with no clear brand → daily_spends; larger → local_merchant.
- Debit to a personal name that isn't a shop → person_transactions. Credit from one → money_received.
- Only use "uncategorised" when there is genuinely no signal.
- "merchant" is a tidy display name (e.g. "Baba Restaurant"), not the raw narration.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'not configured' }, 503);

  let payload: { items?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const items = Array.isArray(payload.items) ? (payload.items as AiItem[]).slice(0, MAX_ITEMS) : [];
  if (!items.length) return json({ answers: [] });

  const compact = items.map((it) => ({
    key: it.key,
    merchant: it.merchant ?? '',
    counterparty: it.counterparty ?? '',
    vpa: it.vpa ?? '',
    remark: it.remark ?? '',
    channel: it.channel ?? '',
    amount: it.amount ?? 0,
    direction: it.direction ?? 'debit',
  }));

  let resp: Response;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2400,
        system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(compact) }],
      }),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'request failed' }, 502);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return json({ error: `anthropic ${resp.status}`, detail: detail.slice(0, 500) }, 502);
  }

  const body = await resp.json();
  const text: string = (body?.content ?? [])
    .filter((b: { type?: string }) => b.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('')
    .trim();

  const parsed = extractJsonArray(text);
  if (!parsed) return json({ error: 'model did not return JSON', raw: text.slice(0, 500) }, 502);

  const answers = parsed
    .map((a) => ({
      key: String(a?.key ?? ''),
      category: String(a?.category ?? ''),
      merchant: typeof a?.merchant === 'string' ? a.merchant.slice(0, 60) : '',
    }))
    .filter((a) => a.key && CATEGORY_SET.has(a.category));

  return json({ answers, model: MODEL });
});

/** Pull the first JSON array out of the model text, tolerating stray fences. */
function extractJsonArray(text: string): Array<Record<string, unknown>> | null {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const val = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(val) ? val : null;
  } catch {
    return null;
  }
}
