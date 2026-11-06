# Phase 3 language foundation

User-facing interface languages: German (`de`), Arabic (`ar`), Turkish (`tr`), Ukrainian (`uk`). German is the initial and invalid/legacy-value fallback. The preference is stored only in this browser's localStorage. It is not a server/account preference and does not affect WhatsApp conversation language.

Arabic sets `<html lang="ar" dir="rtl">`, mirrors the navigation drawer and desktop offset, uses Arabic-capable system fonts and logical positions. Times, identifiers and dates retain unambiguous numeric order. No database migration or data rewrite is involved.

Covered: shared navigation/catalog and dialogs, language selectors, login/reset, profile, worker dashboard/hours/QR scanner, Documents capture/queue copy, admin planning/shift responses, employees/admins, and work-hours visibility controls. User-provided names, notes, filenames and server-provided errors are not rewritten or translated. English OCR document-language selection remains available as an input-processing option, not an English interface.

Not yet translated end-to-end: warehouses/halls/containers/container lists, chat and reports. They use translated shared labels but retain page-specific hardcoded copy. Legal policy pages and exported CSV headers are not translated by this change. Do not describe this foundation as complete app translation.

## Verify

Build first, with Playwright available via NODE_PATH and Chrome installed (or CHROME_PATH set):

```sh
cd frontend
npm run build
node scripts/check-language-catalogs.cjs
LANGUAGES=ar,tr NODE_PATH=/path/to/node_modules DESIGN_OUTPUT=/tmp/language-evidence node scripts/languages-phase-3.cjs
LANGUAGES=de,uk NODE_PATH=/path/to/node_modules DESIGN_OUTPUT=/tmp/language-evidence node scripts/languages-phase-3.cjs
```

The runner uses synthetic API responses and blocks non-GET external requests. Each language runs at 320, 390, 820, 1440px. It checks worker dashboard, hours dialog, QR camera error, Documents/upload, login, four selector options, Arabic direction and persistence across reload. It samples leaf text contrast >=4.5:1 and document overflow. It does not certify all accessibility states or exercise live saves, uploads, camera/scanner hardware or server errors. Reduced-motion mode avoids capturing transient fade frames. Browser locale is German, while app text/date display follows the selected language.

`languages-phase-3-edges.cjs` additionally checks populated worker history tabs, the Arabic/Ukrainian mobile drawer, profile and invalid reset link, plus German fallback for a saved `en` value. It also blocks writes and uses synthetic data.

## Planning batch

Planning editor and shift confirmation list now use the four-language catalog, including absence dialogs, error/success copy, status filters and webhook help. Canonical German preset/reason values and time parsing remain unchanged for API compatibility; only display labels are translated. Existing user-entered locations/reasons and outbound message templates are not rewritten based on interface language.

`planning-languages-phase-3.cjs` captures each language at four widths: initial editor, lower editor, selected employee/night preset, absence modal, populated confirmation list and manual status modal. It verifies canonical preset values and blocks live writes/sends. Editor tables can scroll horizontally inside their own containers on phones. No save, delete, send, API payload or webhook setting is changed by this batch.

Planning runner commands use `scripts/planning-languages-phase-3.cjs` with the same LANGUAGES, NODE_PATH, CHROME_PATH and DESIGN_OUTPUT environment settings as above. The final batch produced 96 screenshots (six states, four languages, four widths).


## Employees/admins batch

Employee and admin lists, add/edit forms, email-composer chrome, import preview chrome, confirmation dialogs, pagination, sorting and visibility controls use the four-language catalog. Role codes, API payload keys, CSV columns and print/export templates remain unchanged. User names, contact values and server-returned diagnostics stay in their original form. Email/WhatsApp message content is never translated or sent automatically.

Run `scripts/staff-languages-phase-3.cjs` with the same environment settings. It captures employee/admin lists, both add/edit forms and employee visibility modal, four languages at four widths (112 screenshots). It verifies the mailto recipient and canonical employee role controls. All external writes are blocked. Import upload/execution, real saves, emails and visibility mutations are not exercised; no claim of live save/import verification. Admin tables retain internal horizontal scrolling on narrow screens.

## Cooler shared background

Shared canvas is now #F1F5F9, white cards and #F8FAFC pale surfaces. Login and the dashboard shell use the shared background token instead of their earlier hardcoded backgrounds. Navy/gold accents remain unchanged. Dashboard calendar labels and initials were darkened after the populated contrast check. Checked dashboard/planning/worker/Documents/login at 390 and 1440px with synthetic fixtures; sampled leaf text passes 4.5:1. This is not a full accessibility certification.

## Attendance batch

Attendance daily/weekly/monthly views, filters, month/weekday labels, edit dialog and result/error copy use four-language labels. Registered time calculations, source/status values, API payloads and download targets are unchanged. User-entered absence reasons and backend errors retain their original language. `attendance-languages-phase-3.cjs` checks 80 screenshots (five states, four languages, four widths), with synthetic records and blocked writes. It does not submit saves, deletes or exports. The time picker UI itself follows browser/OS conventions, while stored values remain HH:mm.

## Timesheets batch

Timesheet scanner/upload, OCR review labels, list/daily views, manual-entry dialog, progress/result labels and error fallbacks use the four-language catalog. Display weekday/month/week labels are localized independently from canonical German weekday values used for editable entry state/API compatibility. Timesheets now lets the shared cool background show through. User-entered names, locations, OCR warnings and raw backend diagnostics remain as received.

`timesheets-languages-phase-3.cjs` captures seven states at four widths in four languages (112 screenshots). The OCR call is intercepted and supplied synthetic data; it never reaches a service. All other non-GET calls are blocked. Real uploads, confirmation, edits, employee creation and exports are not exercised. Wide review/list details retain horizontal scrolling; native date/time input formatting follows browser/OS settings. Completion/progress wording is localized in source but not every queue/error branch is visually exercised.

## Inventory batch

Warehouses, halls, containers and container lists use the four-language catalogs, including create/edit dialogs, saved-list inspection and main review editor, color presets and QR dialog/print wording. API enums, IDs, source values, customer template names and exported document conventions remain unchanged. Dates shown in lists follow the selected locale. User content and server-supplied diagnostics remain as received. Default generated list titles and German decimal/export summaries remain canonical rather than changing stored or customer-template data.

`inventory-languages-phase-3.cjs` covers the warehouse grid/detail/create, hall list/create/edit/QR, container list/create/edit/history, and container-list upload/saved/detail/edit/main review states at 320, 390, 820 and 1440 widths. All API data is synthetic, with non-GET requests blocked. No create/update/delete/confirmation/export/print action is submitted to a live service. Wider tables intentionally scroll inside their panels. Browser-native dates follow browser/OS input settings. Low-contrast labels, table headings and action buttons were darkened; palette controls wrap on narrow screens.

## Chat batch

Chat search, empty/loading states, role labels, input, blocked/waiting notices, block/unblock confirmation and error wording use the four-language catalog. Message content is never translated or changed. API actions, polling interval and send restrictions are unchanged. RTL uses logical borders/padding and bubble corners. Shared custom-alert badges now use the selected language and warning/success action colors have stronger contrast.

`chat-languages-phase-3.cjs` captures list, history and block-confirmation states at four widths in four languages (48 screenshots). All requests use synthetic fixtures and external non-GET requests are blocked. No message is sent and no block is confirmed. Worker blocked/waiting wording is translated in source but those branches are not exercised in this visual runner.

## Reports batch

Timesheet reports and activity logs use the selected language, including months, roles, known action labels, filters, date/time display, hour units, pagination and print-only labels. IDs, action filter values, attendance calculations, the existing 160-hour display target and APIs remain unchanged. Unknown action identifiers and log detail text remain as received.

`reports-languages-phase-3.cjs` checks timesheet and activity screens at four widths/four languages plus desktop print-media previews (36 screenshots). Text contrast/overflow checks pass with synthetic data. No external write or print dialog is triggered. Wide reports/log tables scroll inside cards. Print-media preview is not a physical/PDF pagination test.
