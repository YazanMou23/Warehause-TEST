# Worker menu and scenario contract

## Scope
Four languages only: German, Arabic, Turkish, Ukrainian. Worker-initiated session replies. No PDF, no new template, no Render/environment/schema change. AI's existing single-number allowlist, model, quotas and budget are unchanged.

## Scenarios
- Hours: day, exact date, current/last month, numeric/named month with year, full year, all months. Only confirmed timesheets. Full-year/all-month views group existing confirmed entries by month and retain the full-period total on each page. Missing months are not invented as zero. No records is not proof the employee did not work.
- Plans: upcoming, exact date, month/year, full year, all months. Every query remains restricted to assigned worker and nondeleted plans. Existence of a plan is not proof of work.
- Specific day: separate confirmed-hours and scheduled-plan branches. Dates are echoed in the result.
- Location/start/end/meeting details: same plan data and segments already available. Warehouse has no postal-address field, so no postal address is invented; meeting point is shown only when recorded. No co-worker roster disclosure.
- Existing shift confirmation/sickness/custom-note flow remains separate; bare refusal clarifies, first choice remains locked, later changes go to shift management.
- Explicit language/help, clarification, own-data restrictions and mutation denials remain enforced before AI.

## Menus and paging
`MENU_` opaque tokens identify server-side read-only actions. Tokens bind worker, language, explicit period/page, expire after 30 minutes and fail closed after restart. Identity is freshly resolved on every inbound click. Old menu clicks cannot become shift decisions or consume a custom follow-up note. Menu/date state is separate from pending notes. Typed 1/2/3 remains reserved for existing shift options, not list indices.
Main list: hours, shifts, specific day, language/help. Period lists include this/last month, month/year, year, all months; shifts also upcoming. Year entry accepts 2000–2100. Month picker uses two six-month pages. Invalid numeric input prompts again. Free-text questions can still skip the menu; unsupported text opens help/main menu. No English branch.
Plans fetch 11 rows to display ten and detect `Next`, with stable date/id ordering. Next re-queries with worker+period unchanged; pagination is not a database snapshot, so concurrent plan edits can shift page boundaries. Monthly hour summaries paginate ten months. No claim that page one is the whole record. Larger message bodies are sent in bounded text chunks, then navigation. Data chunks may be partially delivered on transport failure; the claim is retained to prevent contradictory automatic replays.

## Admission and delivery
Production injects `WorkerInboundLedger`. An atomic insert into the existing ActionLog primary key derived from SHA-256 of WhatsApp message ID admits each inbound once across instances/restarts. No raw message content/phone/id is persisted by this claim. Claims are not released after failures, including uncertain sends. Thus processing is at most once, not an exactly-once external delivery guarantee: a crash after claim but before reply can lose that reply. The worker can send a new request. DB failure blocks processing. No migration or production data write was performed while preparing the PR; merged/deployed code writes one ActionLog claim per accepted new inbound.
The original late duplicate remains unproven: old production logs lacked inbound message-ID/attempt correlation; memory-only dedupe could not survive a restart. No 24-minute AI queue exists in the inspected path (5-second API timeout).

## AI boundary
AI only classifies unfamiliar own-data/language phrasing into a bounded intent/period schema. YEAR/ALL are now explicit bounded period types, Arabic/Persian numerals normalize before validation. AI never supplies hours, query SQL, worker identity or assignment mutations. Production rejection callback is still not logged; no claim is made that every live failure is diagnosed.

## Session policy / introduction template design only
A worker's inbound message opens/resets the 24-hour service window. Ordinary lists are session replies, not proactive notifications. Outside it, a separately approved template is required. Proposed introduction in all four languages: write Menu anytime to ask about hours/plans. This PR neither creates/submits that template nor sends it. Repository comments about old template approval/delivery are not approval evidence or guarantees.
Sources read: https://whatsappbusiness.com/policy/ ; https://developers.cm.com/messaging/docs/whatsapp-interactive-messages ; https://docs.360dialog.com/partner/messaging/sending-and-receiving-messages/text-messages/interactive-messages

## Verification
Offline mocked storage/network tests, full suite and Nest build. No live Meta list send, real worker send, paid OpenAI call, production DB mutation, deploy or WhatsApp pixel-level check was done for this PR. Actual device layout and live list round-trip still need user-run verification after merge/deploy.
