# Worker period follow-up

No DB/schema/env changes or real WhatsApp sends. Rules-only reads scoped to the verified worker. German, Arabic, Turkish and Ukrainian only.

- Month/year prompt accepts `10.2026`, `10/2026` or `2026-10` directly, or `2026` to open a month picker. A typed `7–12` switches month pages; `11 - November` or bare month number works in month selection. Picker prompts explain what to enter instead of echoing only a year.
- Period menu offers date range / KW, previous week and previous two weeks. Plans still fit Meta's ten-row limit.
- In the hours/plans period menu or date-range prompt, `7-12` starts day-range input: ask month number, then year. Month lengths are checked after the year; impossible dates restart the month prompt. In the month picker only, `7–12` remains July-December paging, explicitly labeled as months, never days.
- Date ranges accept full DD.MM.YYYY or ISO dates separated by from/to language words or a spaced dash. Both endpoints inclusive. Reversed/invalid/extra dates clarify, never silently select one date. Ambiguous slash dates still clarify.
- `KW 44 2026` is ISO week 44: Monday 26 October through Sunday 1 November. Explicit year is required; `KW 44` asks for it. Impossible week 53, zero and conflicting KW/date inputs fail closed.
- Last week / last two weeks mean completed Monday-Sunday calendar weeks, not trailing 7/14 days or current unfinished week. Menu copy explains this and replies include exact dates.
- A week inside a month without exact dates is not guessed. The reply asks for its date endpoints or ISO KW and year.
- Hours ranges include daily sums, ten days per page with Weiter / التالي / İleri / Далі. Plans keep existing ten-row pagination. Full period total is shown on each page.
- Shift choice replies and arbitrary follow-up notes are not consumed as range entries. Hours creation/change/deletion through chat remains refused.

Tests use synthetic records. No live sends or writes were used. Live delivery and free-form language variations beyond the tested grammar remain unverified.
