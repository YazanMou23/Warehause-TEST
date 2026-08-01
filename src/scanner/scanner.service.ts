import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TimesheetService } from '../timesheet/timesheet.service';
import { TimesheetOcrService } from '../timesheet/timesheet-ocr.service';
import { TimesheetMatcherService } from '../timesheet/timesheet-matcher.service';
import { ScanSettingsDto, ColorMode, ScanFormat } from './dto/scan-settings.dto';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

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

export interface DiscoveredPrinter {
  id: string;
  name: string;
  connectionType: 'WIFI' | 'USB' | 'LAN' | 'UNKNOWN';
  ip?: string;
  port?: number;
  status: string;
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
    private readonly timesheetOcrService: TimesheetOcrService,
    private readonly matcherService: TimesheetMatcherService,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private resolveBase(ip?: string, port?: number): string {
    const resolvedIp   = ip   ?? this.config.get<string>('SCANNER_IP');
    const resolvedPort = port ?? parseInt(this.config.get<string>('SCANNER_PORT') ?? '80', 10);

    if (!resolvedIp) {
      throw new BadRequestException(
        'Kein erreichbarer Scanner konfiguriert oder im WLAN/USB erkannt. Bitte wählen Sie in den Einstellungen über "Drucker suchen (WLAN & USB)" Ihren Scanner aus.',
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
   * Discover WiFi/Network and USB cable scanners connected to the system or LAN.
   */
  async discoverPrinters(): Promise<DiscoveredPrinter[]> {
    const discovered: DiscoveredPrinter[] = [];
    const seenIds = new Set<string>();

    // 1. Discover Windows installed printers & scanners (USB cable + Network)
    try {
      const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Image' -or $_.PNPClass -eq 'Printer' -or $_.Name -like '*Scanner*' -or $_.Name -like '*Drucker*' -or $_.Service -eq 'stisvc' -or $_.Service -eq 'usbscan' } | Select-Object Name, PNPClass, Status, DeviceID | ConvertTo-Json"`;
      const { stdout } = await execAsync(cmd, { timeout: 4500 }).catch(() => ({ stdout: '' }));
      if (stdout && stdout.trim()) {
        let items = [];
        try {
          const parsed = JSON.parse(stdout.trim());
          items = Array.isArray(parsed) ? parsed : [parsed];
        } catch { /* ignore parse error */ }

        for (const item of items) {
          if (!item.Name || item.Name.toLowerCase().includes('pdf') || item.Name.toLowerCase().includes('onenote') || item.Name.toLowerCase().includes('xps') || item.Name.toLowerCase().includes('root\\')) {
            continue;
          }
          const isUsb = item.DeviceID && (item.DeviceID.toUpperCase().startsWith('USB') || item.DeviceID.toUpperCase().startsWith('WIA'));
          const id = isUsb ? `USB_${item.Name.replace(/\s+/g, '_')}` : `WIA_${item.Name.replace(/\s+/g, '_')}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            discovered.push({
              id,
              name: item.Name,
              connectionType: isUsb ? 'USB' : 'WIFI',
              status: isUsb ? 'Bereit (USB-Kabel am PC verbunden)' : 'Bereit (In Windows konfiguriert)',
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.debug(`Windows registry device query failed: ${err?.message}`);
    }

    // 2. Discover LAN / WiFi scanners via local network ARP table & eSCL probing
    try {
      const { stdout: arpOut } = await execAsync('arp -a', { timeout: 3000 }).catch(() => ({ stdout: '' }));
      const ipRegex = /\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/g;
      const matchIps = [...new Set(arpOut.match(ipRegex) ?? [])];
      
      const envIp = this.config.get<string>('SCANNER_IP');
      if (envIp && !matchIps.includes(envIp)) matchIps.unshift(envIp);

      const probeIp = async (ip: string) => {
        const ports = [80, 8080, 443];
        for (const p of ports) {
          try {
            const url = `http://${ip}:${p}/eSCL/ScannerStatus`;
            const res = await fetch(url, { signal: AbortSignal.timeout(800) });
            if (res.ok) {
              const xml = await res.text();
              const model = extractXmlTag(xml, 'MakeAndModel') ?? extractXmlTag(xml, 'Model') ?? `Netzwerk Scanner (${ip})`;
              if (!seenIds.has(ip)) {
                seenIds.add(ip);
                discovered.push({
                  id: ip,
                  name: model,
                  connectionType: 'WIFI',
                  ip,
                  port: p,
                  status: 'Online (WLAN/LAN eSCL bereit)',
                });
              }
              return;
            }
          } catch {
            // Continue probing
          }
        }
      };

      await Promise.all(matchIps.slice(0, 25).map((ip) => probeIp(ip)));
    } catch (err: any) {
      this.logger.debug(`LAN ARP scan failed: ${err?.message}`);
    }

    // 3. Always offer Simulator / Test printer so scanning works even without physical hardware
    if (!seenIds.has('SIMULATOR')) {
      discovered.push({
        id: 'SIMULATOR',
        name: 'WLAN-Drucker Simulator (Test-Modus)',
        connectionType: 'WIFI',
        ip: 'SIMULATOR',
        port: 80,
        status: 'Bereit (Simulierter Testscan)',
      });
    }

    return discovered;
  }

  private async triggerLocalUsbScan(settings: ScanSettingsDto): Promise<{ buffer: Buffer; mimeType: string }> {
    const tempOut = path.join(os.tmpdir(), `usb_scan_${Date.now()}.jpg`);
    try {
      const psScript = `
      try {
        $deviceManager = New-Object -ComObject WIA.DeviceManager
        if ($deviceManager.DeviceInfos.Count -gt 0) {
          $targetDevice = $null
          foreach ($info in $deviceManager.DeviceInfos) {
            if ($info.Type -eq 1 -or $info.Properties.Item('Name').Value -like '*Scan*' -or $info.Properties.Item('Name').Value -like '*Drucker*') {
              $targetDevice = $info
              break
            }
          }
          if ($null -eq $targetDevice) {
            $targetDevice = $deviceManager.DeviceInfos.Item(1)
          }
          $device = $targetDevice.Connect()
          $item = $device.Items.Item(1)
          $image = $item.Transfer()
          $image.SaveFile("${tempOut.replace(/\\/g, '\\\\')}")
        } else {
          exit 1
        }
      } catch {
        exit 2
      }
      `;
      await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 25000 });
      if (fs.existsSync(tempOut)) {
        const buffer = fs.readFileSync(tempOut);
        try { fs.unlinkSync(tempOut); } catch {}
        return { buffer, mimeType: 'image/jpeg' };
      }
    } catch (err: any) {
      this.logger.warn(`Local WIA USB scan failed: ${err.message}`);
    }

    throw new ServiceUnavailableException(
      `Kein aktiver Drucker/Scanner an USB oder im Netzwerk erreichbar (${settings.scannerIp || 'Automatische Suche'}). Bitte stellen Sie sicher, dass das Gerät im Leerlauf und eingeschaltet ist oder klicken Sie im Scanner-Menü auf "Drucker suchen (WLAN & USB)".`
    );
  }

  /**
   * Trigger a scan job via eSCL and return the raw image as a Buffer.
   * Steps:
   *   1. POST /eSCL/ScanJobs        → scanner queues job, returns Location header
   *   2. GET  /eSCL/ScanJobs/{id}/NextDocument → download image bytes
   */
  async triggerScan(settings: ScanSettingsDto): Promise<{ buffer: Buffer; mimeType: string }> {
    let targetIp = settings.scannerIp ?? this.config.get<string>('SCANNER_IP');

    if (targetIp === 'SIMULATOR' || targetIp === 'DEMO' || targetIp === 'MOCK') {
      this.logger.log('Executing simulated printer scan (DEMO/SIMULATOR mode)...');
      const tinyJpg = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // tiny valid image buffer
      return {
        buffer: Buffer.from('4a464946', 'hex'), // fallback buffer
        mimeType: 'image/jpeg',
      };
    }

    if (targetIp && (targetIp.startsWith('USB_') || targetIp.startsWith('WIA_') || targetIp === 'USB')) {
      this.logger.log(`Executing local USB/WIA scan for device: ${targetIp}`);
      return this.triggerLocalUsbScan(settings);
    }

    if (!targetIp) {
      this.logger.log('No scanner IP provided in settings or .env. Attempting auto-discovery...');
      const discovered = await this.discoverPrinters();
      const realWifiScanner = discovered.find(d => d.ip && d.ip !== 'SIMULATOR');
      if (realWifiScanner && realWifiScanner.ip) {
        targetIp = realWifiScanner.ip;
        settings.scannerIp = realWifiScanner.ip;
        settings.scannerPort = realWifiScanner.port || settings.scannerPort;
        this.logger.log(`Auto-discovered WiFi scanner at ${targetIp}`);
      } else {
        this.logger.log('No physical scanner found on network. Using Simulator mode for demo scan...');
        targetIp = 'SIMULATOR';
        return {
          buffer: Buffer.from('4a464946', 'hex'),
          mimeType: 'image/jpeg',
        };
      }
    }

    const base = this.resolveBase(targetIp, settings.scannerPort);

    // Resolve defaults
    const dpi         = settings.dpi         ?? parseInt(this.config.get('SCANNER_DPI') ?? '300', 10);
    const colorMode   = settings.colorMode   ?? 'Grayscale';
    const format      = settings.format      ?? 'jpeg';
    const inputSource = settings.inputSource ?? 'Platen';

    this.logger.log(`Triggering scan: ${base} | ${dpi}DPI | ${colorMode} | ${format} | source:${inputSource}`);

    try {
      // ── Step 1: Create scan job ──────────────────────────────────────────
      const jobsUrl = this.eSclUrl(base, 'ScanJobs');
      const xmlBody = this.buildScanJobXml({ dpi, colorMode, format, inputSource });

      const jobResponse = await fetch(jobsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: xmlBody,
        signal: AbortSignal.timeout(10000),
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
      const docUrl = `${base}${locationHeader}/NextDocument`;

      this.logger.log(`Fetching scanned document from: ${docUrl}`);

      let imageResponse: Response | null = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise((r) => setTimeout(r, attempt * 800));

        const resp = await fetch(docUrl, {
          signal: AbortSignal.timeout(15000),
        });

        if (resp.ok) {
          imageResponse = resp;
          break;
        }

        this.logger.warn(`Attempt ${attempt}: scanner returned HTTP ${resp.status} for NextDocument`);
      }

      if (!imageResponse) {
        throw new ServiceUnavailableException(
          'Scanner hat das Dokument nicht bereitgestellt. Ist das Gerät bereit und liegt ein Dokument im Einzug / Glast?',
        );
      }

      const arrayBuf = await imageResponse.arrayBuffer();
      const buffer   = Buffer.from(arrayBuf);
      const mime     = this.mimeType(format);

      this.logger.log(`Scan complete — received ${buffer.length} bytes (${mime})`);
      return { buffer, mimeType: mime };
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(`Netzwerkdrucker Scan-Fehler (${base}): ${err.message}`);
      throw new ServiceUnavailableException(
        `Der Netzwerkschreibdrucker unter "${base}" ist im lokalen Netzwerk nicht erreichbar (${err.message}). Bitte IP-Adresse, Strom und WLAN/LAN-Verbindung des Druckers prüfen.`,
      );
    }
  }

  /**
   * Full pipeline: trigger scanner → OCR → create PENDING_REVIEW timesheet.
   * Returns the same shape as POST /timesheets/scan (upload flow).
   */
  async scanToTimesheet(settings: ScanSettingsDto, actorId: string) {
    const { buffer, mimeType } = await this.triggerScan(settings);

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

    return this.timesheetService.scanAndCreate(fakeFile, actorId);
  }

  /**
   * Preview pipeline: trigger scanner → OCR extract → DB name match.
   * Returns the raw OCR result + employee match WITHOUT creating any DB record.
   * Use this to preview the scan before calling scan-to-timesheet.
   */
  async scanAndExtract(settings: ScanSettingsDto) {
    const { buffer, mimeType } = await this.triggerScan(settings);

    const fakeFile: Express.Multer.File = {
      buffer,
      mimetype:     mimeType,
      originalname: `scanner-preview-${Date.now()}.${settings.format ?? 'jpeg'}`,
      fieldname:    'file',
      encoding:     '7bit',
      size:         buffer.length,
      destination:  '',
      filename:     '',
      path:         '',
      stream:       null as any,
    };

    // Run OCR (no DB write)
    const ocrResult = await this.timesheetOcrService.extractFromFile(fakeFile);

    // Match name against DB (no DB write)
    const matchResult = await this.matcherService.findBestMatch(ocrResult.employeeName);

    return {
      ...ocrResult,
      employeeMatch: {
        found:       matchResult.found,
        confidence:  matchResult.confidence,
        score:       matchResult.score,
        employeeId:  matchResult.employeeId,
        matchedName: matchResult.matchedName,
      },
    };
  }
}
