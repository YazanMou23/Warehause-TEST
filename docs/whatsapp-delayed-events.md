# Late-event reply guard

This change rejects first-seen inbound events older than five minutes without a reply or shift write. Durable message-ID admission already blocks the same ID across restarts, but cannot recognize a distinct ID or unrecorded first delivery as a duplicate. Five minutes is a deliberate freshness bound, not proof that Meta never delays messages. A worker whose first delivery is too old must send a new request.

Unknown/expired/restarted menu tokens now produce no reply. In particular, a restart cannot turn a delayed language-neutral old menu click into a fresh default-German menu. Valid live tokens retain their bound language. Explicit fresh Arabic/German/Turkish/Ukrainian Menu messages still work.

Admitted-event logs include fixed event kind, SHA-256 ID prefix and age in seconds, not message body, worker name, raw message-ID, plan-ID or phone. No new database fields/tables, settings or production changes.

Evidence for the reported incident: own-worker ActionLog contained distinct admission hashes at 21:28:03 and 21:39:46 Berlin; Render showed process startup at 21:37:54 and recipient status sent/delivered at 21:39:49. This establishes new admissions, not that the user tapped at those times. Old logs did not retain inbound event age/type/context, so delayed delivery versus another source remains unproven. No independent timer sends these menu/locked-choice responses in the reviewed path.

Offline tests cover delayed text/button delivery, expired/unknown token silence, live Arabic token language and fresh menu after restart. No real WhatsApp message was sent for verification.
