# Bounded worker AI: disabled scaffold

## Status and approvals
This PR is **not ready for activation**. No model calls, worker sends, DB/schema,
environment or production settings were changed by the implementation tests.
User decided 5 AI requests per worker per day. Target configurable model:
`gpt-4o-mini` (snapshot also allowlisted). Generic `OPENAI_API_KEY` is deliberately
not reused. Monthly cap: $5, approved by owner on 2026-11-05.

## Kill switch and prerequisites
- `WHATSAPP_WORKER_AI_ENABLED` must equal the string `true`, otherwise no call.
- `WHATSAPP_WORKER_AI_MODEL` must be a reviewed allowlisted model, no silent fallback.
- A separate `WHATSAPP_WORKER_AI_API_KEY` must be supplied with approval.
- An injected shared **durable WorkerAiLedger is required**. No implementation is
  registered. Even enabling the flag alone results in zero requests.
- Never use a process-local counter for a hard cap: restarts and multiple instances
  bypass it. Ledger persistence preparation was approved separately on 2026-11-05; production rollout still needs approval.

## Ledger design for review, not a schema change
Propose an atomic reservation ledger keyed by internal worker + UTC accounting
day/minute and global UTC calendar month, with request ID, reserved spend in integer
microdollars and final cost. Before network IO lock/check global budget and worker
counters in one transaction: max 5/day, 2/minute, and reserve worst-case request cost
against $5/month. Count attempts on errors. On unknown network outcomes keep reserved
cost; reconcile conservatively later. Budget must not reset on restart. Reject on DB
failure. Avoid full employee text or phone in the ledger. Retention, deletion, indexes,
transaction isolation and migration will be proposed before any DB work.
Alternative: approved shared Redis with persistence and atomic scripts, not volatile
local memory. This PR only defines the interface, so durable quota/concurrency
behavior is **not implemented or proven yet**.

## Routing and privacy
Existing deterministic read-only rules, denials, explicit language, refusal, CUSTOM
note capture and shift options run before the AI fallback. AI cannot mutate anything;
its only output is a strict schema for HOURS/PLANS/LANGUAGE/UNKNOWN. Server validates
field allowlists, dates and presence of explicit years. Canonical queries re-enter
existing identity verification, worker scoping and timesheet source.

Only sanitized question + language/reference date reach the API, never query results,
worker ID, other people’s records, phone or full conversation. Known names, email,
long numbers and UUIDs are redacted. This is not a complete PII detector. Privacy
review and synthetic rollout are required before any real worker text is allowed.
Input <=1000 characters, output <=200 tokens, 5s timeout, no retries, store:false.
Refusals, HTTP errors, missing usage, invalid dates/schema or quota refusal fall back
locally. Unknown billing outcomes retain reservation. Generic raw worker text logging
was removed from the text entry path; older action logs for shift notes are unchanged.

## Tests and remaining work
All network responses are mocks with synthetic data. Tests check default-off, missing
ledger, model output validation, HTTP/timeout fallback, privacy redaction, routing
order, duplicate webhook and own-data query handoff. The 80 schema variants and
80 multilingual input variants are **not** a measured multilingual accuracy score.
Live model evaluation, translation review, privacy review, durable caps, concurrency
and restart tests remain prerequisites. No external call or quota claim is inferred
from successful unit tests.

## Current official references (checked 2026-11-05)
- https://developers.openai.com/api/docs/models/gpt-4o-mini
  Structured Outputs supported. Standard input $0.15/M, output $0.60/M tokens.
  Price table in code is scoped to this allowlist; revalidate before activation.
- https://developers.openai.com/api/docs/guides/structured-outputs
  Schema adherence does not establish semantic truth.
- https://developers.openai.com/api/docs/guides/your-data
  store:false does not remove default abuse-monitoring retention.

## Rollout
Merge order #12 -> #13 -> #14 -> this PR, retargeting to main after each preceding
merge. User merges. Do not enable merely because these PRs are merged. Obtain approval
for storage/migration and settings, then test caps with synthetic data. Notify owner
before first paid synthetic request; never send real worker data during these tests.
