# categorise-ai

Last-resort classifier for the handful of transactions the rule engine
(`src/features/expenses/categorize.ts`) leaves at **low confidence** — BUILD
BRIEF Task 5. The engine resolves ~99.9% on its own; this is the tail.

One batched Claude call per run (Haiku 4.5), strict-JSON out. The app calls it
with `supabase.functions.invoke('categorise-ai', { body: { items } })` —
JWT-verified, so only a signed-in ALFRED session can reach it. The caller
(`api.runAiFallback`) writes every answer into `merchant_rules` as a Tier-0 pin,
so a merchant is never sent here twice and the fix re-categorises every matching
row.

## Deploy

```bash
supabase functions deploy categorise-ai
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # console.anthropic.com → API Keys
```

What the review-queue "Ask AI to sort" button shows when a call fails:

| Status | Cause | UI |
|---|---|---|
| 404 | Function never deployed (gateway, not this code) | `categorise-ai returned 404: …` |
| 401 | JWT rejected by the gateway | `categorise-ai returned 401: …` |
| 503 | Deployed, `ANTHROPIC_API_KEY` not set — `{ error: 'not configured' }` | Friendly "isn't set up" hint |
| 502 | Anthropic call failed — `{ error: 'anthropic <status>', detail }` | `categorise-ai returned 502: anthropic 400 — <Anthropic's message>` |

Only the 503 case gets the setup hint; everything else shows the HTTP status
and response body. A 502 with `anthropic 401` is a bad key, and `anthropic 400`
reading "credit balance is too low" means the key is fine but the Anthropic
account needs credits. Nothing else in Expenses depends on this function.

## Request / response

```jsonc
// POST body — up to 40 items, more are dropped
{ "items": [
  { "key": "q123456@ybl", "merchant": "", "counterparty": "SOME SHOP",
    "vpa": "q123456@ybl", "remark": "UPI/...", "channel": "UPI",
    "amount": 240, "direction": "debit" }
] }

// 200
{ "answers": [
    { "key": "q123456@ybl", "category": "daily_spends", "merchant": "Some Shop" }
  ],
  "model": "claude-haiku-4-5-20251001" }
```

`category` is validated against the engine's non-structural slug allow-list
(`CATEGORIES` in `index.ts`); anything else is dropped. Structural categories
(salary, bank charges, cash withdrawal, card-unclassified) are the engine's job,
not the model's.

## Model

`claude-haiku-4-5-20251001`, `anthropic-version: 2023-06-01`, `max_tokens: 2400`.
