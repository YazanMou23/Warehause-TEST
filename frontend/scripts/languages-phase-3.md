# Phase 3 language foundation

User-facing interface languages: German (`de`), Arabic (`ar`), Turkish (`tr`), Ukrainian (`uk`). German is the initial and invalid/legacy-value fallback. The preference is stored only in this browser's localStorage. It is not a server/account preference and does not affect WhatsApp conversation language.

Arabic sets `<html lang="ar" dir="rtl">`, mirrors the navigation drawer and desktop offset, uses Arabic-capable system fonts and logical positions. Times, identifiers and dates retain unambiguous numeric order. No database migration or data rewrite is involved.

Covered: shared navigation/catalog and dialogs, language selectors, login/reset, profile, worker dashboard/hours/QR scanner, Documents capture/queue copy, and admin planning/shift responses. User-provided names, notes, filenames and server-provided errors are not rewritten or translated. English OCR document-language selection remains available as an input-processing option, not an English interface.

Not yet translated end-to-end: employees/admins, attendance, timesheets, warehouses/halls/containers/container lists, chat and reports. They use translated shared labels but retain page-specific hardcoded copy. Legal policy pages and exported CSV headers are not translated by this change. Do not describe this foundation as complete app translation.

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
