import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TimesheetMatcherService } from '../timesheet/timesheet-matcher.service';
import { TimesheetService } from '../timesheet/timesheet.service';
import { TimesheetOcrService } from '../timesheet/timesheet-ocr.service';
import { generateSampleDocumentPng } from '../common/utils/sample-document.util';
import { ScanSettingsDto, ColorMode, ScanFormat } from './dto/scan-settings.dto';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as dns from 'dns';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';

const execAsync = promisify(exec);
const dnsResolve4 = promisify(dns.resolve4);

/** eSCL XML namespaces */
const NS_SCAN = 'http://schemas.hp.com/imaging/escl/2011/05/03';
const NS_PWG  = 'http://www.pwg.org/schemas/2010/12/sm';

/**
 * All ports checked per IP during WiFi/LAN discovery.
 * 80    — Brother, Canon, Epson, Lexmark (standard HTTP eSCL)
 * 8080  — HP (alternative HTTP eSCL)
 * 443   — HTTPS eSCL (some newer models)
 * 8443  — HP secure AirScan
 * 5757  — Epson alternative eSCL port
 * 9100  — Generic IPP/eSCL probe
 */
const ESCL_PORTS = [80, 8080, 443, 8443, 5757, 9100];

/** Timeout in milliseconds for a single eSCL probe request */
const PROBE_TIMEOUT_MS = 1500;

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

/** Return all non-loopback IPv4 addresses of the host machine */
function getLocalIpv4Addresses(): string[] {
  const ifaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const iface of Object.values(ifaces)) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        addresses.push(info.address);
      }
    }
  }
  return addresses;
}

/** Generate all host IPs in the same /24 subnet as a given IP */
function subnetHosts(ip: string): string[] {
  const parts = ip.split('.');
  if (parts.length !== 4) return [];
  const prefix = parts.slice(0, 3).join('.');
  const hosts: string[] = [];
  for (let i = 1; i <= 254; i++) {
    hosts.push(`${prefix}.${i}`);
  }
  return hosts;
}

/** Quick TCP reachability check before spending HTTP budget on a host */
function tcpReachable(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });

    socket.connect(port, ip);
  });
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
  model?: string;
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
        'Kein Scanner konfiguriert. Bitte klicken Sie auf "Drucker suchen (WLAN & USB)" oder geben Sie die IP-Adresse des Druckers manuell ein.',
      );
    }

    return `http://${resolvedIp}:${resolvedPort}`;
  }

  private eSclUrl(base: string, eSclPath: string): string {
    return `${base}/eSCL/${eSclPath}`;
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
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          online: false,
          error: `HTTP ${response.status} — Scanner antwortet, lehnt aber die Anfrage ab.`,
        };
      }

      const xml   = await response.text();
      const state = extractXmlTag(xml, 'State') ?? 'Unknown';
      const model = extractXmlTag(xml, 'MakeAndModel') ?? extractXmlTag(xml, 'Model') ?? undefined;

      this.logger.log(`Scanner at ${base} online — state: ${state}${model ? ` (${model})` : ''}`);
      return { online: true, state, model };
    } catch (err: any) {
      const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout');
      this.logger.warn(`Scanner at ${base} unreachable: ${err.message}`);
      return {
        online: false,
        error: isTimeout
          ? `Zeitüberschreitung — Drucker nicht im WLAN erreichbar (${base})`
          : err.message,
      };
    }
  }

  /**
   * Fetch the scanner's advertised capabilities: supported DPI, color modes, formats.
   */
  async getCapabilities(ip?: string, port?: number): Promise<ScannerCapabilities> {
    const base = this.resolveBase(ip, port);
    const url  = this.eSclUrl(base, 'ScannerCapabilities');

    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Scanner-Fähigkeiten konnten nicht abgerufen werden (HTTP ${response.status})`,
      );
    }

    const xml = await response.text();

    const xRes = extractAllXmlTags(xml, 'XResolution').map(Number).filter(Boolean);
    const yRes = extractAllXmlTags(xml, 'YResolution').map(Number).filter(Boolean);
    const dpis = [...new Set([...xRes, ...yRes])].sort((a, b) => a - b);
    const colorModes   = extractAllXmlTags(xml, 'ColorMode');
    const inputSources = extractAllXmlTags(xml, 'InputSource');
    const formats      = extractAllXmlTags(xml, 'DocumentFormat');
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
   * Probe a single IP across all known eSCL ports and add it to the discovered list.
   * Uses TCP pre-check to skip ports that are definitely closed (fast).
   */
  private async probeIp(
    ip: string,
    seenIds: Set<string>,
    discovered: DiscoveredPrinter[],
    connectionType: 'WIFI' | 'LAN' = 'WIFI',
  ): Promise<void> {
    for (const p of ESCL_PORTS) {
      try {
        // Fast TCP check first — saves HTTP budget on closed ports
        const open = await tcpReachable(ip, p, PROBE_TIMEOUT_MS);
        if (!open) continue;

        const url = `http://${ip}:${p}/eSCL/ScannerStatus`;
        const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });

        if (res.ok) {
          const xml   = await res.text();
          const model =
            extractXmlTag(xml, 'MakeAndModel') ??
            extractXmlTag(xml, 'Model') ??
            `Netzwerk Scanner (${ip})`;
          const state = extractXmlTag(xml, 'State') ?? 'Idle';

          if (!seenIds.has(ip)) {
            seenIds.add(ip);
            discovered.push({
              id:             ip,
              name:           model,
              connectionType,
              ip,
              port:           p,
              status:         `Online — ${state} (${connectionType === 'WIFI' ? 'WLAN' : 'LAN'}, Port ${p})`,
            });
          }
          return; // Found on this port — no need to probe remaining ports
        }
      } catch {
        // Continue probing next port
      }
    }
  }

  /**
   * Attempt mDNS / DNS-SD lookup for _uscan._tcp.local and _ipp._tcp.local.
   * Only works in LAN environments (not cloud-deployed servers).
   */
  private async discoverViaMdns(
    seenIds: Set<string>,
    discovered: DiscoveredPrinter[],
  ): Promise<void> {
    const mdnsNames = [
      '_uscan._tcp.local',
      '_ipp._tcp.local',
      '_printer._tcp.local',
      '_pdl-datastream._tcp.local',
    ];

    for (const name of mdnsNames) {
      try {
        const addresses = await Promise.race([
          dnsResolve4(name),
          new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('mDNS timeout')), 1000)),
        ]) as string[];

        for (const ip of addresses) {
          if (!seenIds.has(ip)) {
            await this.probeIp(ip, seenIds, discovered, 'WIFI');
          }
        }
      } catch {
        // mDNS not available in this environment — silently skip
      }
    }
  }

  /**
   * Discover WiFi/Network and USB cable scanners connected to the system or LAN.
   *
   * Discovery strategy (layered — fastest to slowest):
   *  1. Windows WMI/PnP devices (USB + installed network printers)
   *  2. mDNS / DNS-SD (_uscan._tcp.local, _ipp._tcp.local)
   *  3. ARP table probe  (recently-seen LAN hosts)
   *  4. /24 subnet sweep (cold-cache printers not in ARP)
   *  5. .env SCANNER_IP (admin-configured fixed IP)
   *  6. Simulator entry (always present for demo/test)
   */
  async discoverPrinters(): Promise<DiscoveredPrinter[]> {
    const discovered: DiscoveredPrinter[] = [];
    const seenIds = new Set<string>();

    // ── 0. Query Local Scanner Agent (127.0.0.1:48281) if active ─────────────
    try {
      const agentRes = await fetch('http://127.0.0.1:48281/scanners', {
        signal: AbortSignal.timeout(1800),
      });
      if (agentRes.ok) {
        const agentDevices: any[] = await agentRes.json();
        for (const dev of agentDevices) {
          if (!seenIds.has(dev.id)) {
            seenIds.add(dev.id);
            discovered.push({
              id:             dev.id,
              name:           dev.displayName || dev.name,
              connectionType: dev.connectionType || 'WIFI',
              ip:             dev.ip,
              port:           dev.port || 80,
              status:         dev.status === 'available' || dev.status === 'READY'
                ? `Bereit (${dev.displayName || dev.name})`
                : (dev.statusDetails || dev.status || 'Bereit'),
            });
          }
        }
        if (discovered.length > 0) {
          this.logger.log(`Local agent returned ${discovered.length} discovered device(s).`);
          return discovered;
        }
      }
    } catch {
      // Local agent not available — continue to server-side discovery
    }

    // ── 1. Windows WMI / PnP (USB cable + installed network printers) ────────
    try {
      const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Image' -or $_.PNPClass -eq 'Printer' -or $_.Name -like '*Scanner*' -or $_.Name -like '*Drucker*' -or $_.Service -eq 'stisvc' -or $_.Service -eq 'usbscan' } | Select-Object Name, PNPClass, Status, DeviceID | ConvertTo-Json"`;
      const { stdout } = await execAsync(cmd, { timeout: 4500 }).catch(() => ({ stdout: '' }));

      if (stdout?.trim()) {
        let items: any[] = [];
        try {
          const parsed = JSON.parse(stdout.trim());
          items = Array.isArray(parsed) ? parsed : [parsed];
        } catch { /* ignore */ }

        for (const item of items) {
          if (!item.Name) continue;
          const nameLower = item.Name.toLowerCase();
          if (nameLower.includes('pdf') || nameLower.includes('onenote') ||
              nameLower.includes('xps') || nameLower.includes('root\\')) continue;

          const isUsb = item.DeviceID &&
            (item.DeviceID.toUpperCase().startsWith('USB') ||
             item.DeviceID.toUpperCase().startsWith('WIA'));
          const id = isUsb
            ? `USB_${item.Name.replace(/\s+/g, '_')}`
            : `WIA_${item.Name.replace(/\s+/g, '_')}`;

          if (!seenIds.has(id)) {
            seenIds.add(id);
            discovered.push({
              id,
              name:           item.Name,
              connectionType: isUsb ? 'USB' : 'WIFI',
              status:         isUsb
                ? 'Bereit (USB-Kabel am PC verbunden)'
                : 'Bereit (In Windows konfiguriert)',
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.debug(`Windows PnP device query failed: ${err?.message}`);
    }

    // ── 2. mDNS / DNS-SD (Bonjour) ───────────────────────────────────────────
    await this.discoverViaMdns(seenIds, discovered);

    // ── 3. ARP table — hosts the OS has recently talked to ───────────────────
    const arpIps: string[] = [];
    try {
      const { stdout: arpOut } = await execAsync('arp -a', { timeout: 3000 }).catch(() => ({ stdout: '' }));
      const ipRegex = /\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/g;
      const matches = [...new Set((arpOut ?? '').match(ipRegex) ?? [])];
      arpIps.push(...matches);
    } catch (err: any) {
      this.logger.debug(`ARP table scan failed: ${err?.message}`);
    }

    // ── 4. /24 subnet sweep (catches cold-cache printers not in ARP) ─────────
    const localIps = getLocalIpv4Addresses();
    const subnetIps = new Set<string>(arpIps);
    for (const localIp of localIps) {
      for (const host of subnetHosts(localIp)) {
        subnetIps.add(host);
      }
    }

    // Prepend .env configured IP so it's always checked
    const envIp = this.config.get<string>('SCANNER_IP');
    if (envIp && !seenIds.has(envIp)) subnetIps.add(envIp);

    // Probe all subnet + ARP IPs in parallel (capped at 50 concurrent)
    const ipList = [...subnetIps].filter((ip) => !seenIds.has(ip));
    const CHUNK  = 50;
    for (let i = 0; i < ipList.length; i += CHUNK) {
      const chunk = ipList.slice(i, i + CHUNK);
      await Promise.all(chunk.map((ip) => this.probeIp(ip, seenIds, discovered)));
    }

    // ── 5. Always offer Simulator / Test printer ──────────────────────────────
    if (!seenIds.has('SIMULATOR')) {
      discovered.push({
        id:             'SIMULATOR',
        name:           'WLAN-Drucker Simulator (Test-Modus)',
        connectionType: 'WIFI',
        ip:             'SIMULATOR',
        port:           80,
        status:         'Bereit (Simulierter Testscan)',
      });
    }

    this.logger.log(`Discovery complete — found ${discovered.length} device(s)`);
    return discovered;
  }

  /** Trigger a scan via Windows WIA (USB-attached scanner) */
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
      'Kein aktiver USB-Scanner gefunden. Bitte stellen Sie sicher, dass das Gerät eingeschaltet und per USB-Kabel angeschlossen ist.',
    );
  }

  /**
   * Trigger a scan job via eSCL (WiFi/LAN) and return the raw image as a Buffer.
   *
   * Steps:
   *   1. POST /eSCL/ScanJobs        → scanner queues job, returns Location header
   *   2. GET  /eSCL/ScanJobs/{id}/NextDocument → poll until image is ready
   */
  async triggerScan(settings: ScanSettingsDto): Promise<{ buffer: Buffer; mimeType: string }> {
    let targetIp = settings.scannerIp ?? this.config.get<string>('SCANNER_IP');

    // ── Simulator / Demo mode ─────────────────────────────────────────────────
    if (targetIp === 'SIMULATOR' || targetIp === 'DEMO' || targetIp === 'MOCK') {
      this.logger.log('Executing simulated scan (DEMO/SIMULATOR mode)...');
      return { buffer: generateSampleDocumentPng(600, 800), mimeType: 'image/png' };
    }

    // ── USB / WIA scan ────────────────────────────────────────────────────────
    if (targetIp && (targetIp.startsWith('USB_') || targetIp.startsWith('WIA_') || targetIp === 'USB')) {
      this.logger.log(`Executing local USB/WIA scan for device: ${targetIp}`);
      return this.triggerLocalUsbScan(settings);
    }

    // ── Try Local Agent (127.0.0.1:48281) first ──────────────────────────────
    try {
      const agentRes = await fetch('http://127.0.0.1:48281/health', { signal: AbortSignal.timeout(1200) });
      if (agentRes.ok) {
        this.logger.log(`Delegating scan to local agent (127.0.0.1:48281) for target ${targetIp || 'auto'}`);
        const scanRes = await fetch('http://127.0.0.1:48281/scan', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scannerIp:   targetIp,
            scannerPort: settings.scannerPort ?? 80,
            dpi:         settings.dpi ?? 300,
            colorMode:   settings.colorMode ?? 'Grayscale',
            format:      settings.format ?? 'jpeg',
            inputSource: settings.inputSource ?? 'Platen',
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (scanRes.ok) {
          const data = (await scanRes.json()) as { pages?: { base64Data: string; mimeType: string }[] };
          if (data.pages && data.pages.length > 0) {
            return {
              buffer:   Buffer.from(data.pages[0].base64Data, 'base64'),
              mimeType: data.pages[0].mimeType || 'image/jpeg',
            };
          }
        }
      }
    } catch {
      // Continue to direct scan
    }

    // ── Auto-discovery if no IP provided ─────────────────────────────────────
    if (!targetIp) {
      this.logger.log('No scanner IP configured — attempting auto-discovery...');
      const discovered = await this.discoverPrinters();
      const realWifi   = discovered.find((d) => d.ip && d.ip !== 'SIMULATOR');
      if (realWifi?.ip) {
        targetIp             = realWifi.ip;
        settings.scannerIp   = realWifi.ip;
        settings.scannerPort = realWifi.port ?? settings.scannerPort;
        this.logger.log(`Auto-discovered WiFi scanner at ${targetIp}:${settings.scannerPort}`);
      } else {
        this.logger.log('No physical scanner found — falling back to Simulator mode.');
        return { buffer: generateSampleDocumentPng(600, 800), mimeType: 'image/png' };
      }
    }

    const base = this.resolveBase(targetIp, settings.scannerPort);
    const dpi         = settings.dpi         ?? parseInt(this.config.get('SCANNER_DPI') ?? '300', 10);
    const colorMode   = settings.colorMode   ?? 'Grayscale';
    const format      = settings.format      ?? 'jpeg';
    const inputSource = settings.inputSource ?? 'Platen';

    this.logger.log(`Triggering WiFi scan: ${base} | ${dpi}DPI | ${colorMode} | ${format} | source:${inputSource}`);

    try {
      // ── Step 1: Create scan job ─────────────────────────────────────────────
      const jobsUrl = this.eSclUrl(base, 'ScanJobs');
      const xmlBody = this.buildScanJobXml({ dpi, colorMode, format, inputSource });

      const jobResponse = await fetch(jobsUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body:    xmlBody,
        signal:  AbortSignal.timeout(20_000), // 20 s — cold WiFi printer can be slow
      });

      if (!jobResponse.ok) {
        const errBody = await jobResponse.text().catch(() => '');
        if (jobResponse.status === 503) {
          throw new ServiceUnavailableException(
            `Der Drucker ist beschäftigt (HTTP 503). Warten Sie bis der aktuelle Druckauftrag abgeschlossen ist und versuchen Sie es erneut.`,
          );
        }
        throw new ServiceUnavailableException(
          `Scanner hat den Scan-Job abgelehnt (HTTP ${jobResponse.status}): ${errBody}`,
        );
      }

      const locationHeader = jobResponse.headers.get('location');
      if (!locationHeader) {
        throw new ServiceUnavailableException(
          'Scanner hat keinen Job-Speicherort zurückgegeben (kein Location-Header). Mögliche Ursache: Kein Dokument im Einzug.',
        );
      }

      // ── Step 2: Poll for scanned document ──────────────────────────────────
      // 15 attempts × 1200 ms backoff → up to ~18 s total wait
      const docUrl = `${base}${locationHeader}/NextDocument`;
      this.logger.log(`Polling for scanned document: ${docUrl}`);

      const MAX_ATTEMPTS  = 15;
      const POLL_DELAY_MS = 1200;
      let imageResponse: Response | null = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_DELAY_MS));

        const resp = await fetch(docUrl, { signal: AbortSignal.timeout(15_000) });

        if (resp.ok) {
          imageResponse = resp;
          this.logger.log(`Document ready after ${attempt} attempt(s).`);
          break;
        }

        if (resp.status === 404) {
          // Job expired — scanner discarded it (device reset or timeout)
          throw new ServiceUnavailableException(
            'Der Scan-Job ist abgelaufen (HTTP 404). Möglicherweise wurde das Dokument nicht rechtzeitig abgerufen. Bitte legen Sie das Dokument neu ein und versuchen Sie es erneut.',
          );
        }

        if (resp.status === 503) {
          this.logger.warn(`Attempt ${attempt}/${MAX_ATTEMPTS}: scanner still processing (HTTP 503)...`);
          continue; // Scanner still processing — keep polling
        }

        this.logger.warn(`Attempt ${attempt}/${MAX_ATTEMPTS}: unexpected HTTP ${resp.status} — retrying...`);
      }

      if (!imageResponse) {
        throw new ServiceUnavailableException(
          `Der Scanner hat das Dokument nach ${MAX_ATTEMPTS} Versuchen nicht bereitgestellt. Mögliche Ursachen: Kein Dokument auf dem Glas/Einzug, Drucker im Fehlerzustand oder zu langsame WLAN-Verbindung.`,
        );
      }

      const arrayBuf = await imageResponse.arrayBuffer();
      const buffer   = Buffer.from(arrayBuf);
      const mime     = this.mimeType(format);

      this.logger.log(`Scan complete — ${buffer.length} bytes (${mime}) from ${base}`);
      return { buffer, mimeType: mime };

    } catch (err: any) {
      if (err instanceof ServiceUnavailableException || err instanceof BadRequestException) {
        throw err;
      }
      const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout');
      this.logger.error(`WiFi scan error (${base}): ${err.message}`);

      throw new ServiceUnavailableException(
        isTimeout
          ? `Zeitüberschreitung beim WLAN-Drucker (${base}). Bitte prüfen Sie: 1) Drucker eingeschaltet und im gleichen WLAN? 2) IP-Adresse korrekt? 3) Ist Port ${settings.scannerPort ?? 80} erreichbar?`
          : `Der Netzwerkdrucker unter "${base}" ist nicht erreichbar: ${err.message}. Bitte IP-Adresse, Strom und WLAN-Verbindung des Druckers prüfen.`,
      );
    }
  }

  /**
   * Full pipeline: trigger scanner → OCR → create PENDING_REVIEW timesheet.
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
   * Preview pipeline: trigger scanner → OCR → DB name match (NO DB write).
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

    const ocrResult   = await this.timesheetOcrService.extractFromFile(fakeFile);
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

  /**
   * Return the connector installer for the requested platform.
   * If a pre-built binary exists (.exe / .dmg), serve it directly.
   * Otherwise fall back to a packaged zip file.
   */
  async getInstaller(platform?: string): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
    const installersDir = path.join(process.cwd(), 'public', 'installers');
    const targetDir = path.join(process.cwd(), 'connector', 'src-tauri', 'target');

    // 1. Windows (.exe)
    if (platform === 'windows') {
      const candidates = [
        path.join(installersDir, 'LogiFlow-Connector-Setup.exe'),
        path.join(targetDir, 'release', 'bundle', 'nsis', 'LogiFlow-Connector-Setup.exe'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          return {
            buffer: fs.readFileSync(cand),
            fileName: 'LogiFlow-Connector-Setup.exe',
            contentType: 'application/vnd.microsoft.portable-executable',
          };
        }
      }
    }

    // 2. macOS (.dmg)
    if (platform === 'macos') {
      const candidates = [
        path.join(installersDir, 'LogiFlow-Connector.dmg'),
        path.join(targetDir, 'universal-apple-darwin', 'release', 'bundle', 'dmg', 'LogiFlow-Connector.dmg'),
        path.join(targetDir, 'release', 'bundle', 'dmg', 'LogiFlow-Connector.dmg'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          return {
            buffer: fs.readFileSync(cand),
            fileName: 'LogiFlow-Connector.dmg',
            contentType: 'application/x-apple-diskimage',
          };
        }
      }
    }

    // 3. Fallback: package zip
    const buffer = await this.getInstallerZip();
    return {
      buffer,
      fileName: 'LogiFlow-Printer-Connector.zip',
      contentType: 'application/zip',
    };
  }

  /**
   * Package the Connector as a downloadable zip file.
   */
  async getInstallerZip(): Promise<Buffer> {
    const connectorDir = fs.existsSync(path.join(process.cwd(), 'windows-connector'))
      ? path.join(process.cwd(), 'windows-connector')
      : path.join(process.cwd(), 'connector');
    const tempZipPath = path.join(os.tmpdir(), `LogiFlow-Printer-Connector.zip`);

    if (process.platform === 'win32') {
      const psScript = `Compress-Archive -Path '${connectorDir}\\*' -DestinationPath '${tempZipPath}' -Force`;
      await execAsync(`powershell -NoProfile -Command "${psScript}"`);
    } else {
      await execAsync(`cd "${connectorDir}" && zip -r "${tempZipPath}" .`);
    }

    if (fs.existsSync(tempZipPath)) {
      return fs.readFileSync(tempZipPath);
    }
    throw new ServiceUnavailableException('Connector-Installer konnte nicht erstellt werden.');
  }
}

