import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TimesheetService } from '../timesheet/timesheet.service';
import { ScanSettingsDto, ColorMode, ScanFormat } from './dto/scan-settings.dto';

/** eSCL XML namespaces */
const NS_SCAN = 'http://schemas.hp.com/imaging/escl/2011/05/03';
const NS_PWG  = 'http://www.pwg.org/schemas/2010/12/sm';

/** A4 paper dimensions in pixels at a given DPI */
function a4Pixels(dpi: number) {
  return {
    width:  Math.round((210 / 25.4) * dpi),  // 210mm
    height: Math.round((297 / 25.4) * dpi),  // 297mm
  };
}

/** Simple XML tag extractor — avoids pulling in an XML parser dependency */
function extractXmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function extractAllXmlTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

export interface ScannerStatusResult {
  online: boolean;
  state?: string;  // 'Idle' | 'Processing' | 'Stopped'
  error?: string;
}

export interface ScannerCapabilities {
  supportedDpi: number[];
  colorModes: string[];
  inputSources: string[];
  documentFormats: string[];
  maxWidth?: number;
  maxHeight?: number;
}

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly timesheetService: TimesheetService,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private resolveBase(ip?: string, port?: number): string {
    const resolvedIp   = ip   ?? this.config.get<string>('SCANNER_IP');
    const resolvedPort = port ?? parseInt(this.config.get<string>('SCANNER_PORT') ?? '80', 10);

    if (!resolvedIp) {
      throw new BadRequestException(
        'Kein Scanner konfiguriert. Bitte SCANNER_IP in .env setzen oder scannerIp im Request-Body übergeben.',
      );
    }

    return `http://${resolvedIp}:${resolvedPort}`;
  }

  private eSclUrl(base: string, path: string): string {
    return `${base}/eSCL/${path}`;
  }

  private colorModeXml(mode: ColorMode): string {
    const map: Record<ColorMode, string> = {
      Color:         'RGB24',
      Grayscale:     'Grayscale8',
      BlackAndWhite: 'BlackAndWhite1',
    };
    return map[mode];
  }

  private mimeType(format: ScanFormat): string {
    return format === 'png' ? 'image/png' : 'image/jpeg';
  }

  /** Build the eSCL ScanJobs XML payload */
  private buildScanJobXml(settings: {
    dpi: number;
    colorMode: ColorMode;
    format: ScanFormat;
    inputSource: 'Platen' | 'Feeder';
  }): string {
    const { width, height } = a4Pixels(settings.dpi);
    return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings
  xmlns:scan="${NS_SCAN}"
  xmlns:pwg="${NS_PWG}">
  <pwg:Version>2.6</pwg:Version>
  <scan:Intent>Document</scan:Intent>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:Height>${height}</pwg:Height>
      <pwg:Width>${width}</pwg:Width>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>${settings.inputSource}</pwg:InputSource>
  <scan:ColorMode>${this.colorModeXml(settings.colorMode)}</scan:ColorMode>
  <scan:XResolution>${settings.dpi}</scan:XResolution>
  <scan:YResolution>${settings.dpi}</scan:YResolution>
  <pwg:DocumentFormat>${this.mimeType(settings.format)}</pwg:DocumentFormat>
</scan:ScanSettings>`;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Check if the scanner is reachable and its current state (Idle / Processing / Stopped).
   */
  async checkStatus(ip?: string, port?: number): Promise<ScannerStatusResult> {
    const base = this.resolveBase(ip, port);
    const url  = this.eSclUrl(base, 'ScannerStatus');

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5-second timeout
      });

      if (!response.ok) {
        return { online: false, error: `HTTP ${response.status}` };
      }

      const xml   = await response.text();
      const state = extractXmlTag(xml, 'State') ?? 'Unknown';

      this.logger.log(`Scanner at ${base} is online — state: ${state}`);
      return { online: true, state };
    } catch (err: any) {
      this.logger.warn(`Scanner at ${base} unreachable: ${err.message}`);
      return { online: false, error: err.message };
    }
  }

  /**
   * Fetch the scanner's advertised capabilities: supported DPI, color modes, formats.
   */
  async getCapabilities(ip?: string, port?: number): Promise<ScannerCapabilities> {
    const base = this.resolveBase(ip, port);
    const url  = this.eSclUrl(base, 'ScannerCapabilities');

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Scanner-Fähigkeiten konnten nicht abgerufen werden (HTTP ${response.status})`,
      );
    }

    const xml = await response.text();

    // Extract supported DPI values
    const xRes = extractAllXmlTags(xml, 'XResolution').map(Number).filter(Boolean);
    const yRes = extractAllXmlTags(xml, 'YResolution').map(Number).filter(Boolean);
    const dpis = [...new Set([...xRes, ...yRes])].sort((a, b) => a - b);

    // Extract color modes
    const colorModes = extractAllXmlTags(xml, 'ColorMode');

    // Extract input sources
    const inputSources = extractAllXmlTags(xml, 'InputSource');

    // Extract document formats
    const formats = extractAllXmlTags(xml, 'DocumentFormat');

    // Extract max dimensions
    const maxWidthStr  = extractXmlTag(xml, 'MaxWidth');
    const maxHeightStr = extractXmlTag(xml, 'MaxHeight');

    return {
      supportedDpi:    dpis.length > 0 ? dpis : [75, 150, 300, 600],
      colorModes:      colorModes.length > 0 ? colorModes : ['Grayscale8', 'RGB24'],
      inputSources:    inputSources.length > 0 ? inputSources : ['Platen'],
      documentFormats: formats.length > 0 ? formats : ['image/jpeg'],
      maxWidth:        maxWidthStr ? parseInt(maxWidthStr) : undefined,
      maxHeight:       maxHeightStr ? parseInt(maxHeightStr) : undefined,
    };
  }

  /**
   * Trigger a scan job via eSCL and return the raw image as a Buffer.
   * Steps:
   *   1. POST /eSCL/ScanJobs        → scanner queues job, returns Location header
   *   2. GET  /eSCL/ScanJobs/{id}/NextDocument → download image bytes
   */
  async triggerScan(settings: ScanSettingsDto): Promise<{ buffer: Buffer; mimeType: string }> {
    const base = this.resolveBase(settings.scannerIp, settings.scannerPort);

    // Resolve defaults
    const dpi         = settings.dpi         ?? parseInt(this.config.get('SCANNER_DPI') ?? '300', 10);
    const colorMode   = settings.colorMode   ?? 'Grayscale';
    const format      = settings.format      ?? 'jpeg';
    const inputSource = settings.inputSource ?? 'Platen';

    this.logger.log(`Triggering scan: ${base} | ${dpi}DPI | ${colorMode} | ${format} | source:${inputSource}`);

    // ── Step 1: Create scan job ──────────────────────────────────────────
    const jobsUrl = this.eSclUrl(base, 'ScanJobs');
    const xmlBody = this.buildScanJobXml({ dpi, colorMode, format, inputSource });

    const jobResponse = await fetch(jobsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xmlBody,
      signal: AbortSignal.timeout(15000),
    });

    if (!jobResponse.ok) {
      const errBody = await jobResponse.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Scanner hat den Scan-Job abgelehnt (HTTP ${jobResponse.status}): ${errBody}`,
      );
    }

    // The scanner returns Location: /eSCL/ScanJobs/{jobId}
    const locationHeader = jobResponse.headers.get('location');
    if (!locationHeader) {
      throw new ServiceUnavailableException(
        'Scanner hat keinen Job-Speicherort zurückgegeben (kein Location-Header)',
      );
    }

    // ── Step 2: Download the scanned document ────────────────────────────
    // locationHeader is an absolute path, e.g. /eSCL/ScanJobs/1
    const docUrl = `${base}${locationHeader}/NextDocument`;

    this.logger.log(`Fetching scanned document from: ${docUrl}`);

    // Retry up to 5 times (scanner may need a moment to prepare the document)
    let imageResponse: Response | null = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      await new Promise((r) => setTimeout(r, attempt * 800)); // progressive back-off

      const resp = await fetch(docUrl, {
        signal: AbortSignal.timeout(30000),
      });

      if (resp.ok) {
        imageResponse = resp;
        break;
      }

      this.logger.warn(`Attempt ${attempt}: scanner returned HTTP ${resp.status} for NextDocument`);
    }

    if (!imageResponse) {
      throw new ServiceUnavailableException(
        'Scanner hat das Dokument nicht bereitgestellt. Ist das Gerät bereit und liegt ein Dokument auf dem Glast?',
      );
    }

    const arrayBuf = await imageResponse.arrayBuffer();
    const buffer   = Buffer.from(arrayBuf);
    const mime     = this.mimeType(format);

    this.logger.log(`Scan complete — received ${buffer.length} bytes (${mime})`);
    return { buffer, mimeType: mime };
  }

  /**
   * Full pipeline: trigger scanner → OCR → create PENDING_REVIEW timesheet.
   * Returns the same shape as POST /timesheets/scan (upload flow).
   */
  async scanToTimesheet(settings: ScanSettingsDto, actorId: string) {
    // 1. Scan the document
    const { buffer, mimeType } = await this.triggerScan(settings);

    // 2. Build a Multer-compatible File object so we can reuse TimesheetService.scanAndCreate()
    const fakeFile: Express.Multer.File = {
      buffer,
      mimetype:     mimeType,
      originalname: `scanner-${Date.now()}.${settings.format ?? 'jpeg'}`,
      fieldname:    'file',
      encoding:     '7bit',
      size:         buffer.length,
      destination:  '',
      filename:     '',
      path:         '',
      stream:       null as any,
    };

    // 3. Run OCR + create timesheet (identical to the file-upload path)
    return this.timesheetService.scanAndCreate(fakeFile, actorId);
  }
}
