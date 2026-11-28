# Worker PIN verification for WhatsApp self-service

## Status
Implemented on branch `feat/worker-pin-verification` (2026-11-28), PR to main, not merged.
Owner decisions were given in the WhatsApp conversation on 2026-11-28 (relayed Q131/Q132/Q137/Q138).

## Decided behavior
- Shift attendance buttons (CONFIRM/SICK/CUSTOM, incl. template buttons) work WITHOUT a PIN.
- Everything else in the worker conversation (hours/plans questions, menus, notes,
  language choice, courtesy replies, AI fallback) requires a verified session.
- First unverified message: bot asks for the 6-digit PIN (4 languages, includes a short
  privacy line) and holds the question; after a correct PIN the held question is
  processed immediately. Verified state lasts 24 hours, in-memory, lost on restart
  (fail closed, same pattern as language sessions).
- Max 3 wrong attempts per UTC day, then locked until the next UTC day. Counter in DB
  so restarts cannot reset the lockout.
- Workers without a PIN keep phone-only identity (gradual rollout; manager issues PINs
  one by one).

## PIN lifecycle
- Manager clicks "PIN" on the Employees page -> server generates a cryptographically
  random 6-digit PIN, stores only a bcrypt hash, shows the PIN exactly once.
- Handover in person only. Never sent by email or WhatsApp, never logged, never leaves
  the server after the one-time response.
- Regenerate = reset: old PIN invalid immediately, failed counter cleared.
- Forgotten PIN / new phone: manager regenerates after confirming the worker in person.

## Schema (additive)
`User.whatsappPinHash` (text, nullable), `User.whatsappPinFailedAttempts` (int, default 0),
`User.whatsappPinFailedDay` (text yyyy-mm-dd, nullable). Hand-written migration:
`prisma/migrations/20261128120000_add_worker_whatsapp_pin/migration.sql`. Owner applies
it to production (db push or migrate) after reviewing; not executed by this change.

## Implementation points
- `src/messaging/worker-pin.service.ts`: session map, held texts, hash verify, lockout.
- `src/messaging/messaging.service.ts`: gate in `processIncomingWebhookMessage` before
  menu/text handling; shift buttons bypass it; PIN replies in de/ar/tr/uk.
- `src/users/users.service.ts` + controller: `POST /employees/:id/whatsapp-pin`
  (MANAGER/ADMIN), employee records only; employee list exposes `hasWhatsappPin` only,
  never the hash.
- Frontend Employees page: PIN button per row, modal with one-time PIN display.
- The AI path keeps its own order: the gate runs before `WorkerAiService.classify`, so
  unverified attempts never reach the quota ledger or OpenAI.

## Not done / open
- No real WhatsApp round trip tested (needs owner's device after merge/deploy).
- Token columns for exact AI accounting remain optional and are NOT part of this change.
- The separate `WHATSAPP_WORKER_AI_*` activation is untouched and stays disabled.
