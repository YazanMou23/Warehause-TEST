import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { ConfigService } from '@nestjs/config';
import * as zlib from 'zlib';
import { ContainerListRowDto, FieldWarning } from './dto/container-list.dto';
import {
  CustomerMatchResult,
  calculateRowWaitingWorkerHours,
  extractRawCustomerFromText,
  formatGermanStd,
  matchCustomerSite,
  parseDurationToHours,
  splitWartezeitRange,
} from './customer-matcher';

export interface ExtractionResult {
  site: string;
  rawFileName: string;
  date?: string;
  rows: ContainerListRowDto[];
  globalWarnings: string[];
  /** true when rows come from the offline mock fallback, not a real extraction */
  simulated?: boolean;
  /** Detailed customer detection and matching result */
  customerDetection?: CustomerMatchResult;
}

@Injectable()
export class ContainerExtractorService {
  private readonly logger = new Logger(ContainerExtractorService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Main entry point to extract draft container list rows from an uploaded image, PDF, CSV, or XLSX.
   * STRICT: Does not save anything to the database.
   * - Automatically detects Kunde/customer from the uploaded document.
   * - Exact normalized match populates site; partial/ambiguous or unknown requires explicit confirmation.
   * - Never treats a default (e.g. Gant) as detected or silently overwrites an explicit manual choice.
   */
  async extractDraft(
    file: Express.Multer.File,
    requestedSite?: string,
  ): Promise<ExtractionResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const fileName = file.originalname || 'uploaded_document';
    const mimeType = file.mimetype || 'image/jpeg';

    const cleanRequestedSite =
      requestedSite && requestedSite.trim() && requestedSite.trim().toUpperCase() !== 'AUTO'
        ? requestedSite.trim()
        : undefined;

    this.logger.log(
      `Extracting container list from ${fileName} (${mimeType}, size: ${file.size} bytes, requestedSite=${cleanRequestedSite || 'AUTO'})...`,
    );

    let rawRows: Partial<ContainerListRowDto>[] = [];
    let rawDetectedCustomer: string | null = null;
    let docDate: string | undefined;
    let simulated = false;
    const globalWarnings: string[] = [];

    // Check if file is CSV/text that can be parsed deterministically without paid API
    const isCsv =
      mimeType === 'text/csv' ||
      mimeType === 'text/plain' ||
      fileName.toLowerCase().endsWith('.csv');

    if (isCsv && file.buffer && file.buffer.length > 0) {
      const csvParsed = this.parseCsvDocument(file.buffer.toString('utf-8'), fileName);
      rawRows = csvParsed.rows;
      rawDetectedCustomer = csvParsed.detectedCustomer;
      docDate = csvParsed.date;
    } else if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured. Running offline extraction engine.');
      const textHint = await this.tryExtractDocumentText(file);
      rawDetectedCustomer = extractRawCustomerFromText(textHint, fileName);
      const mockResult = this.getMockExtraction(file, cleanRequestedSite || '');
      rawRows = mockResult.rows;
      docDate = mockResult.date;
      simulated = true;
      globalWarnings.push(...mockResult.globalWarnings);
    } else {
      try {
        const aiResult = await this.callOpenAiVision(file, cleanRequestedSite);
        rawRows = aiResult.rows || [];
        rawDetectedCustomer =
          aiResult.kunde ||
          aiResult.customer ||
          aiResult.site ||
          extractRawCustomerFromText(aiResult.extractedText, fileName);
        docDate = aiResult.date;
        if (aiResult.globalWarnings) globalWarnings.push(...aiResult.globalWarnings);
      } catch (err: any) {
        this.logger.error(
          `OpenAI Vision failed: ${err.message}. Falling back to offline extraction.`,
        );
        globalWarnings.push(
          `KI-Extraktion fehlgeschlagen (${err.message}). Offline-Musterdaten geladen.`,
        );
        const textHint = await this.tryExtractDocumentText(file);
        rawDetectedCustomer = extractRawCustomerFromText(textHint, fileName);
        const fallback = this.getMockExtraction(file, cleanRequestedSite || '');
        rawRows = fallback.rows;
        docDate = fallback.date;
        simulated = true;
      }
    }

    const customerDetection = matchCustomerSite(rawDetectedCustomer);

    // Resolve site without silently defaulting to 'Gant' or overwriting an explicit user selection
    let resolvedSite = '';
    if (cleanRequestedSite) {
      // Preserve explicit manual selection
      resolvedSite = cleanRequestedSite;
      if (
        customerDetection.matchedSite &&
        customerDetection.matchedSite.toLowerCase() !== cleanRequestedSite.toLowerCase()
      ) {
        globalWarnings.push(
          `Hinweis: Im Dokument wurde Kunde "${customerDetection.detectedCustomerRaw}" (${customerDetection.matchedSite}) erkannt, Ihre manuelle Auswahl "${cleanRequestedSite}" wurde jedoch beibehalten.`,
        );
      } else if (
        customerDetection.matchType === 'unknown' &&
        customerDetection.detectedCustomerRaw
      ) {
        globalWarnings.push(
          `Hinweis: Im Dokument steht Kunde "${customerDetection.detectedCustomerRaw}" (unbekannt). Ihre manuelle Auswahl "${cleanRequestedSite}" bleibt aktiv.`,
        );
      }
    } else {
      if (customerDetection.matchType === 'exact' && customerDetection.matchedSite) {
        resolvedSite = customerDetection.matchedSite;
      } else {
        // Ambiguous, unknown, or none: do NOT silently default to Gant!
        resolvedSite = '';
        if (customerDetection.warning) {
          globalWarnings.push(customerDetection.warning);
        }
      }
    }

    // Apply strict business rules and calculations to every row
    const processedRows = rawRows.map((row, idx) =>
      this.applyBusinessRules(row, idx + 1),
    );

    return {
      site: resolvedSite,
      rawFileName: fileName,
      date: docDate || new Date().toISOString().slice(0, 10),
      rows: processedRows,
      globalWarnings,
      simulated,
      customerDetection,
    };
  }

  /**
   * Parses a CSV container list (such as LOXX or exported sheets) deterministically.
   */
  public parseCsvDocument(
    csvText: string,
    fileName?: string,
  ): {
    detectedCustomer: string | null;
    date?: string;
    rows: Partial<ContainerListRowDto>[];
  } {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return {
        detectedCustomer: extractRawCustomerFromText('', fileName),
        rows: [],
      };
    }

    // Simple CSV line splitter respecting quotes
    const splitCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());
    const findCol = (preds: string[]) =>
      headers.findIndex((h) => preds.some((p) => h.includes(p)));

    const idxDatum = findCol(['we-datum', 'datum']);
    const idxContainer = findCol(['container nr', 'containernr']);
    const idxFuss = findCol(['fuß', 'fuss']);
    const idxArtikel = findCol(['anzahl artikel', 'artikel']);
    const idxKartons = findCol(['anzahl kartons', 'karton']);
    const idxTermin = findCol(['termin']);
    const idxAnkunft = findCol(['ankunft']);
    const idxStart = findCol(['beginn der entladung', 'start', 'beginn']);
    const idxEnde = findCol(['ende der entladung', 'ende']);
    const idxPersonal = findCol(['personal']);
    const idxWartezeit = findCol(['wartezeit']);
    const idxKunde = findCol(['kunde']);
    const idxPreis = findCol(['preis']);
    const idxBemerkung = findCol(['bemerkung']);

    const rows: Partial<ContainerListRowDto>[] = [];
    let detectedCustomer: string | null = null;
    let firstDate: string | undefined;
    let lastSeenDate = '';

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const cNr = idxContainer >= 0 ? (cols[idxContainer] || '').trim() : '';
      const kundeVal = idxKunde >= 0 ? (cols[idxKunde] || '').trim() : '';

      // Skip summary rows ("Wartezeit", "Gesamt Wartezeit", "SUMME:")
      if (
        !cNr ||
        /^(wartezeit|gesamt\s+wartezeit|gesamt\s+personal|summe)/i.test(cNr) ||
        /^summe/i.test(kundeVal)
      ) {
        continue;
      }

      if (kundeVal && !detectedCustomer) {
        detectedCustomer = kundeVal;
      }

      const rawDate = idxDatum >= 0 ? (cols[idxDatum] || '').trim() : '';
      if (rawDate) {
        lastSeenDate = rawDate;
        if (!firstDate) firstDate = rawDate;
      }

      const rawWz = idxWartezeit >= 0 ? (cols[idxWartezeit] || '').trim() : '';
      const splitWz = splitWartezeitRange(rawWz, '');

      rows.push({
        date: rawDate || lastSeenDate,
        containerNumber: cNr,
        fuss: idxFuss >= 0 ? (cols[idxFuss] || '').trim() : '',
        artikel: idxArtikel >= 0 ? (cols[idxArtikel] || '').trim() : '',
        kartons:
          idxKartons >= 0 && cols[idxKartons]
            ? parseInt(cols[idxKartons], 10) || undefined
            : undefined,
        termin: idxTermin >= 0 ? (cols[idxTermin] || '').trim() : '',
        ankunft: idxAnkunft >= 0 ? (cols[idxAnkunft] || '').trim() : '',
        start: idxStart >= 0 ? (cols[idxStart] || '').trim() : '',
        ende: idxEnde >= 0 ? (cols[idxEnde] || '').trim() : '',
        personal:
          idxPersonal >= 0 && cols[idxPersonal]
            ? parseInt(cols[idxPersonal], 10) || undefined
            : undefined,
        wartezeitVon: splitWz.von || rawWz || '',
        wartezeitBis: splitWz.bis || '',
        preis:
          idxPreis >= 0 && cols[idxPreis]
            ? parseFloat(cols[idxPreis].replace(',', '.')) || undefined
            : undefined,
        bemerkung: idxBemerkung >= 0 ? (cols[idxBemerkung] || '').trim() : '',
      });
    }

    if (!detectedCustomer) {
      detectedCustomer = extractRawCustomerFromText(csvText, fileName);
    }

    return { detectedCustomer, date: firstDate, rows };
  }

  private async tryExtractDocumentText(file: Express.Multer.File): Promise<string> {
    if (!file?.buffer) return '';
    if (file.mimetype === 'application/pdf') {
      const res = await this.extractPdfTextSafe(file.buffer);
      return res.text;
    }
    if (file.mimetype?.startsWith('text/')) {
      return file.buffer.toString('utf-8');
    }
    return '';
  }

  /**
   * Extracts text from a PDF buffer using PDFParse, with a pure-Node zlib stream fallback
   * for environments (like Jest without --experimental-vm-modules) where pdfjs worker dynamic import fails.
   */
  private async extractPdfTextSafe(buffer: Buffer): Promise<{
    text: string;
    screenshotBuffer?: Buffer;
  }> {
    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      const pdfText = (textResult.text ?? '').trim();

      if (pdfText.length < 80) {
        const screenshot = await parser.getScreenshot({
          partial: [1],
          scale: 2,
          imageBuffer: true,
        });
        const firstPage = screenshot.pages?.[0];
        if (firstPage?.data) {
          return {
            text: pdfText,
            screenshotBuffer: Buffer.from(firstPage.data as any),
          };
        }
      }
      return { text: pdfText };
    } catch (err: any) {
      this.logger.warn(
        `PDFParse worker unavailable (${err?.message}), using built-in stream text extraction fallback.`,
      );
      const fallbackText = this.extractPdfTextFromStreams(buffer);
      return { text: fallbackText };
    } finally {
      if (parser) await parser.destroy().catch(() => {});
    }
  }

  /**
   * Pure-Node fallback to extract text from PDF FlateDecode / raw content streams.
   */
  private extractPdfTextFromStreams(buffer: Buffer): string {
    const rawLatin1 = buffer.toString('latin1');
    const chunks: string[] = [];

    const decodeContentOps = (content: string) => {
      // Decode hex strings <435452...> used by PDFKit
      const hexParts: string[] = [];
      const hexMatches = content.matchAll(/<([0-9a-fA-F]{2,})>/g);
      for (const m of hexMatches) {
        const hex = m[1];
        if (hex.length % 2 === 0) {
          const decoded = Buffer.from(hex, 'hex')
            .toString('latin1')
            .replace(/[^\x20-\x7EäöüÄÖÜß]/g, '');
          if (decoded.length > 0) {
            hexParts.push(decoded);
          }
        }
      }
      if (hexParts.length > 0) {
        chunks.push(hexParts.join(''));
      }
      // Decode literal strings (...)
      const litMatches = content.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g);
      for (const m of litMatches) {
        const txt = m[1].replace(/\\(.)/g, '$1').trim();
        if (txt.length > 1) {
          chunks.push(txt);
        }
      }
    };

    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match: RegExpExecArray | null;
    while ((match = streamRegex.exec(rawLatin1)) !== null) {
      const streamBytes = Buffer.from(match[1], 'latin1');
      try {
        const inflated = zlib.inflateSync(streamBytes).toString('latin1');
        decodeContentOps(inflated);
      } catch {
        decodeContentOps(match[1]);
      }
    }

    return chunks.join(' ').trim();
  }

  /**
   * Calls OpenAI GPT-4o Vision to extract tabular CTR-Liste data.
   */
  private async callOpenAiVision(
    file: Express.Multer.File,
    requestedSite?: string,
  ): Promise<{
    site?: string;
    kunde?: string;
    customer?: string;
    date?: string;
    rows: any[];
    globalWarnings?: string[];
    extractedText?: string;
  }> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    const prompt = `You are a specialized Logistics OCR & Vision AI for German Container Unloading Lists (CTR-Liste).
Analyze the uploaded photo or scan of the container list and extract all container rows into structured JSON.

CLIENT SITE HINT: ${requestedSite || 'Read exact Kunde/customer name from the document (known sites: Gant, Brooks, Schwalbe, WE-Britax, Medisana, Zwilling, ProHeq, LOXX). Do NOT guess if missing.'}

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
- Never invent numbers, customer names, or text.
- Read the exact customer name from the "Kunde" column or sheet header and return it in "site" (or null if no customer is visible).
- If a digit or word is unclear/handwritten, provide your best reading and include the field name in "uncertainFields" array for that row.
- If worker count (personal) is not clearly readable, return null for personal and include "personal" in uncertainFields.
- Return ONLY valid JSON with this structure:
{
  "site": "exact customer name from document or null",
  "date": "YYYY-MM-DD",
  "rows": [...],
  "globalWarnings": [...]
}`;

    let imageBuffer: Buffer = file.buffer;
    let imageMime =
      file.mimetype && file.mimetype.startsWith('image/') ? file.mimetype : null;
    let pdfText = '';

    if (file.mimetype === 'application/pdf') {
      const extracted = await this.extractPdfTextSafe(file.buffer);
      pdfText = extracted.text;
      if (pdfText.length < 80 && extracted.screenshotBuffer) {
        imageBuffer = extracted.screenshotBuffer;
        imageMime = 'image/png';
        pdfText = '';
        this.logger.log('Scanned PDF: rendered page 1 to image for vision extraction.');
      } else if (pdfText.length >= 80) {
        this.logger.log(
          `Digital PDF: extracted ${pdfText.length} chars of text for text-based extraction.`,
        );
      }
    }

    if (!imageMime && !pdfText) {
      throw new Error(`Unsupported or unreadable file type: ${file.mimetype}`);
    }

    const userContent: any[] = [{ type: 'text', text: prompt }];
    if (pdfText) {
      userContent.push({
        type: 'text',
        text: `\n\nDOCUMENT TEXT (extracted from PDF):\n${pdfText}`,
      });
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
    const parsed = JSON.parse(content || '{}');
    return {
      ...parsed,
      extractedText: pdfText,
    };
  }

  /**
   * Applies business rules to an extracted row:
   * - Splits combined wartezeitVon ("09:00 bis 09:50" / "08:00-09:30") if needed
   * - Calculates wartezeitStd = (bis - von) * personal - deductions
   * - Validates worker count and flags unclear time formats
   * - Checks container number format
   */
  public applyBusinessRules(
    row: Partial<ContainerListRowDto>,
    rowOrder: number,
  ): ContainerListRowDto {
    const warnings: FieldWarning[] = [...(row.warnings || [])];
    const uncertainFields: string[] = [...(row.uncertainFields || [])];

    // Normalize combined Wartezeit Von-Bis if passed in wartezeitVon
    let wartezeitVon = row.wartezeitVon || '';
    let wartezeitBis = row.wartezeitBis || '';
    if (wartezeitVon && !wartezeitBis) {
      const split = splitWartezeitRange(wartezeitVon, '');
      if (split.von && split.bis && !split.isUnclear) {
        wartezeitVon = split.von;
        wartezeitBis = split.bis;
      }
    }

    // 1. Worker count validation
    if (
      row.personal === undefined ||
      row.personal === null ||
      isNaN(row.personal) ||
      row.personal <= 0
    ) {
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

    // 3. Wartezeit calculation: (bis - von) * personal - anderweitigeArbeiten
    let wartezeitStd: string | undefined = row.wartezeitStd;

    if (wartezeitVon || wartezeitBis) {
      const calc = calculateRowWaitingWorkerHours({
        personal: row.personal,
        wartezeitVon,
        wartezeitBis,
        wartezeitStd: row.wartezeitStd,
        anderweitigeArbeiten: row.anderweitigeArbeiten,
      });

      if (calc.warnings.length > 0) {
        for (const wMsg of calc.warnings) {
          warnings.push({
            field: 'wartezeitStd',
            message: wMsg,
            severity: 'warning',
          });
        }
        if (!uncertainFields.includes('wartezeitStd')) uncertainFields.push('wartezeitStd');
      } else if (row.personal && row.personal > 0) {
        wartezeitStd = formatGermanStd(calc.workerHours).replace(/\s*Std\.$/, '');
      }
    } else if (wartezeitStd) {
      const parsedDur = parseDurationToHours(wartezeitStd);
      if (parsedDur.isUnclear) {
        warnings.push({
          field: 'wartezeitStd',
          message: parsedDur.reason || `Unklares Format bei Wartezeit "${wartezeitStd}".`,
          severity: 'warning',
        });
        if (!uncertainFields.includes('wartezeitStd')) uncertainFields.push('wartezeitStd');
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
      kartons:
        typeof row.kartons === 'number'
          ? row.kartons
          : parseInt(String(row.kartons || 0), 10) || undefined,
      termin: row.termin || '',
      ankunft: row.ankunft || '',
      start: row.start || '',
      ende: row.ende || '',
      personal: row.personal ?? undefined,
      wartezeitVon,
      wartezeitBis,
      wartezeitStd: wartezeitStd || '',
      wickel: row.wickel || '',
      preis:
        typeof row.preis === 'number'
          ? row.preis
          : parseFloat(String(row.preis || 0)) || undefined,
      ps: row.ps || '',
      extraTeam: row.extraTeam || '',
      bemerkung: row.bemerkung || '',
      anderweitigeArbeiten: row.anderweitigeArbeiten || [],
      warnings,
      uncertainFields,
    };
  }

  /**
   * Calculates wartezeit in minutes and hours: (bis - von) * personal
   * Example: 9:00 - 9:50 with 2 workers = 50 min * 2 = 100 min = 1:40 (1.67 decimal hours)
   */
  public calculateWartezeit(
    von: string,
    bis: string,
    personal: number,
  ): {
    totalMinutes: number;
    formattedTime: string;
    decimalHours: number;
    germanDecimal: string;
  } | null {
    const split = splitWartezeitRange(von, bis);
    if (split.isUnclear || !split.von || !split.bis || personal <= 0) {
      return null;
    }

    const parseTime = (t: string): number | null => {
      const match = t.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      return hours * 60 + minutes;
    };

    const vonMin = parseTime(split.von);
    const bisMin = parseTime(split.bis);

    if (vonMin === null || bisMin === null || bisMin < vonMin) {
      return null;
    }

    const diffMin = bisMin - vonMin;
    const totalMinutes = Math.round(diffMin * personal);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const formattedTime = `${hours}:${mins.toString().padStart(2, '0')}`;
    const decimalHours = parseFloat((totalMinutes / 60).toFixed(2));
    const germanDecimal = formatGermanStd(totalMinutes / 60).replace(/\s*Std\.$/, '');

    return { totalMinutes, formattedTime, decimalHours, germanDecimal };
  }

  /**
   * Provides realistic mock CTR-Liste data for offline testing or development.
   */
  private getMockExtraction(
    file: Express.Multer.File,
    site: string,
  ): {
    site: string;
    date: string;
    rows: Partial<ContainerListRowDto>[];
    globalWarnings: string[];
  } {
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
          personal: undefined,
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
          containerNumber: 'CMAU731?458',
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
