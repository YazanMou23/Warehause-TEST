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

Extrahiere EXAKT dieses JSON:
{
  "employeeName": "Vorname Nachname",
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

    if (!parsed.employeeName || !Array.isArray(parsed.entries)) {
      throw new Error('Invalid OCR response structure');
    }

    // Sanitize entries — remove truly empty ones
    parsed.entries = parsed.entries.filter(
      (e) => e.startTime && e.endTime && e.startTime.trim() !== '' && e.endTime.trim() !== '',
    );

    return parsed;
  }

  private getSandboxFallback(warning?: string): OcrTimesheetResult {
    return {
      employeeName: 'Max Mustermann',
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
