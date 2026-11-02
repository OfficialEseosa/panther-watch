# AI assistant: budget, spend and models

The chat at the top of `/assistant` (signed-in users only) is PantherWatch Assistant: Claude, called through the Anthropic API by `POST /api/assistant/chat` (`web/src/app/api/assistant/chat/route.ts`, logic in `web/src/lib/assistant/`). It uses the same tools as the MCP connector (`web/src/lib/tools/registry.ts`). The server stores no conversation, only the per-day usage counters below.

## Turning it on and off

- **On:** set `ANTHROPIC_API_KEY` in Vercel (Production) and redeploy. Migration `0004_assistant.sql` (`assistant_usage`, `assistant_daily`) must be applied first.
- **Off:** delete `ANTHROPIC_API_KEY` (or set it blank) and redeploy. The route answers 503 `disabled`, `/assistant` shows "The assistant isn't available right now. You can still connect your own assistant below.", and nothing else on the site changes. The MCP connector is unaffected.
- Env changes apply only to new deployments (Deployments → ⋯ → Redeploy).

## How the budget works

Three layers, cheapest first (`web/src/lib/assistant/budget.ts`):

1. **In memory, per serverless instance** (best effort): one turn in flight per user, and at most 10 turns a minute per user. Refusals are 429 `rate`.
2. **Daily message caps in Postgres:** `ASSISTANT_USER_DAILY_MESSAGES` (default 40) per user and `ASSISTANT_GLOBAL_DAILY_MESSAGES` (default 800) site-wide. A message is reserved in one transaction **before** the model is called, so concurrent requests can't both slip under a cap. If the model never answered (Anthropic rate-limited or unreachable on the first request, no output), the message is given back.
3. **Daily spend cap:** `ASSISTANT_GLOBAL_DAILY_USD` (default 3) site-wide. After each turn, the tokens Anthropic reports are priced with the table in `web/src/lib/assistant/pricing.ts` and added to `cost_micro_usd`. New messages are refused once today's cost reaches the cap. Spend is recorded after the turn, so turns already in flight can overshoot it by their own cost.

Every cap counts America/New_York calendar days (the `day` column) and **resets at midnight Eastern**.

Per message, the cost is also bounded in `web/src/lib/assistant/chat.ts`: 2,048 output tokens per model request, at most 6 tool rounds (so at most 7 model requests per message), tool results cut at 40,000 characters, and the route accepts at most 30 messages / 24,000 characters of history. The system prompt and tool definitions are prompt-cached.

**Syllabus summaries** (`get_syllabus_summary`, from the chat or the MCP connector; `web/src/lib/course-meta/syllabus-summary.ts`): one Claude Haiku 5.5 call per new or changed syllabus text, about $0.0013 for a 6-page syllabus (≈5,900 input / 1,450 output tokens, measured 2026-11-02), capped at 4,000 output tokens. Each call is added to today's `assistant_daily` row (tokens and `cost_micro_usd`, `messages` unchanged), so it counts toward `ASSISTANT_GLOBAL_DAILY_USD` but not toward anyone's message count; at the cap, or without `ANTHROPIC_API_KEY`, no summary is generated (stored ones are still served). Summaries are cached in `syllabus_summaries` (migration `0006_syllabus_summaries.sql`), keyed by PDF URL with the extracted text's SHA-256: every call re-reads the PDF and reuses the summary only while the hash matches. To force a fresh summary, `DELETE FROM syllabus_summaries WHERE url = '<pdf url>';`.

`cost_micro_usd` is an estimate (millionths of a dollar, priced at record time). The Anthropic Console's usage and billing pages are the real bill; a monthly spend limit on the Anthropic organization is a sensible backstop.

## Checking spend

Run in Supabase Dashboard → SQL Editor (production) or `psql`:

```sql
-- Site-wide, last 7 Eastern days
SELECT day,
       messages,
       round(cost_micro_usd / 1e6, 4)                                AS cost_usd,
       round(cost_micro_usd / 1e6 / nullif(messages, 0), 5)          AS usd_per_message,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
FROM assistant_daily
WHERE day > (now() AT TIME ZONE 'America/New_York')::date - 7
ORDER BY day DESC;

-- Heaviest users today
SELECT u.email, a.messages, round(a.cost_micro_usd / 1e6, 4) AS cost_usd
FROM assistant_usage a
JOIN users u ON u.id = a.user_id
WHERE a.day = (now() AT TIME ZONE 'America/New_York')::date
ORDER BY a.cost_micro_usd DESC
LIMIT 20;

-- Total for the current month
SELECT sum(messages) AS messages, round(sum(cost_micro_usd) / 1e6, 2) AS cost_usd
FROM assistant_daily
WHERE day >= date_trunc('month', now() AT TIME ZONE 'America/New_York')::date;
```

`assistant_usage` rows are deleted with the user (`ON DELETE CASCADE`); `assistant_daily` has no user link.

## Switching models

Set `ASSISTANT_MODEL` and redeploy. Only these values are accepted, because only they are priced in `pricing.ts`:

| `ASSISTANT_MODEL` | Rough cost per message | Notes |
|---|---|---|
| `claude-haiku-5-5` (default) | ≈ $0.001 (measured) | Runs at effort `medium`. 800 messages ≈ $0.80, so the message caps bind long before the $3 spend cap. |
| `claude-sonnet-5-5` | ≈ $0.02 (measured) | Runs at effort `low`, with Anthropic's server-side refusal fallback. $3 buys about 150 messages a day, so the spend cap binds before the 800-message cap. |
| `claude-opus-5-5` | not measured; its token prices are 2× Sonnet's | Same settings as Sonnet. |

**Any other value fails env validation, and that breaks every request that reads env (the whole site), not just the chat.** Check the spelling before you redeploy. When you change the model, revisit `ASSISTANT_GLOBAL_DAILY_USD` (and the per-user cap) for the new cost per message. If Anthropic's prices change, update `PRICES` in `pricing.ts`; a model missing from that table is priced at its most expensive row.

## Raising or lowering caps

Set `ASSISTANT_USER_DAILY_MESSAGES`, `ASSISTANT_GLOBAL_DAILY_MESSAGES` or `ASSISTANT_GLOBAL_DAILY_USD` in Vercel and redeploy. Blank means the default. The new values apply to the new deployment right away; today's counters stay, so lowering a cap below today's count refuses further messages at once. Setting a cap to `0` refuses everyone, but users then see a "daily limit" message; to switch the feature off, delete the API key instead.

To give one user more messages today without changing the cap:

```sql
UPDATE assistant_usage SET messages = 0
WHERE user_id = (SELECT id FROM users WHERE email = '<email>')
  AND day = (now() AT TIME ZONE 'America/New_York')::date;
```

Their open tab keeps showing "You've used today's messages" until they sign out and back in or open a new tab (see below).

## What users see

- **10 or fewer left:** "N messages left today" under the message box.
- **Their own cap:** the reply shows "You've used all of today's assistant messages. They reset at midnight Eastern time." and the message box is disabled ("You've used today's messages. Come back tomorrow.").
- **Site-wide message or spend cap:** the reply shows "The assistant has reached its daily limit for everyone. It resets at midnight Eastern time." The message box is disabled with the same "You've used today's messages" note, because the page treats any budget refusal as zero messages left.
- **Too fast:** "You're sending messages too quickly. Try again in about N seconds." or "Your previous message is still being answered…", with a retry.
- **Anthropic busy or down:** "The assistant is busy right now. Try again in a minute." or "The assistant couldn't reach its AI service. Try again in a moment.", with a retry; the message is not counted when nothing was answered.
- **Key unset:** the "isn't available right now" card.

The "zero messages left" state is kept in the tab's sessionStorage with the conversation, and the page doesn't re-read it from the server (New chat keeps it). A tab that hit a cap therefore stays blocked after midnight until the user signs out or opens a new tab.

## Logs

The route logs only failures, without message content: `assistant: model request failed` (HTTP status and error name), `assistant: budget reservation failed`, `assistant: recording usage failed`, `assistant: turn failed`. Hobby keeps runtime logs for an hour; use the SQL above for history.
