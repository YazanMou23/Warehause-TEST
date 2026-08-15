import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  StructuredCrmExtraction,
  DocumentClassificationType,
} from './dto/extracted-data.dto';

@Injectable()
export class DocumentAnalyzerService {
  private readonly logger = new Logger(DocumentAnalyzerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Run structured schema extraction and CRM entity resolution on document text & images.
   */
  async analyzeDocument(
    ocrText: string,
    pageBuffers: { buffer: Buffer; mimeType: string }[],
  ): Promise<StructuredCrmExtraction> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured. Generating offline structured fallback.');
      return this.generateOfflineFallback(ocrText);
    }

    try {
      const prompt = `You are a Principal Document Intelligence & CRM Extractor for an Enterprise Logistics & Operations Hub.

TASK:
Analyze the document (OCR text + page images) and extract comprehensive, validated CRM information.

DOCUMENT TYPES:
- INVOICE (Rechnung)
- CONTRACT (Vertrag)
- OFFER (Angebot)
- TIMESHEET (Stundenzettel)
- CONTAINER_LIST (Containerliste / Ladeliste)
- DELIVERY_NOTE (Lieferschein)
- APPLICATION (Bewerbung / Antrag)
- ID_DOCUMENT (Ausweis / Pass / Führerschein)
- CUSTOMS_DECLARATION (Zollerklärung)
- OTHER (Sonstiges)

EXTRACTION RULES:
1. documentType: Exactly one of the types above.
2. companyName: Company / Vendor / Customer / Supplier name.
3. contactPerson: Cleaned person name (remove prefixes like "Herr", "Frau", "Name:").
4. email: Extracted email address if present.
5. phone: Standardized telephone number.
6. address: Street, postal code, city, country.
7. documentDate: Date in format YYYY-MM-DD.
8. referenceNumber: Invoice #, Contract #, Container # (e.g. MSKU1234567), Timesheet ID, etc.
9. totalAmount: Decimal total amount without currency symbols (e.g. 1420.50).
10. currency: Standard 3-letter currency (EUR, USD, GBP, CHF, TRY, etc.).
11. summary: Concise 2-3 sentence executive summary of document contents in German or English.
12. lineItems: Array of { description, quantity, unitPrice, totalPrice } if itemized table exists.
13. keyDetails: Object with important key-value pairs specific to this document type.

OCR TEXT CONTEXT:
"""
${ocrText.slice(0, 8000)}
"""

OUTPUT REQUIREMENT:
Return strictly a valid JSON object matching the requested schema. No markdown backticks or commentary.`;

      const imageContents = pageBuffers.slice(0, 3).map((p) => ({
        type: 'image_url',
        image_url: {
          url: `data:${p.mimeType};base64,${p.buffer.toString('base64')}`,
          detail: 'high',
        },
      }));

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
              content: [{ type: 'text', text: prompt }, ...imageContents],
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 3000,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI Analysis API ${response.status}: ${errText}`);
      }

      const result = await response.json();
      const contentStr = result.choices?.[0]?.message?.content;
      if (!contentStr) throw new Error('No content returned from AI analyzer');

      const parsed = JSON.parse(contentStr);
      const validated = this.sanitizeAndValidateExtraction(parsed);

      // Perform CRM Entity matching against database
      const matchedEntities = await this.matchCrmEntities(validated, ocrText);
      validated.matchedEntities = matchedEntities;

      return validated;
    } catch (err: any) {
      this.logger.error(`AI Document Analysis failed: ${err.message}`, err.stack);
      return this.generateOfflineFallback(ocrText, err.message);
    }
  }

  /**
   * Validate and sanitize AI extraction output against expected schema.
   */
  private sanitizeAndValidateExtraction(raw: any): StructuredCrmExtraction {
    const validTypes: DocumentClassificationType[] = [
      'INVOICE',
      'CONTRACT',
      'OFFER',
      'TIMESHEET',
      'CONTAINER_LIST',
      'DELIVERY_NOTE',
      'APPLICATION',
      'ID_DOCUMENT',
      'CUSTOMS_DECLARATION',
      'OTHER',
    ];

    const rawType = String(raw.documentType || '').toUpperCase() as DocumentClassificationType;
    const documentType = validTypes.includes(rawType) ? rawType : 'OTHER';

    let totalAmount: number | undefined = undefined;
    if (raw.totalAmount !== undefined && raw.totalAmount !== null && raw.totalAmount !== '') {
      const num = typeof raw.totalAmount === 'number' ? raw.totalAmount : parseFloat(String(raw.totalAmount).replace(/[^0-9.-]/g, ''));
      if (!isNaN(num)) totalAmount = num;
    }

    return {
      documentType,
      confidence: typeof raw.confidence === 'number' ? Math.min(Math.max(raw.confidence, 0), 1) : 0.95,
      language: typeof raw.language === 'string' ? raw.language : 'de',
      companyName: raw.companyName ? String(raw.companyName).trim() : undefined,
      contactPerson: raw.contactPerson ? String(raw.contactPerson).trim() : undefined,
      email: raw.email ? String(raw.email).trim() : undefined,
      phone: raw.phone ? String(raw.phone).trim() : undefined,
      address: raw.address ? String(raw.address).trim() : undefined,
      documentDate: raw.documentDate ? this.normalizeDate(raw.documentDate) : undefined,
      referenceNumber: raw.referenceNumber ? String(raw.referenceNumber).trim() : undefined,
      totalAmount,
      currency: raw.currency ? String(raw.currency).toUpperCase().trim() : 'EUR',
      summary: raw.summary ? String(raw.summary).trim() : 'Dokument erfasst und strukturiert extrahiert.',
      keyDetails: typeof raw.keyDetails === 'object' && raw.keyDetails !== null ? raw.keyDetails : {},
      lineItems: Array.isArray(raw.lineItems)
        ? raw.lineItems.map((item: any) => ({
            description: String(item.description || item.name || 'Position'),
            quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
            unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : undefined,
            totalPrice: typeof item.totalPrice === 'number' ? item.totalPrice : undefined,
          }))
        : undefined,
    };
  }

  /**
   * Match extracted fields against existing database CRM entities (Users, Containers, Warehouses, Halls).
   */
  private async matchCrmEntities(
    extracted: StructuredCrmExtraction,
    ocrText: string,
  ): Promise<StructuredCrmExtraction['matchedEntities']> {
    const matched: StructuredCrmExtraction['matchedEntities'] = {};

    try {
      // 1. Match Employee if contactPerson or timesheet name is found
      const candidateName = extracted.contactPerson || '';
      if (candidateName.length >= 3) {
        const users = await this.prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        });

        const target = candidateName.toLowerCase();
        const exactMatch = users.find((u) => u.name.toLowerCase() === target);
        if (exactMatch) {
          matched.employee = { id: exactMatch.id, name: exactMatch.name, confidence: 'exact' };
        } else {
          // Partial / word match
          const words = target.split(/\s+/).filter((w) => w.length > 2);
          const fuzzyMatch = users.find((u) => {
            const uName = u.name.toLowerCase();
            return words.some((w) => uName.includes(w));
          });
          if (fuzzyMatch) {
            matched.employee = { id: fuzzyMatch.id, name: fuzzyMatch.name, confidence: 'fuzzy' };
          }
        }
      }

      // 2. Match Container if referenceNumber looks like ISO 6346 (4 letters + 7 digits)
      const containerCandidate = (extracted.referenceNumber || '').replace(/\s/g, '').toUpperCase();
      const isIsoContainer = /^[A-Z]{4}\d{6,7}$/.test(containerCandidate);
      if (isIsoContainer) {
        const existingContainer = await this.prisma.container.findFirst({
          where: { containerNumber: containerCandidate },
          select: { id: true, containerNumber: true },
        });
        if (existingContainer) {
          matched.container = existingContainer;
        }
      }

      // 3. Match Warehouse / Hall from OCR text or keyDetails
      const warehouses = await this.prisma.warehouse.findMany({
        select: { id: true, name: true },
      });
      for (const wh of warehouses) {
        if (ocrText.toLowerCase().includes(wh.name.toLowerCase())) {
          matched.warehouse = wh;
          break;
        }
      }
    } catch (e: any) {
      this.logger.warn(`Entity matching skipped or failed: ${e.message}`);
    }

    return matched;
  }

  private normalizeDate(raw: any): string {
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const deMatch = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (deMatch) return `${deMatch[3]}-${deMatch[2].padStart(2, '0')}-${deMatch[1].padStart(2, '0')}`;

    return new Date().toISOString().split('T')[0];
  }

  private generateOfflineFallback(ocrText: string, errorMsg?: string): StructuredCrmExtraction {
    const isTimesheet = /stundenzettel|arbeitszeit|woche|monat/i.test(ocrText);
    const isContainer = /[A-Z]{4}\d{7}/i.test(ocrText);
    const isInvoice = /rechnung|invoice|betrag|eur|steuer/i.test(ocrText);

    let docType: DocumentClassificationType = 'OTHER';
    if (isTimesheet) docType = 'TIMESHEET';
    else if (isContainer) docType = 'CONTAINER_LIST';
    else if (isInvoice) docType = 'INVOICE';

    return {
      documentType: docType,
      confidence: 0.85,
      language: 'de',
      summary: errorMsg
        ? `Dokument erfasst (Offline-Modus: ${errorMsg}).`
        : 'Dokument erfolgreich erfasst und im Offline-Modus analysiert.',
      documentDate: new Date().toISOString().split('T')[0],
      keyDetails: {
        rawLength: ocrText.length,
        detectedType: docType,
      },
    };
  }
}
