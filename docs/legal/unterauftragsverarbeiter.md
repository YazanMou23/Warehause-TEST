# Unterauftragsverarbeiter (Entwurf, Stand 2026-11-06)

Quelle: Quellcode der Anwendung und Projektangaben. Spalte "Prüfen" nennt, was der Betreiber noch bestätigen muss.

| Dienstleister | Zweck | Datenkategorien | Sitz/Region | Prüfen |
|---|---|---|---|---|
| Vercel Inc. | Hosting Weboberfläche | IP-Adressen, Zugriffsdaten, ausgelieferte Seiten | USA / ggf. EU-Edge | AVV/DPA abgeschlossen? Region? |
| Render Services, Inc. | Hosting Server-Anwendung, Dateiablage | alle Anwendungsdaten, hochgeladene Dokumente | USA; Region wählbar | Region (Frankfurt?) und DPA? |
| Neon, Inc. | PostgreSQL-Datenbank | alle Stamm-, Arbeitszeit-, Chat- und Dokumentdaten | Region wählbar | Region (EU?) und DPA? |
| Meta Platforms Ireland Ltd. | WhatsApp Business Cloud API | Telefonnummer, Nachrichtentext, Zeitstempel, Zustellstatus | Irland / USA | Meta-Geschäftsbedingungen und Datenverarbeitungsbedingungen akzeptiert? |
| Resend, Inc. | System-E-Mails | E-Mail-Adresse, Name, Mailinhalt | USA | DPA? |
| OpenAI (OpenAI Ireland Ltd. / OpenAI, L.L.C.) | OCR und Auswertung von Stundenzetteln, Dokumenten, Containerlisten | Bild-/Dokumentinhalte, darin ggf. Namen, Arbeitszeiten | USA | DPA, Zero-Data-Retention-Einstellung, Training-Opt-out |
| UltraMsg (nur wenn konfiguriert) | WhatsApp-Rückfallversand | Telefonnummer, Nachrichtentext | unklar | Wird es genutzt? Wenn nein, aus der Liste streichen. Kein offizieller WhatsApp-Kanal. |

Nur bei Aktivierung: OpenAI Responses API für Worker-KI (derzeit abgeschaltet).

Informationspflicht: Kunden vorab über neue oder geänderte Unterauftragsverarbeiter informieren (siehe AVV, Ziffer 7).
