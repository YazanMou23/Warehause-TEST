# Bounded worker AI: disabled scaffold

## Status and approvals
This stack is **not ready for activation**. No model calls, worker sends, DB/schema,
environment or production settings were changed by the implementation tests.
User decided 5 AI requests per worker per day. Target configurable model:
`gpt-4o-mini` (snapshot also allowlisted). Generic `OPENAI_API_KEY` is deliberately
not reused. Monthly cap: $5, approved by owner on 2026-11-05.

## Kill switch and prerequisites
- `WHATSAPP_WORKER_AI_ENABLED` must equal the string `true`, otherwise no call.
- `WHATSAPP_WORKER_AI_MODEL` must be a reviewed allowlisted model, no silent fallback.
- A separate `WHATSAPP_WORKER_AI_API_KEY` must be supplied with approval.
- The separate ledger PR registers a Postgres advisory-lock implementation. The
  owner must apply its one-table migration before activation; missing table/errors
  fail closed. This does not enable the feature.
- Never use a process-local counter for a hard cap: restarts and multiple instances
  bypass it. One-table ledger/migration preparation was approved separately on 2026-11-05; owner runs migration, production rollout still needs approval.

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
local memory. The separate ledger PR implements this with one additive table and one shared
transaction-scoped advisory lock, using the DB clock and integer microdollars.
Unit tests mock the transaction; real Postgres concurrency/restart behavior is
**not yet integration-tested**. Do not activate before that check.

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

## Ledger migration handoff
`20261105181000_add_worker_ai_usage/migration.sql` creates only `WorkerAiUsage`,
its primary key, two indexes and nonnegative/bounded cost CHECK constraints.
No ALTER/DROP, existing row changes, foreign keys or worker table modifications.
Worker reference is internal ID only, not phone/name/text. Counters use UTC calendar
day/month, with a rolling 60-second minute window. Tell the owner this accounting
timezone before activation; change to Berlin boundaries if requested. No automatic
cleanup: deleting current-period rows would reset quotas. A retention policy is
still pending. Advisory lock ID 71052026 must be reserved for this ledger.

No migration command was executed against Neon or any connected database.
`prisma validate` and `prisma generate` operate on the local schema/client only.
Owner applies migration after reviewing SQL, then tests concurrent reservations in
a disposable DB before activation. Rollback: disable feature first; do not drop the
ledger during an active accounting period.

## Single WhatsApp test sender gate
`WHATSAPP_WORKER_AI_TEST_PHONE` must contain exactly one explicitly approved
international number (optional +/visual spacing); unset/empty/invalid = nobody.
The webhook checks it only for AI fallback. Other workers still get existing
rules/help. No suffix matches, wildcards, list or inferred German prefix.
The number is used locally for gating, never sent to OpenAI. Existing verified
worker identity is still required. `WHATSAPP_WORKER_AI_ENABLED` stays OFF by
default and must also be true to call the API. A gate alone never enables it.
No number is hardcoded, and no Render value was changed by this PR. Obtain the
specific test number from the user before configuring. Internal synthetic test
harness calls are not WhatsApp messages and are independently scoped/approved.
