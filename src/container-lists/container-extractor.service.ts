import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { ConfigService } from '@nestjs/config';
import { ContainerListRowDto, FieldWarning } from './dto/container-list.dto';

export interface ExtractionResult {
  site: string;
  rawFileName: string;
  date?: string;
  rows: ContainerListRowDto[];
  globalWarnings: string[];
  /** true when rows come from the offline mock fallback, not a real extraction */
  simulated?: boolean;
}

@Injectable()
export class ContainerExtractorService {
  private readonly logger = new Logger(ContainerExtractorService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Main entry point to extract draft container list rows from an uploaded image or PDF.
   * STRICT: Does not save anything to the database.
   */
  async extractDraft(
    file: Express.Multer.File,
    requestedSite?: string,
  ): Promise<ExtractionResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const fileName = file.originalname || 'uploaded_document';
    const mimeType = file.mimetype || 'image/jpeg';

    this.logger.log(`Extracting container list from ${fileName} (${mimeType}, size: ${file.size} bytes)...`);

    let rawRows: Partial<ContainerListRowDto>[] = [];
    let detectedSite = requestedSite || 'Gant';
    let docDate: string | undefined;
    let simulated = false;
    const globalWarnings: string[] = [];

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured. Running offline extraction engine.');
      const mockResult = this.getMockExtraction(file, detectedSite);
      rawRows = mockResult.rows;
      detectedSite = mockResult.site;
      docDate = mockResult.date;
      simulated = true;
      globalWarnings.push(...mockResult.globalWarnings);
    } else {
      try {
        const aiResult = await this.callOpenAiVision(file, requestedSite);
        rawRows = aiResult.rows;
        if (aiResult.site) detectedSite = aiResult.site;
        docDate = aiResult.date;
        if (aiResult.globalWarnings) globalWarnings.push(...aiResult.globalWarnings);
      } catch (err: any) {
        this.logger.error(`OpenAI Vision failed: ${err.message}. Falling back to offline extraction.`);
        globalWarnings.push(`KI-Extraktion fehlgeschlagen (${err.message}). Offline-Musterdaten geladen.`);
        const fallback = this.getMockExtraction(file, detectedSite);
        rawRows = fallback.rows;
        docDate = fallback.date;
        simulated = true;
      }
    }

    // Apply strict business rules and calculations to every row
    const processedRows = rawRows.map((row, idx) =>
      this.applyBusinessRules(row, idx + 1),
    );

    return {
      site: detectedSite,
      rawFileName: fileName,
      date: docDate || new Date().toISOString().slice(0, 10),
      rows: processedRows,
      globalWarnings,
      simulated,
    };
  }

  /**
   * Calls OpenAI GPT-4o Vision to extract tabular CTR-Liste data.
   */
  private async callOpenAiVision(
    file: Express.Multer.File,
    requestedSite?: string,
  ): Promise<{ site?: string; date?: string; rows: any[]; globalWarnings?: string[] }> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    const prompt = `You are a specialized Logistics OCR & Vision AI for German Container Unloading Lists (CTR-Liste).
Analyze the uploaded photo or scan of the container list and extract all container rows into structured JSON.

CLIENT SITE HINT: ${requestedSite || 'Determine from sheet header (Gant, Brooks, Schwalbe, WE-Britax, Medisana, Zwilling, ProHeq, Loxx)'}

MANDATORY FIELDS PER ROW (German CTR fields):
1. date: string (e.g. "2026-10-25" or "25.10.")
2. containerNumber: string (typically 4 letters + 7 digits, e.g. "MSKU1234567")
3. fuss: string (Container size: "20", "40", "45")
4. artikel: string (Article / description)
5. kartons: number (Carton count)
6. termin: string (Scheduled appointment time e.g. "08:00")
7. ankunft: string (Actual arrival time e.g. "07:45")
8. start: string (Unloading start time e.g. "08:15")
9. ende: string (Unloading end time e.g. "11:30")
10. personal: number (Worker count, e.g. 2). DO NOT GUESS if unreadable or missing.
11. wartezeitVon: string (Waiting time start e.g. "09:00")
12. wartezeitBis: string (Waiting time end e.g. "09:50")
13. wickel: string (Wrapping / pallet wrap notes)
14. preis: number (Price or rate if present)
15. ps: string (PS / Pauschale)
16. extraTeam: string (Extra team notes)
17. bemerkung: string (Free-text notes, e.g. "Verspätung", damaged goods, etc.)

STRICT RULES:
- Never invent numbers or text.
- If a digit or word is unclear/handwritten, provide your best reading and include the field name in "uncertainFields" array for that row.
- If worker count (personal) is not clearly readable, return null for personal and include "personal" in uncertainFields.
- Return ONLY valid JSON with this structure:
{
  "site": "Gant",
  "date": "YYYY-MM-DD",
  "rows": [...],
  "globalWarnings": [...]
}`;

    // PDFs cannot be sent to the Vision endpoint as images. Follow the same
    // pattern as timesheet-ocr.service.ts: extract text first; if the PDF is
    // scanned (too little text), render page 1 to an image and use the vision
    // path with the rendered PNG.
    let imageBuffer: Buffer = file.buffer;
    let imageMime = file.mimetype && file.mimetype.startsWith('image/') ? file.mimetype : null;
    let pdfText = '';

    if (file.mimetype === 'application/pdf') {
      let parser: PDFParse | null = null;
      try {
        parser = new PDFParse({ data: new Uint8Array(file.buffer) });
        const textResult = await parser.getText();
        pdfText = (textResult.text ?? '').trim();

        if (pdfText.length < 80) {
          // Scanned PDF: render first page to an image for the vision path
          const screenshot = await parser.getScreenshot({ partial: [1], scale: 2, imageBuffer: true });
          const firstPage = screenshot.pages?.[0];
          if (firstPage?.data) {
            imageBuffer = Buffer.from(firstPage.data as any);
            imageMime = 'image/png';
            this.logger.log('Scanned PDF: rendered page 1 to image for vision extraction.');
          }
        } else {
          this.logger.log(`Digital PDF: extracted ${pdfText.length} chars of text for text-based extraction.`);
        }
      } finally {
        if (parser) await parser.destroy().catch(() => {});
      }
    }

    if (!imageMime && !pdfText) {
      throw new Error(`Unsupported or unreadable file type: ${file.mimetype}`);
    }

    const userContent: any[] = [{ type: 'text', text: prompt }];
    if (pdfText) {
      userContent.push({ type: 'text', text: `\n\nDOCUMENT TEXT (extracted from PDF):\n${pdfText}` });
    } else {
      const base64Data = imageBuffer.toString('base64');
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${imageMime};base64,${base64Data}`,
          detail: 'high',
        },
      });
    }

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
            content: userContent,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI Vision HTTP ${response.status}: ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return JSON.parse(content || '{}');
  }

  /**
   * Applies business rules to an extracted row:
   * - Calculates wartezeitStd = (bis - von) * personal
   * - Validates worker count
   * - Checks container number format
   * - Generates per-field warnings
   */
  public applyBusinessRules(
    row: Partial<ContainerListRowDto>,
    rowOrder: number,
  ): ContainerListRowDto {
    const warnings: FieldWarning[] = [...(row.warnings || [])];
    const uncertainFields: string[] = [...(row.uncertainFields || [])];

    // 1. Worker count validation
    if (row.personal === undefined || row.personal === null || isNaN(row.personal) || row.personal <= 0) {
      if (!uncertainFields.includes('personal')) uncertainFields.push('personal');
      warnings.push({
        field: 'personal',
        message: 'Mitarbeiteranzahl fehlt oder unleserlich. Bitte manuell eintragen.',
        severity: 'warning',
      });
    }

    // 2. Container number validation
    if (row.containerNumber) {
      const cleaned = row.containerNumber.replace(/[\s\-_]/g, '').toUpperCase();
      const standardPattern = /^[A-Z]{4}\d{7}$/;
      if (!standardPattern.test(cleaned)) {
        warnings.push({
          field: 'containerNumber',
          message: `Format ungewöhnlich (${row.containerNumber}). Standard: 4 Buchstaben + 7 Ziffern (z. B. YXEU1802671).`,
          severity: 'info',
        });
      }
    } else {
      warnings.push({
        field: 'containerNumber',
        message: 'Container-Nummer fehlt in dieser Zeile.',
        severity: 'warning',
      });
      if (!uncertainFields.includes('containerNumber')) uncertainFields.push('containerNumber');
    }

    // 3. Wartezeit calculation: (bis - von) * personal
    let wartezeitStd: string | undefined = row.wartezeitStd;

    if (row.wartezeitVon && row.wartezeitBis) {
      if (row.personal && row.personal > 0) {
        const calculated = this.calculateWartezeit(
          row.wartezeitVon,
          row.wartezeitBis,
          row.personal,
        );
        if (calculated) {
          wartezeitStd = calculated.formattedTime;
        } else {
          warnings.push({
            field: 'wartezeitStd',
            message: 'Wartezeit konnte nicht berechnet werden (ungültiges Zeitformat).',
            severity: 'warning',
          });
        }
      } else {
        warnings.push({
          field: 'wartezeitStd',
          message: 'Wartezeit (Std) kann erst nach Eingabe des Personals berechnet werden.',
          severity: 'info',
        });
      }
    }

    // 4. Uncertainty warnings for UI highlighting
    for (const uField of uncertainFields) {
      if (!warnings.some((w) => w.field === uField)) {
        warnings.push({
          field: uField,
          message: `Handschrift bei "${uField}" unsicher erfasst. Bitte überprüfen.`,
          severity: 'warning',
        });
      }
    }

    return {
      rowOrder,
      date: row.date || '',
      containerNumber: row.containerNumber ? row.containerNumber.toUpperCase().trim() : '',
      fuss: row.fuss || '40',
      artikel: row.artikel || '',
      kartons: typeof row.kartons === 'number' ? row.kartons : parseInt(String(row.kartons || 0), 10) || undefined,
      termin: row.termin || '',
      ankunft: row.ankunft || '',
      start: row.start || '',
      ende: row.ende || '',
      personal: row.personal ?? undefined,
      wartezeitVon: row.wartezeitVon || '',
      wartezeitBis: row.wartezeitBis || '',
      wartezeitStd: wartezeitStd || '',
      wickel: row.wickel || '',
      preis: typeof row.preis === 'number' ? row.preis : parseFloat(String(row.preis || 0)) || undefined,
      ps: row.ps || '',
      extraTeam: row.extraTeam || '',
      bemerkung: row.bemerkung || '',
      warnings,
      uncertainFields,
    };
  }

  /**
   * Calculates wartezeit in minutes and hours: (bis - von) * personal
   * Example: 9:00 - 9:50 with 2 workers = 50 min * 2 = 100 min = 1:40
   */
  public calculateWartezeit(
    von: string,
    bis: string,
    personal: number,
  ): { totalMinutes: number; formattedTime: string; decimalHours: number } | null {
    const parseTime = (t: string): number | null => {
      const match = t.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      return hours * 60 + minutes;
    };

    const vonMin = parseTime(von);
    const bisMin = parseTime(bis);

    if (vonMin === null || bisMin === null || personal <= 0) {
      return null;
    }

    let diffMin = bisMin - vonMin;
    if (diffMin < 0) {
      // Overnight handling if any
      diffMin += 24 * 60;
    }

    const totalMinutes = Math.round(diffMin * personal);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const formattedTime = `${hours}:${mins.toString().padStart(2, '0')}`;
    const decimalHours = parseFloat((totalMinutes / 60).toFixed(2));

    return { totalMinutes, formattedTime, decimalHours };
  }

  /**
   * Provides realistic mock CTR-Liste data for offline testing or development.
   */
  private getMockExtraction(
    file: Express.Multer.File,
    site: string,
  ): { site: string; date: string; rows: Partial<ContainerListRowDto>[]; globalWarnings: string[] } {
    const today = new Date().toISOString().slice(0, 10);

    return {
      site,
      date: today,
      globalWarnings: [
        'Hinweis: KI-Mock-Modus aktiv (kein OPENAI_API_KEY). Vorlagendaten für Entwurfsprüfung geladen.',
      ],
      rows: [
        {
          date: '25.10.',
          containerNumber: 'YXEU1802671',
          fuss: '40',
          artikel: 'Bekleidung / Textil',
          kartons: 850,
          termin: '08:00',
          ankunft: '07:45',
          start: '08:15',
          ende: '11:15',
          personal: 2,
          wartezeitVon: '09:00',
          wartezeitBis: '09:50',
          wickel: '12 Pal.',
          preis: 420.0,
          ps: 'Standard',
          extraTeam: '',
          bemerkung: 'Pünktlich angeliefert',
          uncertainFields: [],
        },
        {
          date: '25.10.',
          containerNumber: 'MSKU9823410',
          fuss: '40',
          artikel: 'Schuhe / Kartons',
          kartons: 620,
          termin: '11:30',
          ankunft: '11:45',
          start: '12:00',
          ende: '14:30',
          personal: undefined, // Intentionally missing to test business rule warning
          wartezeitVon: '12:30',
          wartezeitBis: '13:00',
          wickel: '',
          preis: 380.0,
          ps: '',
          extraTeam: '',
          bemerkung: 'Verspätung durch LKW-Stau',
          uncertainFields: ['personal'],
        },
        {
          date: '25.10.',
          containerNumber: 'CMAU731?458', // Unclear handwriting simulation
          fuss: '20',
          artikel: 'Elektronik Zubehör',
          kartons: 410,
          termin: '14:00',
          ankunft: '14:00',
          start: '14:15',
          ende: '16:00',
          personal: 3,
          wartezeitVon: '',
          wartezeitBis: '',
          wickel: '8 Pal.',
          preis: 290.0,
          ps: '',
          extraTeam: 'Team B',
          bemerkung: 'Ziffer 5 in Containernummer schwer leserlich',
          uncertainFields: ['containerNumber'],
        },
      ],
    };
  }
}
