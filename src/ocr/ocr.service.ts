import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrExtractionType } from './dto/ocr-upload.dto';
import { TimesheetMatcherService } from '../timesheet/timesheet-matcher.service';
import { TimesheetOcrService } from '../timesheet/timesheet-ocr.service';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly matcherService: TimesheetMatcherService,
    private readonly timesheetOcrService: TimesheetOcrService,
  ) {}

  async processFile(file: Express.Multer.File, type: OcrExtractionType) {
    if (!file) throw new BadRequestException('No file provided');

    const isImage = file.mimetype.startsWith('image/');
    const isPdf   = file.mimetype === 'application/pdf';

    if (!isImage && !isPdf) {
      throw new BadRequestException(
        `Nicht unterstützter Dateityp: ${file.mimetype}. Bitte JPG, PNG oder PDF hochladen.`,
      );
    }

    if (isPdf) {
      this.logger.warn(`PDF erhalten: ${file.originalname}. Vision API unterstützt kein PDF.`);
      return {
        ...this.getSandboxFallback(file.originalname, type),
        warning:
          'PDF-Dateien können nicht direkt verarbeitet werden. Bitte als JPG/PNG konvertieren. Demo-Daten werden angezeigt.',
      };
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY nicht konfiguriert — Sandbox-Modus.');
      return this.getSandboxFallback(file.originalname, type);
    }

    // ── For TIMESHEETS: delegate to the full TimesheetOcrService pipeline ──
    if (type === OcrExtractionType.TIMESHEETS) {
      return this.processTimesheet(file, apiKey);
    }

    // ── For CONTAINERS: use dedicated container prompt ──
    return this.processContainers(file, apiKey);
  }

  // ─── Timesheet extraction (delegates to TimesheetOcrService + name match) ──

  private async processTimesheet(file: Express.Multer.File, _apiKey: string) {
    try {
      // Reuse the high-quality TimesheetOcrService (same prompt + sanitization)
      const ocrResult = await this.timesheetOcrService.extractFromFile(file);

      // Match employee name against DB
      const matchResult = await this.matcherService.findBestMatch(ocrResult.employeeName);

      return {
        type: 'TIMESHEETS',
        employeeName: ocrResult.employeeName,
        weekStartDate: ocrResult.weekStartDate,
        sandbox: ocrResult.sandbox ?? false,
        warning: ocrResult.warning,
        employeeMatch: {
          found:       matchResult.found,
          confidence:  matchResult.confidence,
          score:       matchResult.score,
          employeeId:  matchResult.employeeId,
          matchedName: matchResult.matchedName,
        },
        data: ocrResult.entries,
      };
    } catch (err: any) {
      this.logger.error(`Timesheet OCR fehlgeschlagen: ${err.message}`);
      return this.getSandboxFallback(file.originalname, OcrExtractionType.TIMESHEETS, err.message);
    }
  }

  // ─── Container extraction ─────────────────────────────────────────────────

  private async processContainers(file: Express.Multer.File, apiKey: string) {
    const base64Data = file.buffer.toString('base64');

    const prompt = `Du bist ein hochpräzises Extraktionssystem für Logistikdokumente (Containerlisten, Ladelisten, Lieferscheine).

AUFGABE: Extrahiere ALLE Containerinformationen aus dem Dokument.

CONTAINERREGELN:
- containerNumber: 4 Buchstaben + 7 Ziffern (ISO 6346), z.B. HLXU8472910. Leerzeichen entfernen. GROSSBUCHSTABEN.
- status: "FULL" oder "EMPTY". Wenn unklar → "FULL"
- arrivalDate: Ausgabe YYYY-MM-DD. Eingabe kann DD.MM.YYYY oder DD.MM.YY sein → umrechnen
- hall: Hallen- oder Lagerbezeichnung wenn sichtbar (z.B. "Halle 1", "H3", "A2")
- notes: Zusätzliche Hinweise oder Bemerkungen zum Container

AUSGABE — NUR dieses JSON, keine Erklärungen:
{
  "type": "CONTAINERS",
  "data": [
    {
      "containerNumber": "HLXU8472910",
      "status": "FULL",
      "arrivalDate": "2026-07-31",
      "hall": "Halle 3",
      "notes": ""
    }
  ]
}`;

    try {
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
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API ${response.status}: ${errText}`);
      }

      const result     = await response.json();
      const contentStr = result.choices?.[0]?.message?.content;
      if (!contentStr) throw new Error('Keine Antwort von OpenAI Vision API');

      const parsed = JSON.parse(contentStr);

      // Sanitize container numbers
      if (Array.isArray(parsed.data)) {
        parsed.data = parsed.data.map((c: any) => ({
          ...c,
          containerNumber: String(c.containerNumber ?? '').replace(/\s/g, '').toUpperCase(),
          status: ['FULL', 'EMPTY'].includes(String(c.status).toUpperCase())
            ? String(c.status).toUpperCase()
            : 'FULL',
          arrivalDate: this.normalizeContainerDate(c.arrivalDate),
        }));
      }

      return parsed;
    } catch (err: any) {
      this.logger.error(`Container OCR fehlgeschlagen: ${err.message}`);
      return this.getSandboxFallback(file.originalname, OcrExtractionType.CONTAINERS, err.message);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private normalizeContainerDate(raw: any): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const long = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (long) return `${long[3]}-${long[2].padStart(2, '0')}-${long[1].padStart(2, '0')}`;

    const short = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2})$/);
    if (short) return `20${short[3]}-${short[2].padStart(2, '0')}-${short[1].padStart(2, '0')}`;

    return null;
  }

  // ─── Sandbox fallback ─────────────────────────────────────────────────────

  private getSandboxFallback(filename: string, type: OcrExtractionType, errorMessage?: string) {
    const warning = errorMessage
      ? `API fehlgeschlagen (${errorMessage}). Demo-Daten werden angezeigt.`
      : 'Sandbox-Modus aktiv.';

    if (type === OcrExtractionType.CONTAINERS) {
      const match    = filename.match(/[A-Z]{3,4}\d{6,7}/i);
      const cnum     = match ? match[0].toUpperCase() : 'HLXU8472910';
      const today    = new Date().toISOString().split('T')[0];

      return {
        type: 'CONTAINERS',
        sandbox: true,
        warning,
        data: [
          { containerNumber: cnum,         status: 'FULL',  arrivalDate: today, hall: 'Halle 1', notes: '' },
          { containerNumber: 'MSCU1284920', status: 'EMPTY', arrivalDate: today, hall: 'Halle 2', notes: '' },
        ],
      };
    }

    // TIMESHEETS fallback
    return {
      type: 'TIMESHEETS',
      sandbox: true,
      warning,
      employeeMatch: { found: false, confidence: 'none', score: 0 },
      data: [
        { weekday: 'Montag',   date: '2026-07-28', startTime: '08:00', endTime: '16:30', breakMinutes: 30, totalHours: 8.0  },
        { weekday: 'Dienstag', date: '2026-07-29', startTime: '07:45', endTime: '16:00', breakMinutes: 30, totalHours: 7.75 },
      ],
    };
  }
}
