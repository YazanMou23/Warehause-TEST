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

@Injectable()
export class TimesheetOcrService {
  private readonly logger = new Logger(TimesheetOcrService.name);

  constructor(private readonly configService: ConfigService) {}

  async extractFromFile(file: Express.Multer.File): Promise<OcrTimesheetResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const isImage = file.mimetype.startsWith('image/');
    if (!isImage) {
      this.logger.warn(
        `Non-image file received: ${file.mimetype}. Only JPG/PNG supported for OCR.`,
      );
      return this.getSandboxFallback(
        'Nur Bilder (JPG/PNG) werden für die Stundenzettel-Erkennung unterstützt. PDF-Unterstützung folgt in Kürze.',
      );
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured — returning sandbox timesheet.');
      return this.getSandboxFallback();
    }

    try {
      return await this.callVisionApi(file, apiKey);
    } catch (error: any) {
      this.logger.error(`OCR extraction failed: ${error.message}`);
      return this.getSandboxFallback(`API-Fehler: ${error.message}`);
    }
  }

  private async callVisionApi(
    file: Express.Multer.File,
    apiKey: string,
  ): Promise<OcrTimesheetResult> {
    const base64Data = file.buffer.toString('base64');
    const mimeType = file.mimetype;

    const prompt = `Du bist ein Präzisions-Extraktionssystem für handgeschriebene deutsche Wochenarbeitszeitblätter (Stundenzettel).

WICHTIGE REGELN:
1. DURCHGESTRICHENE Zeiten oder Werte → IGNORIEREN und NUR den gültigen (nicht durchgestrichenen) Wert nehmen.
2. Unterschriften am Zeilen- oder Dokumentenende → KOMPLETT IGNORIEREN.
3. Leere Zeilen (Tage ohne Arbeitseintrag) → WEGLASSEN.
4. Zeitformat: Immer "HH:MM" (24h, z.B. "08:00", "17:30").
5. Datum: Immer "YYYY-MM-DD" Format.
6. breakMinutes: Pause in Minuten als Ganzzahl (z.B. 30 für "30 Min").
7. totalHours: Stunden als Dezimalzahl ohne Pause (z.B. 8.0 für 8 Stunden).
8. Wenn eine Zahl schwer lesbar ist, gib deine beste Schätzung ab — kein leeres Feld.

Extrahiere EXAKT dieses JSON (weekStartDate ist der Montag der Arbeitswoche, extrahiert aus dem Tabellenkopf oder Wochenzeitraum auf dem Zettel, im Format YYYY-MM-DD):
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
                  url: `data:${mimeType};base64,${base64Data}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const contentStr = result.choices?.[0]?.message?.content;
    if (!contentStr) {
      throw new Error('No content returned from OpenAI Vision API');
    }

    const parsed = JSON.parse(contentStr) as OcrTimesheetResult;

    if (!parsed.employeeName) {
      parsed.employeeName = 'Unbekannter Mitarbeiter';
    }

    if (!Array.isArray(parsed.entries)) {
      parsed.entries = [];
    }

    // Strict validation & sanitization
    const sanitizedEntries: OcrTimesheetEntry[] = [];
    for (const entry of parsed.entries) {
      // 1. Validate Date (YYYY-MM-DD)
      if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        continue; // Discard entries with corrupt dates
      }
      const entryDate = new Date(entry.date);
      if (isNaN(entryDate.getTime())) {
        continue;
      }

      // 2. Normalize times
      const cleanStart = this.normalizeTime(entry.startTime);
      const cleanEnd = this.normalizeTime(entry.endTime);
      if (!cleanStart || !cleanEnd) {
        continue; // Discard if times are unreadable or missing
      }

      // 3. Recalculate/validate weekday based on UTC date
      const computedWeekday = this.getGermanWeekday(entry.date);

      // 4. Sanitize breakMinutes
      let breakMin = Math.max(0, Math.floor(Number(entry.breakMinutes || 0)));
      if (isNaN(breakMin)) breakMin = 0;

      // 5. Sanitize totalHours (ensure positive and fallback to calculated)
      let calculatedHours = this.calculateHours(cleanStart, cleanEnd, breakMin);
      let parsedHours = Number(entry.totalHours);
      if (isNaN(parsedHours) || parsedHours <= 0) {
        parsedHours = calculatedHours;
      }

      sanitizedEntries.push({
        weekday: computedWeekday,
        date: entry.date,
        startTime: cleanStart,
        endTime: cleanEnd,
        breakMinutes: breakMin,
        totalHours: Math.round(parsedHours * 100) / 100,
        location: entry.location?.trim() || '',
      });
    }

    parsed.entries = sanitizedEntries;

    // Validate weekStartDate
    if (!parsed.weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.weekStartDate)) {
      parsed.weekStartDate = this.deriveWeekStartFromEntries(parsed.entries);
    }

    return parsed;
  }

  private normalizeTime(tStr: string): string | null {
    if (!tStr) return null;
    let clean = tStr.replace(/[^0-9:]/g, '').trim();
    if (!clean.includes(':') && clean.length === 4) {
      clean = clean.substring(0, 2) + ':' + clean.substring(2);
    }
    const match = clean.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/);
    if (!match) return null;
    const parts = clean.split(':');
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${h}:${m}`;
  }

  private getGermanWeekday(dateStr: string): string {
    const d = new Date(dateStr);
    const day = d.getUTCDay();
    const weekdaysDe = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return weekdaysDe[day];
  }

  private calculateHours(startTime: string, endTime: string, breakMinutes: number): number {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;
    if (endMin <= startMin) return 0;
    const netMin = endMin - startMin - breakMinutes;
    return Math.max(0, netMin / 60);
  }

  private deriveWeekStartFromEntries(entries: OcrTimesheetEntry[]): string {
    if (entries.length > 0) {
      const firstDate = new Date(entries[0].date);
      if (!isNaN(firstDate.getTime())) {
        const day = firstDate.getUTCDay();
        const distToMonday = day === 0 ? 6 : day - 1;
        const monday = new Date(firstDate);
        monday.setUTCDate(monday.getUTCDate() - distToMonday);
        return monday.toISOString().split('T')[0];
      }
    }
    const now = new Date();
    const day = now.getUTCDay();
    const distToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setUTCDate(monday.getUTCDate() - distToMonday);
    return monday.toISOString().split('T')[0];
  }

  private getSandboxFallback(warning?: string): OcrTimesheetResult {
    return {
      employeeName: 'Max Mustermann',
      weekStartDate: '2026-06-15',
      sandbox: true,
      warning: warning ?? 'Sandbox-Modus aktiv — Demo-Daten werden angezeigt.',
      entries: [
        {
          weekday: 'Montag',
          date: '2026-06-16',
          startTime: '08:00',
          endTime: '16:30',
          breakMinutes: 30,
          totalHours: 8.0,
          location: 'Lager Nord',
        },
        {
          weekday: 'Dienstag',
          date: '2026-06-17',
          startTime: '07:45',
          endTime: '16:00',
          breakMinutes: 30,
          totalHours: 7.75,
          location: 'Lager Nord',
        },
        {
          weekday: 'Mittwoch',
          date: '2026-06-18',
          startTime: '08:00',
          endTime: '17:00',
          breakMinutes: 45,
          totalHours: 8.25,
          location: 'Lager Süd',
        },
        {
          weekday: 'Donnerstag',
          date: '2026-06-19',
          startTime: '08:30',
          endTime: '16:30',
          breakMinutes: 30,
          totalHours: 7.5,
          location: 'Lager Nord',
        },
        {
          weekday: 'Freitag',
          date: '2026-06-20',
          startTime: '08:00',
          endTime: '14:00',
          breakMinutes: 0,
          totalHours: 6.0,
          location: 'Büro',
        },
      ],
    };
  }
}
