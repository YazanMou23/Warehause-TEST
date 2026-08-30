import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';

export interface OcrTimesheetEntry {
  weekday: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalHours: number;
  location?: string;
}

export interface OcrTimesheetResult {
  employeeName: string;
  weekStartDate?: string;
  entries: OcrTimesheetEntry[];
  sandbox?: boolean;
  warning?: string;
}

// ─── German weekday map ───────────────────────────────────────────────────────
const DE_WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// ─── Name label prefixes that OCR sometimes extracts verbatim ────────────────
const NAME_PREFIX_RE = /^(name|mitarbeiter|arbeitnehmer|an|ma|mitarb|employee|emp)\s*[:=\-]\s*/i;

@Injectable()
export class TimesheetOcrService {
  private readonly logger = new Logger(TimesheetOcrService.name);

  constructor(private readonly configService: ConfigService) {}

  // ─── Public entry point ───────────────────────────────────────────────────

  async extractFromFile(file: Express.Multer.File): Promise<OcrTimesheetResult> {
    if (!file) throw new BadRequestException('No file provided');

    const isImage = file.mimetype.startsWith('image/');
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');

    if (!isImage && !isPdf) {
      this.logger.warn(`Unsupported file type: ${file.mimetype}`);
      return this.getSandboxFallback(
        'Unterstützte Formate: JPG, PNG, WEBP und PDF.',
      );
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY nicht konfiguriert — Sandbox-Modus aktiv.');
      return this.getSandboxFallback();
    }

    try {
      if (isPdf && !isImage) {
        // Backend safety-net: the frontend normally converts PDFs to JPEG images
        // before upload, so raw PDFs should never reach here in normal operation.
        // If they do (direct API call, frontend canvas failure, etc.) we extract
        // text or render screenshot and pass it to GPT-4o.
        return await this.extractFromPdfBuffer(file, apiKey);
      }
      return await this.callVisionApi(file, apiKey);
    } catch (error: any) {
      this.logger.error(`OCR-Extraktion fehlgeschlagen: ${error.message}`);
      let userFriendlyWarning = 'OCR-Verarbeitung konnte das Dokument nicht analysieren. Demo-Daten werden angezeigt.';
      if (error.message?.includes('image_parse_error') || error.message?.includes('unsupported image')) {
        userFriendlyWarning = 'Das gescannte Bild konnte nicht verarbeitet werden. Bitte Dokument erneut scannen oder ein anderes Bild hochladen.';
      } else if (error.message?.includes('PDF') || error.message?.includes('pdf')) {
        userFriendlyWarning = 'Das PDF konnte nicht verarbeitet werden. Bitte das Dokument erneut hochladen.';
      } else if (error.message?.includes('401') || error.message?.includes('invalid_api_key')) {
        userFriendlyWarning = 'OpenAI API-Schlüssel ist ungültig oder abgelaufen.';
      } else if (error.message?.includes('429')) {
        userFriendlyWarning = 'OpenAI API-Ratenlimit erreicht. Bitte in Kürze erneut versuchen.';
      }
      return this.getSandboxFallback(userFriendlyWarning);
    }
  }

  // ─── PDF safety-net (text extraction & render fallback) ────────────────────

  /**
   * Handle a raw PDF that arrived at the backend directly.
   *
   * Strategy:
   *   1. Use PDFParse to extract plain text from the PDF.
   *   2. If the PDF contains sufficient text (>= 80 chars) — it is a digital/text
   *      PDF — send the text to GPT-4o as a text-only prompt and extract data.
   *   3. If the text is sparse (scanned PDF), attempt screenshot rendering to image
   *      and forward to callVisionApi.
   *   4. Otherwise return a helpful fallback message.
   */
  private async extractFromPdfBuffer(
    file: Express.Multer.File,
    apiKey: string,
  ): Promise<OcrTimesheetResult> {
    this.logger.warn(
      `Raw PDF received at backend (${file.originalname}, ${file.size} bytes). ` +
      'This is unexpected — the frontend should have converted it to JPEG first.',
    );

    let pdfText = '';
    let parser: PDFParse | null = null;

    try {
      parser = new PDFParse({ data: new Uint8Array(file.buffer) });
      const textResult = await parser.getText();
      pdfText = (textResult.text ?? '').trim();
    } catch (err: any) {
      this.logger.error(`PDF parsing failed: ${err.message}`);
      return this.getSandboxFallback(
        'Das PDF ist beschädigt oder konnte nicht gelesen werden.',
      );
    }

    const MIN_TEXT_LENGTH = 80;
    if (pdfText.length >= MIN_TEXT_LENGTH) {
      if (parser) {
        await parser.destroy().catch(() => {});
      }
      this.logger.log(`PDF text extracted (${pdfText.length} chars) — sending to GPT-4o as text.`);
      return await this.callTextApi(pdfText, apiKey);
    }

    // If text is short, try rendering page 1 screenshot as an image fallback
    try {
      if (parser) {
        const screenshotResult = await parser.getScreenshot({ partial: [1], scale: 2, imageBuffer: true });
        await parser.destroy().catch(() => {});
        parser = null;

        const firstPage = screenshotResult.pages?.[0];
        if (firstPage?.data) {
          const imgBuffer = Buffer.from(firstPage.data);
          const fakeImageFile: Express.Multer.File = {
            ...file,
            buffer: imgBuffer,
            mimetype: 'image/png',
          };
          this.logger.log('Rendered PDF page 1 to image buffer on backend — calling Vision API.');
          return await this.callVisionApi(fakeImageFile, apiKey);
        }
      }
    } catch (renderErr: any) {
      this.logger.warn(`Server-side PDF screenshot render fallback failed: ${renderErr.message}`);
    } finally {
      if (parser) {
        await parser.destroy().catch(() => {});
      }
    }

    return this.getSandboxFallback(
      'Das hochgeladene PDF enthält nur gescannten Inhalt und konnte nicht direkt verarbeitet werden. ' +
      'Bitte das Dokument über den Browser-Upload erneut hochladen — die Anwendung konvertiert es dann automatisch in einzelne Seiten.',
    );
  }

  /**
   * Send plain text extracted from a PDF to GPT-4o for Stundenzettel extraction.
   * Uses the same system prompt and output schema as the image path.
   */
  private async callTextApi(
    text: string,
    apiKey: string,
  ): Promise<OcrTimesheetResult> {
    const systemPrompt = `Du bist ein hochpräzises Extraktionssystem für handgeschriebene und gedruckte deutsche Wochenarbeitszeitblätter (Stundenzettel).
Deine Aufgabe ist es, Arbeitszeiten, Datum, Mitarbeitername und Hallen/Einsatzorte strukturiert als JSON zu extrahieren.
WENN keine Tabelle, kein Text oder ein leeres Bild übergeben wird, antworte immer mit dem Standard-JSON (kein Fehler, keine Weigerung):
{
  "employeeName": "",
  "weekStartDate": "",
  "entries": []
}`;

    const userPrompt = `Analysiere diesen Stundenzettel-Text und extrahiere alle Einträge:

${text}

═══════════ DATUMSFORMATE — ALLE AKZEPTIEREN ═══════════
Eingabe: TT.MM.JJJJ · TT.MM.JJ · TT/MM/JJJJ · TT/MM/JJ · TT.MM
Ausgabe IMMER: YYYY-MM-DD (z.B. 16.07.2026 → 2026-07-16)

═══════════ ZEITFORMATE — ALLE AKZEPTIEREN ═══════════
Eingabe: HH:MM · HH.MM · HHMM · HHhMM · HH h MM · H:MM
Ausgabe IMMER: HH:MM (24h-Format, zweistellig, z.B. 08:00, 16:30)

═══════════ STUNDEN (totalHours) ═══════════
- Netto-Stunden (ohne Pause) als Dezimalzahl (z.B. 8.5)
- Wenn nicht lesbar: aus Startzeit - Endzeit - Pause berechnen

═══════════ NAME BEREINIGEN ═══════════
- Prefixe entfernen: "Name:", "Mitarbeiter:", "AN:", "MA:"
- Nur reinen Vor- und Nachnamen extrahieren

═══════════ AUSGABEFORMAT (NUR JSON) ═══════════
{
  "employeeName": "Vorname Nachname",
  "weekStartDate": "YYYY-MM-DD",
  "entries": [
    {
      "weekday": "Montag",
      "date": "YYYY-MM-DD",
      "startTime": "08:00",
      "endTime": "16:30",
      "breakMinutes": 30,
      "totalHours": 8.0,
      "location": "Halle 1"
    }
  ]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const contentStr = result.choices?.[0]?.message?.content;
    if (!contentStr) {
      throw new Error('Keine lesbaren Stundenzettel-Daten im PDF-Text erkannt');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(contentStr);
    } catch {
      throw new Error('Ungültiges Antwortformat von OCR-API erhalten');
    }

    // Reuse the same sanitization as the image path by delegating to a minimal
    // inline parse (mirrors callVisionApi's sanitization block).
    const employeeName = this.cleanEmployeeName(parsed.employeeName);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const sanitizedEntries: OcrTimesheetEntry[] = [];

    for (const entry of entries) {
      const date = this.normalizeDate(entry.date);
      if (!date) continue;
      const startTime = this.normalizeTime(entry.startTime);
      const endTime   = this.normalizeTime(entry.endTime);
      if (!startTime || !endTime) continue;
      const breakMinutes = Math.max(0, Math.floor(this.parseNumber(entry.breakMinutes)));
      let totalHours = this.parseNumber(entry.totalHours);
      if (totalHours <= 0) totalHours = this.calcHours(startTime, endTime, breakMinutes);
      const weekday = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][new Date(date).getUTCDay()];
      sanitizedEntries.push({
        weekday, date, startTime, endTime, breakMinutes,
        totalHours: Math.round(totalHours * 100) / 100,
        location: String(entry.location ?? '').trim() || undefined,
      });
    }

    let weekStartDate = this.normalizeDate(parsed.weekStartDate) ?? undefined;
    if (!weekStartDate) weekStartDate = this.deriveWeekStart(sanitizedEntries);

    return { employeeName, weekStartDate, entries: sanitizedEntries };
  }

  // ─── Vision API call ──────────────────────────────────────────────────────

  private async callVisionApi(
    file: Express.Multer.File,
    apiKey: string,
  ): Promise<OcrTimesheetResult> {
    const base64Data = file.buffer.toString('base64');
    const mimeType = file.mimetype && file.mimetype.startsWith('image/') ? file.mimetype : 'image/jpeg';

    const systemPrompt = `Du bist ein hochpräzises Extraktionssystem für handgeschriebene und gedruckte deutsche Wochenarbeitszeitblätter (Stundenzettel).
Deine Aufgabe ist es, Arbeitszeiten, Datum, Mitarbeitername und Hallen/Einsatzorte strukturiert als JSON zu extrahieren.
WENN keine Tabelle, kein Text oder ein leeres Bild übergeben wird, antworte immer mit dem Standard-JSON (kein Fehler, keine Weigerung):
{
  "employeeName": "",
  "weekStartDate": "",
  "entries": []
}`;

    const userPrompt = `Analysiere diesen Stundenzettel und extrahiere alle Einträge:

═══════════ DATUMSFORMATE — ALLE AKZEPTIEREN ═══════════
Eingabe: TT.MM.JJJJ · TT.MM.JJ · TT/MM/JJJJ · TT/MM/JJ · TT.MM
Ausgabe IMMER: YYYY-MM-DD (z.B. 16.07.2026 → 2026-07-16)

═══════════ ZEITFORMATE — ALLE AKZEPTIEREN ═══════════
Eingabe: HH:MM · HH.MM · HHMM · HHhMM · HH h MM · H:MM
Ausgabe IMMER: HH:MM (24h-Format, zweistellig, z.B. 08:00, 16:30)

═══════════ STUNDEN (totalHours) ═══════════
- Netto-Stunden (ohne Pause) als Dezimalzahl (z.B. 8.5)
- Wenn nicht lesbar: aus Startzeit - Endzeit - Pause berechnen

═══════════ NAME BEREINIGEN ═══════════
- Prefixe entfernen: "Name:", "Mitarbeiter:", "AN:", "MA:"
- Nur reinen Vor- und Nachnamen extrahieren

═══════════ AUSGABEFORMAT (NUR JSON) ═══════════
{
  "employeeName": "Vorname Nachname",
  "weekStartDate": "YYYY-MM-DD",
  "entries": [
    {
      "weekday": "Montag",
      "date": "YYYY-MM-DD",
      "startTime": "08:00",
      "endTime": "16:30",
      "breakMinutes": 30,
      "totalHours": 8.0,
      "location": "Halle 1"
    }
  ]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const message = result.choices?.[0]?.message;
    const contentStr = message?.content;

    if (!contentStr) {
      if (message?.refusal) {
        this.logger.warn(`OpenAI hat das Bild abgelehnt: ${message.refusal}`);
      }
      throw new Error('Keine lesbaren Stundenzettel-Daten auf dem Dokument erkannt');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(contentStr);
    } catch {
      throw new Error('Ungültiges Antwortformat von OCR-API erhalten');
    }

    // ── Sanitize ─────────────────────────────────────────────────────────────
    const employeeName = this.cleanEmployeeName(parsed.employeeName);
    const entries      = Array.isArray(parsed.entries) ? parsed.entries : [];

    const sanitizedEntries: OcrTimesheetEntry[] = [];

    for (const entry of entries) {
      // 1. Normalize date (handles DD.MM.YY etc.)
      const date = this.normalizeDate(entry.date);
      if (!date) {
        this.logger.warn(`Ungültiges Datum übersprungen: "${entry.date}"`);
        continue;
      }

      // 2. Normalize times (handles 17.30, 1730, 7h30 etc.)
      const startTime = this.normalizeTime(entry.startTime);
      const endTime   = this.normalizeTime(entry.endTime);
      if (!startTime || !endTime) {
        this.logger.warn(`Ungültige Zeiten übersprungen: "${entry.startTime}" - "${entry.endTime}"`);
        continue;
      }

      // 3. Parse break minutes
      const breakMinutes = Math.max(0, Math.floor(this.parseNumber(entry.breakMinutes)));

      // 4. Parse totalHours (German comma decimal)
      let totalHours = this.parseNumber(entry.totalHours);
      if (totalHours <= 0) {
        // Recalculate from times
        totalHours = this.calcHours(startTime, endTime, breakMinutes);
      }

      // 5. Compute weekday from date (authoritative)
      const weekday = DE_WEEKDAYS[new Date(date).getUTCDay()];

      sanitizedEntries.push({
        weekday,
        date,
        startTime,
        endTime,
        breakMinutes,
        totalHours: Math.round(totalHours * 100) / 100,
        location: String(entry.location ?? '').trim() || undefined,
      });
    }

    // Derive weekStartDate
    let weekStartDate: string | undefined = this.normalizeDate(parsed.weekStartDate) ?? undefined;
    if (!weekStartDate) {
      weekStartDate = this.deriveWeekStart(sanitizedEntries);
    }

    return { employeeName, weekStartDate, entries: sanitizedEntries };
  }

  // ─── Normalization helpers ────────────────────────────────────────────────

  /**
   * Accepts: HH:MM · HH.MM · HHMM · HHhMM · H:MM · 8:0
   * Returns: "HH:MM" or null if unparseable
   */
  normalizeTime(raw: any): string | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;

    // "17h30" / "17 h 30" / "7H00"
    const hMatch = s.match(/^(\d{1,2})\s*[hH]\s*(\d{0,2})$/);
    if (hMatch) {
      const h = parseInt(hMatch[1], 10);
      const m = parseInt(hMatch[2] || '0', 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    // Strip all non-numeric except colon/dot/comma
    let clean = s.replace(/[^0-9:.]/g, '');

    // Replace dot → colon
    clean = clean.replace(/\./g, ':');

    // Bare digits: "800" → "08:00", "1730" → "17:30"
    if (!clean.includes(':')) {
      if (clean.length === 3)      clean = '0' + clean[0] + ':' + clean.slice(1);
      else if (clean.length === 4) clean = clean.slice(0, 2) + ':' + clean.slice(2);
      else if (clean.length <= 2)  clean = clean.padStart(2, '0') + ':00';
    }

    // Handle "8:0" → "08:00"
    const parts = clean.split(':');
    if (parts.length === 2) {
      const h = parts[0].padStart(2, '0');
      const m = (parts[1] || '00').padStart(2, '0');
      clean = `${h}:${m}`;
    }

    const match = clean.match(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/);
    return match ? clean : null;
  }

  /**
   * Accepts: YYYY-MM-DD · DD.MM.YYYY · DD.MM.YY · DD/MM/YYYY · DD/MM/YY · DD.MM
   * Returns: "YYYY-MM-DD" or null
   */
  normalizeDate(raw: any): string | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;

    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : s;
    }

    // DD.MM.YYYY or DD/MM/YYYY
    const long = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (long) {
      const day   = long[1].padStart(2, '0');
      const month = long[2].padStart(2, '0');
      const iso   = `${long[3]}-${month}-${day}`;
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : iso;
    }

    // DD.MM.YY or DD/MM/YY
    const short = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2})$/);
    if (short) {
      const day   = short[1].padStart(2, '0');
      const month = short[2].padStart(2, '0');
      const year  = `20${short[3]}`;
      const iso   = `${year}-${month}-${day}`;
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : iso;
    }

    // DD.MM (no year — use current)
    const noYear = s.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
    if (noYear) {
      const day   = noYear[1].padStart(2, '0');
      const month = noYear[2].padStart(2, '0');
      const year  = new Date().getUTCFullYear();
      const iso   = `${year}-${month}-${day}`;
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : iso;
    }

    return null;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private cleanEmployeeName(raw: any): string {
    if (!raw) return 'Unbekannter Mitarbeiter';
    const cleaned = String(raw)
      .trim()
      .replace(NAME_PREFIX_RE, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return cleaned || 'Unbekannter Mitarbeiter';
  }

  /** Parse number, handling German comma decimal ("8,5" → 8.5) */
  private parseNumber(val: any): number {
    if (val === null || val === undefined) return 0;
    const n = parseFloat(String(val).replace(',', '.').trim());
    return isNaN(n) ? 0 : n;
  }

  private calcHours(start: string, end: string, breakMin: number): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const netMin = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
    return Math.max(0, netMin / 60);
  }

  private deriveWeekStart(entries: OcrTimesheetEntry[]): string {
    const ref = entries[0]?.date ? new Date(entries[0].date) : new Date();
    const day = ref.getUTCDay();
    const dist = day === 0 ? 6 : day - 1;
    const monday = new Date(ref);
    monday.setUTCDate(monday.getUTCDate() - dist);
    monday.setUTCHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0];
  }

  // ─── Sandbox fallback ─────────────────────────────────────────────────────

  private getSandboxFallback(warning?: string): OcrTimesheetResult {
    const week = new Date();
    const day = week.getUTCDay();
    week.setUTCDate(week.getUTCDate() - (day === 0 ? 6 : day - 1));
    const mon = week.toISOString().split('T')[0];
    const d = (offset: number) => {
      const dt = new Date(week);
      dt.setUTCDate(dt.getUTCDate() + offset);
      return dt.toISOString().split('T')[0];
    };

    return {
      employeeName: 'Max Mustermann',
      weekStartDate: mon,
      sandbox: true,
      warning: warning ?? 'Sandbox-Modus aktiv — Demo-Daten werden angezeigt.',
      entries: [
        { weekday: 'Montag',     date: d(0), startTime: '08:00', endTime: '16:30', breakMinutes: 30, totalHours: 8.0,  location: 'Lager Nord' },
        { weekday: 'Dienstag',   date: d(1), startTime: '07:45', endTime: '16:00', breakMinutes: 30, totalHours: 7.75, location: 'Lager Nord' },
        { weekday: 'Mittwoch',   date: d(2), startTime: '08:00', endTime: '17:00', breakMinutes: 45, totalHours: 8.25, location: 'Lager Süd'  },
        { weekday: 'Donnerstag', date: d(3), startTime: '08:30', endTime: '16:30', breakMinutes: 30, totalHours: 7.5,  location: 'Lager Nord' },
        { weekday: 'Freitag',    date: d(4), startTime: '08:00', endTime: '14:00', breakMinutes: 0,  totalHours: 6.0,  location: 'Büro'       },
      ],
    };
  }
}
