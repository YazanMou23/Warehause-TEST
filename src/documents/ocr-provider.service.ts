import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OcrExtractionResult {
  text: string;
  language: string;
  confidence: number;
  provider: string;
}

@Injectable()
export class OcrProviderService {
  private readonly logger = new Logger(OcrProviderService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Run OCR extraction on one or more image buffers or base64 pages.
   * Supports German ('de'), English ('en'), Arabic ('ar'), and Turkish ('tr').
   */
  async extractText(
    pageBuffers: { buffer: Buffer; mimeType: string }[],
    requestedLanguage: string = 'de',
  ): Promise<OcrExtractionResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured. Returning fallback OCR text.');
      return {
        text: `[OCR Fallback - ${requestedLanguage.toUpperCase()}] Text extraction processed in offline mode.`,
        language: requestedLanguage,
        confidence: 0.85,
        provider: 'OFFLINE_FALLBACK',
      };
    }

    try {
      const languageInstructions: Record<string, string> = {
        de: 'Extrahiere den gesamten Text auf Deutsch exakt wie im Dokument sichtbar.',
        en: 'Extract all visible text in English exactly as seen in the document.',
        ar: 'قم باستخراج كل النص المكتوب باللغة العربية بدقة عالية كما هو ظاهر.',
        tr: 'Belgedeki Türkçe metni tam olarak göründüğü gibi çıkarınız.',
      };

      const langInstruction =
        languageInstructions[requestedLanguage] ||
        languageInstructions.de;

      // Construct OpenAI Vision messages with all document pages
      const imageContents = pageBuffers.map((p) => ({
        type: 'image_url',
        image_url: {
          url: `data:${p.mimeType};base64,${p.buffer.toString('base64')}`,
          detail: 'high',
        },
      }));

      const prompt = `You are a high-accuracy OCR optical character recognition engine.
${langInstruction}

INSTRUCTIONS:
1. Extract ALL textual information including headers, tables, numbers, stamps, dates, addresses, and line items.
2. Maintain reading order and tabular layout structure.
3. Do not add conversational commentary or markdown explanation.
4. Output ONLY the raw extracted text.`;

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
          max_tokens: 3500,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI OCR API ${response.status}: ${errText}`);
      }

      const result = await response.json();
      const extractedText = result.choices?.[0]?.message?.content?.trim() || '';

      return {
        text: extractedText,
        language: requestedLanguage,
        confidence: 0.98,
        provider: 'OPENAI_VISION_4O',
      };
    } catch (err: any) {
      this.logger.error(`OCR Extraction failed: ${err.message}`, err.stack);
      return {
        text: `[OCR Error: ${err.message}]`,
        language: requestedLanguage,
        confidence: 0.5,
        provider: 'ERROR_FALLBACK',
      };
    }
  }
}
