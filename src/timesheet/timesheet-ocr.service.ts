import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
        'Nur Bilder (JPG/PNG/JPEG) und PDF-Dateien werden unterstützt.',
      );
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY nicht konfiguriert — Sandbox-Modus aktiv.');
      return this.getSandboxFallback();
    }

    try {
      return await this.callVisionApi(file, apiKey);
    } catch (error: any) {
      this.logger.error(`OCR-Extraktion fehlgeschlagen: ${error.message}`);
      return this.getSandboxFallback(`API-Fehler: ${error.message}`);
    }
  }

  // ─── Vision API call ──────────────────────────────────────────────────────

  private async callVisionApi(
    file: Express.Multer.File,
    apiKey: string,
  ): Promise<OcrTimesheetResult> {
    const base64Data = file.buffer.toString('base64');

    const prompt = `Du bist ein hochpräzises Extraktionssystem für handgeschriebene und gedruckte deutsche Wochenarbeitszeitblätter (Stundenzettel).

═══════════ DATUMSFORMATE — ALLE AKZEPTIEREN ═══════════
Eingabe kann sein: TT.MM.JJJJ · TT.MM.JJ · TT/MM/JJJJ · TT/MM/JJ · TT.MM (nur Tag+Monat)
Ausgabe IMMER: YYYY-MM-DD
Beispiele: 16.07.2026 → 2026-07-16 | 16.07.26 → 2026-07-16 | 16/07 → ${new Date().getUTCFullYear()}-07-16

═══════════ ZEITFORMATE — ALLE AKZEPTIEREN ═══════════
Eingabe kann sein: HH:MM · HH.MM · HHMM · HHhMM · HH h MM · H:MM
Ausgabe IMMER: HH:MM (24h-Format, zweistellig)
Beispiele: 8:0 → 08:00 | 17.30 → 17:30 | 1730 → 17:30 | 7h30 → 07:30

═══════════ STUNDEN (totalHours) ═══════════
- Komma als Dezimaltrennzeichen: 8,5 = 8.5 | 7,75 = 7.75
- Immer Netto-Stunden (ohne Pause) als Dezimalzahl
- Wenn nicht lesbar: selbst aus Startzeit - Endzeit - Pause berechnen

═══════════ NAME BEREINIGEN ═══════════
- Prefixe ENTFERNEN: "Name:", "Mitarbeiter:", "AN:", "MA:", "Arbeitnehmer:"
- Nur den reinen Vor- und Nachnamen extrahieren
- Reihenfolge egal (Vorname Nachname ODER Nachname, Vorname)

═══════════ WEITERE REGELN ═══════════
1. DURCHGESTRICHENE Werte → IGNORIEREN, nur gültigen Wert nehmen
2. Unterschriften → KOMPLETT IGNORIEREN
3. Tage ohne Eintrag (leer) → WEGLASSEN
4. Bei unlesbaren Zeichen → beste Schätzung abgeben, kein leeres Feld
5. weekStartDate = der MONTAG der Arbeitswoche (aus Kopfzeile oder berechnet)

═══════════ AUSGABEFORMAT (NUR dieses JSON, KEINE Erklärungen) ═══════════
{
  "employeeName": "Vorname Nachname",
  "weekStartDate": "YYYY-MM-DD",
  "entries": [
    {
      "weekday": "Montag",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "breakMinutes": 30,
      "totalHours": 8.0,
      "location": "Lager Nord"
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
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${file.mimetype};base64,${base64Data}`,
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
    const contentStr = result.choices?.[0]?.message?.content;
    if (!contentStr) throw new Error('Keine Antwort von OpenAI Vision API');

    const parsed = JSON.parse(contentStr) as any;

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
