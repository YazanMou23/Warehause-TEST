import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrExtractionType } from './dto/ocr-upload.dto';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly configService: ConfigService) {}

  async processFile(file: Express.Multer.File, type: OcrExtractionType) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type — Vision API supports images only
    const isImage = file.mimetype.startsWith('image/');
    const isPdf = file.mimetype === 'application/pdf';

    if (!isImage && !isPdf) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Please upload a JPG, PNG, or PDF file.`,
      );
    }

    if (isPdf) {
      // PDFs can't be sent directly to Vision API — use sandbox fallback with clear warning
      this.logger.warn(`PDF upload received: ${file.originalname}. PDFs are not natively supported by Vision API. Returning sandbox result.`);
      return {
        ...this.getSandboxFallback(file.originalname, type),
        warning: 'PDF files cannot be processed directly by the Vision API. Please convert your PDF to an image (JPG or PNG) for best OCR accuracy. Showing sandbox demo data.',
      };
    }

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not configured. Running OCR service in sandbox/fallback mode.');
      return this.getSandboxFallback(file.originalname, type);
    }

    try {
      const base64Data = file.buffer.toString('base64');
      const mimeType = file.mimetype;

      let prompt = '';
      if (type === OcrExtractionType.CONTAINERS) {
        prompt = `You are a logistics data extraction system. Extract all shipping container numbers and their status (FULL or EMPTY) from this document. 
Return ONLY a JSON object with this format: 
{
  "type": "CONTAINERS",
  "data": [
    {
      "containerNumber": "ABCD1234567",
      "status": "FULL"
    }
  ]
}`;
      } else {
        prompt = `You are a timesheet data extraction system. Extract employee names, start times, and end times. 
Return ONLY a JSON object with this format: 
{
  "type": "TIMESHEETS",
  "data": [
    {
      "employeeName": "John Doe",
      "startTime": "08:00",
      "endTime": "17:00"
    }
  ]
}`;
      }

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Data}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`OpenAI Vision API error: ${errorText}`);
        throw new Error(`OpenAI Vision API returned status ${response.status}`);
      }

      const result = await response.json();
      const contentStr = result.choices?.[0]?.message?.content;
      if (!contentStr) {
        throw new Error('No content returned from OpenAI Vision API');
      }

      return JSON.parse(contentStr);
    } catch (error: any) {
      this.logger.error(`OCR processing failed: ${error.message}. Falling back to sandbox mode.`);
      return this.getSandboxFallback(file.originalname, type, error.message);
    }
  }

  private getSandboxFallback(filename: string, type: OcrExtractionType, errorMessage?: string) {
    // Attempt some basic regex extraction from filename to make it feel responsive
    if (type === OcrExtractionType.CONTAINERS) {
      const match = filename.match(/[A-Z]{3,4}\d{6,7}/i);
      const extractedNumber = match ? match[0].toUpperCase() : 'HLXU8472910';

      return {
        type: 'CONTAINERS',
        sandbox: true,
        warning: errorMessage ? `API failed (${errorMessage}). Fallback active.` : 'Running in sandbox mode.',
        data: [
          {
            containerNumber: extractedNumber,
            status: 'FULL',
          },
          {
            containerNumber: 'MSCU1284920',
            status: 'EMPTY',
          },
        ],
      };
    } else {
      return {
        type: 'TIMESHEETS',
        sandbox: true,
        warning: errorMessage ? `API failed (${errorMessage}). Fallback active.` : 'Running in sandbox mode.',
        data: [
          {
            employeeName: 'Max Mustermann',
            startTime: '08:00',
            endTime: '16:30',
          },
          {
            employeeName: 'Sabine Schmitz',
            startTime: '07:45',
            endTime: '15:15',
          },
        ],
      };
    }
  }
}
