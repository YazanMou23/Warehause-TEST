# WhatsApp accuracy review (2026-11-05)

Base: main 62bf883. All checks use mocked storage and mocked outbound sends.
No live messages, production POSTs, schema migrations, data edits or setting changes.

## Fixed here

- Reject incomplete structured button targets instead of applying them to a different pending plan. Reject unknown structured actions even when the visible title looks valid. Preserve documented opaque legacy button routing.
- Apply explicit current/future calendar-month plan filters, including multilingual questions, instead of returning every upcoming plan. Include the requested month in both results and no-record replies.
- Ask for clarification when multiple full dates use different formats or slash formats, rather than silently answering for the first date.

The new regression suite has 15 tests: 12 failed on the unchanged base, one legacy-compatibility test already passed, and two characterization tests document unresolved policy behavior. All pass with this branch.

## User-approved policy follow-up (2026-11-05 14:48 CET)

- Plain `nein`, `لا`, `ні`, `hayır`/`hayir` now asks for clarification and never records sickness or changes a shift. The same protection applies to button titles/legacy plain refusal payloads.
- Existing SICK status cannot be changed through worker replies. The transaction uses an atomic `confirmationStatus != SICK` predicate and returns a contact-shift-lead reply after a blocked attempt, not a success acknowledgment. Existing absences are never deleted.
- Broader first-choice locking (CONFIRMED/CUSTOM as well as SICK) awaits clarification. CUSTOM must still allow the requested follow-up note if that policy is selected.
- Already-sent WhatsApp buttons are not visually hidden/disabled by this backend change.

The follow-up adds policy regressions and updates exact predicate expectations. Final local suite: 137 tests, 7 suites, all passing.

## Remaining source-level limitations, not production failures observed

- Plain-text actions select a unique PENDING upcoming assignment, without an outbound message-context mapping. An old text answer could select a newer plan after a restart or plan change. Changed text answers after confirmation do not target the already-confirmed assignment. Buttons with complete plan/worker IDs avoid that ambiguity.
- Plan writes use a strict timestamp guard and atomic transaction, but in-memory message-ID dedup resets on restart. Read-only conversations and acknowledgments have no durable delivery ledger. Persistent dedup/outbound correlation would need a separately approved schema/data design.
- Meta timestamps have second precision; different replies within one second are treated as equally old. Avoid loosening the guard without a tie-break/replay design.
- Relative dates and current-month defaults use UTC, not Europe/Berlin. Near local midnight/month boundaries, the intended local day/month can differ. A business-timezone choice should be explicit before changing it.
- Several outbound send results are ignored or only exceptions are caught. Provider rejection returned as `{ success: false }` does not throw. No delivery guarantee is established by a successful API acceptance.
- `GET messaging/sync-waba` is public and can trigger an account subscription write. That is outside the worker-reply patch; restrict it in a separate reviewed security change.

## Coverage and limits

Run `npm test -- --runInBand` and `npx tsc --noEmit`.
Existing tests cover signature validation, exact sender matching, cross-worker denial, ownership guards, timestamp checks, stale reply protection, transaction failure/retry, note isolation, and shared timesheet-hour source.

These are local unit/service checks. They do not establish Meta delivery, real data correctness, translated natural-language coverage, browser/UI rendering, or production behavior after deployment. The owner merges; this review does not deploy.
