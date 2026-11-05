# Registered hours: one ledger

Attendance is the only registered-hours ledger. Direct/manual entries and clock/QR shifts write there. OCR drafts remain TimesheetEntry evidence until confirmation posts Attendance rows atomically. There is no read fallback to OCR and no reverse synchronization by first matching day.

## Views and edits

- Worker WhatsApp, employee dashboard, attendance reports, daily overview and confirmed weekly PDF/XLSX read Attendance stored totalHours, using the recorded work date. An active clock is shown separately; elapsed unfinished time is not added to registered totals.
- Confirmed weekly sheets show the employee's entire current registered week, including manual shifts and later edits/deletions. Two source sheets for the same worker/week therefore show the same weekly ledger; never sum weekly sheet cards as independent sources. These exports are current registered views, not immutable copies of the original OCR evidence.
- Draft sheet views show draft OCR values; draft exports are rejected. Posted headers cannot be moved or reassigned via the sheet header. Registered rows use Attendance IDs. Changes/deletion operate on those IDs only; a deleted row cannot return by reconfirming old OCR.
- OCR confirmation uses an atomic PENDING_REVIEW status claim. A second/repeated confirmation is rejected. Source entries, user creation (when requested), ledger rows and confirmation audit are in the same transaction. A draft unexpectedly containing posted rows is rejected for reconciliation, not silently cleared.
- Direct edits use the same service. Confirmed sheet row dates must remain inside that week; use attendance editing to move work dates. Location edits that need a hall selection use the attendance editor.
- Multiple shifts on one date are valid. Weekly grids sum all shifts. Editing a multi-shift cell is blocked, directing the manager to individual daily records rather than overwriting one shift with the day's sum.
- Successful mutations reload their view. Attendance, daily and weekly sheet pages also reload on window focus. There is no cross-device push or continuous polling guarantee.

## Dates and time

Work dates are UTC-midnight calendar keys. Clock and manual inputs use Europe/Berlin instants; ambiguous/nonexistent DST wall times are rejected, not guessed. Legacy SCAN timestamps retain their existing UTC wall-clock storage/display convention without rewriting old records. Overnight shifts are supported. Stored registered totalHours is authoritative, including deliberate manual overrides.

## No migration or cleanup

No schema change, migration, backfill, production data write, deletion, backup branch or service-setting change is included. Existing discrepancies are not repaired: old source rows without Attendance no longer count, and manual Attendance now counts consistently. Existing historical MANUAL clock timestamps may already have inconsistent timezone encoding; this PR does not rewrite or certify them. Test-data cleanup and a fresh Neon backup require separate approval.

## Verification

Offline service tests cover manual add/edit/delete; registered sheet edit/delete; draft isolation; OCR once-only posting; competing confirmation claim; clock/QR; worker isolation; transaction rollback; missing location; invalid values; overnight/DST. Each mutation compares registered totals across report, dashboard, WhatsApp, weekly views and parsed XLSX.

Run `npm test -- --runInBand`, `npm run build`, `cd frontend && npm run build`, and `node frontend/scripts/test-registered-hours.cjs`. Local browser checks use synthetic intercepted responses, never real account writes. PDF output is visually inspected with synthetic rows. A real Postgres concurrency/rollback test, deployed UI smoke test and real WhatsApp round trip remain unverified and must not be claimed complete.
