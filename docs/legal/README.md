# Rechtliche Unterlagen für die Vermietung von LogiFlow / Warehause (Entwurf)

Stand: 2026-11-06. **Entwurf, keine Rechtsberatung.** Vor dem ersten Kunden von einer
Rechtsanwältin / einem Rechtsanwalt oder Datenschutzberater prüfen lassen.

## Dateien
- `avv-vorlage.md` - Auftragsverarbeitungsvertrag nach Art. 28 DSGVO (Vorlage, Kunde = Verantwortlicher, Anbieter = Auftragsverarbeiter)
- `unterauftragsverarbeiter.md` - Liste der Dienstleister, Stand aus dem Code
- `datenschutzerklaerung-kunden-vorlage.md` - Textbausteine, die der Kunde (Verantwortlicher) für seine Mitarbeitenden verwenden kann
- Seiten in der App: `/impressum`, `/datenschutz`, `/datenloeschung`

## Was aus dem Code belegt ist
- Daten: Name, Telefonnummer, optional E-Mail, Adresse, Treffpunkt, Profilfoto, Rolle, Telegram-ID (Feld), Passwort-Hash, Beschäftigungsbeginn/-ende (`prisma/schema.prisma`, Modell `User`).
- Arbeitszeiten: Ein-/Ausstempeln, Pausen, Stundenzettel mit Einträgen (`Attendance`, `Timesheet`).
- Interne Chatnachrichten (`ChatMessage`), Abwesenheiten (`EmployeeAbsence`), Einsatzpläne, Aktionsprotokoll (`ActionLog`).
- Hochgeladene Dokumente und Scans (`UniversalDocument`), Dateien liegen im Verzeichnis `uploads/` des Servers.
- WhatsApp über Meta Graph API (`src/messaging/messaging.service.ts`); UltraMsg als Rückfall, nur wenn `ULTRAMSG_*` gesetzt ist.
- E-Mail über Resend (`src/email/email.service.ts`).
- OpenAI-API: Stundenzettel-OCR (`gpt-4o`), Dokument-OCR und -Analyse, Containerlisten-Extraktion (`src/timesheet`, `src/documents`, `src/container-lists`).
- Worker-KI für WhatsApp-Fragen (`src/messaging/worker-ai.service.ts`): im Code abgeschaltet, nur mit `WHATSAPP_WORKER_AI_ENABLED=true`. Laut Repo-Dokumentation (`docs/whatsapp-worker-ai.md`) nicht für den Betrieb freigegeben. Diese Dokumentation ist Repo-Text, keine geprüfte Freigabe.
- Hosting laut Projektangaben: Vercel (Frontend), Render (Backend), Neon (Datenbank). Standorte der Rechenzentren wurden nicht geprüft.

## Nicht belegt / vom Betreiber zu klären
Siehe Fragenliste im PR. Alle Stellen mit `[BITTE PRÜFEN: ...]` in den Vorlagen sind offen.

## Bekannte technische Lücken mit Datenschutzbezug (nicht in diesem PR geändert)
- Es gibt keine automatische Löschung nach Fristen im Code gefunden (nur Löschen einzelner Datensätze). Ein Löschkonzept fehlt.
- Es gibt keine Mandantentrennung im Datenmodell (kein `tenantId` / `companyId`). Mehrere Kunden in derselben Instanz und Datenbank wären ein Risiko; für die Vermietung ist je Kunde eine eigene Instanz oder eine Mandantentrennung nötig.
- Dokumente werden im lokalen Dateisystem des Servers gespeichert. Auf Render geht das bei Neustarts ohne persistenten Datenträger verloren und ist nicht ausfallsicher.
- Eine frühere Version der Datenbank-Zugangsdaten war öffentlich sichtbar (Vorfall 2026-10-18); Zugangsdaten rotieren und beim Kunden ggf. Meldepflichten prüfen, falls dort Echtdaten waren.
