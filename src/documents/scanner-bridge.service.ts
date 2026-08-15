import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';

const execAsync = promisify(exec);

const ESCL_PORTS = [80, 8080, 443, 8443, 5757, 9100];
const PROBE_TIMEOUT_MS = 1500;

export interface DiscoveredScannerDevice {
  id: string;
  name: string;
  connectionType: 'WIFI' | 'USB' | 'LAN' | 'UNKNOWN';
  ip?: string;
  port?: number;
  status: 'READY' | 'SCANNING' | 'BUSY' | 'OFFLINE' | 'PAPER_JAM' | 'NO_PAPER' | 'COVER_OPEN' | 'ERROR' | 'UNKNOWN';
  statusDetails?: string;
  capabilities?: {
    hasAdf: boolean;
    hasFlatbed: boolean;
    supportedDpi: number[];
    colorModes: string[];
    documentFormats: string[];
  };
}

export interface TriggerScanOptions {
  scannerIp?: string;
  scannerPort?: number;
  colorMode?: 'Color' | 'Grayscale' | 'BlackAndWhite';
  dpi?: number;
  format?: 'pdf' | 'jpeg' | 'png';
  inputSource?: 'Platen' | 'Feeder';
  batchScan?: boolean; // If Feeder is used, scan all pages in feeder
}

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

@Injectable()
export class ScannerBridgeService {
  private readonly logger = new Logger(ScannerBridgeService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Discover real scanners on local WiFi/LAN network via eSCL/AirScan and USB WIA.
   */
  async discoverScanners(): Promise<DiscoveredScannerDevice[]> {
    const discovered: DiscoveredScannerDevice[] = [];
    const seenIds = new Set<string>();

    // 1. Check configured environment SCANNER_IP
    const envIp = this.config.get<string>('SCANNER_IP');
    const envPort = parseInt(this.config.get<string>('SCANNER_PORT') ?? '80', 10);
    if (envIp && envIp !== 'SIMULATOR') {
      await this.probeIp(envIp, seenIds, discovered, 'WIFI', envPort);
    }

    // 2. Local Companion Agent check (http://127.0.0.1:48281)
    try {
      const companionRes = await fetch('http://127.0.0.1:48281/scanners', {
        signal: AbortSignal.timeout(1000),
      });
      if (companionRes.ok) {
        const companionList = await companionRes.json();
        if (Array.isArray(companionList)) {
          for (const s of companionList) {
            if (!seenIds.has(s.id)) {
              seenIds.add(s.id);
              discovered.push(s);
            }
          }
        }
      }
    } catch {}

    // 3. Local USB WIA check on Windows host
    if (process.platform === 'win32') {
      try {
        const psScript = `
        try {
          $deviceManager = New-Object -ComObject WIA.DeviceManager
          foreach ($info in $deviceManager.DeviceInfos) {
            Write-Output "$($info.DeviceID)||$($info.Properties.Item('Name').Value)"
          }
        } catch {}
        `;
        const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, {
          timeout: 4000,
        });
        const lines = stdout.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          const [devId, devName] = line.split('||');
          if (devId && devName && !seenIds.has(devId.trim())) {
            seenIds.add(devId.trim());
            discovered.push({
              id: devId.trim(),
              name: `USB: ${devName.trim()}`,
              connectionType: 'USB',
              status: 'READY',
              statusDetails: 'USB-Scanner betriebsbereit (WIA)',
              capabilities: {
                hasAdf: false,
                hasFlatbed: true,
                supportedDpi: [150, 300, 600],
                colorModes: ['Color', 'Grayscale', 'BlackAndWhite'],
                documentFormats: ['image/jpeg', 'image/png'],
              },
            });
          }
        }
      } catch (err: any) {
        this.logger.debug(`WIA USB scanner probe skipped: ${err.message}`);
      }
    }

    // 4. Subnet probe across local network interfaces
    const localIps = getLocalIpv4Addresses();
    const subnetIps = new Set<string>();
    for (const lip of localIps) {
      subnetHosts(lip).forEach((h) => subnetIps.add(h));
    }

    const ipList = [...subnetIps].filter((ip) => !seenIds.has(ip));
    const CHUNK = 40;
    for (let i = 0; i < ipList.length; i += CHUNK) {
      const chunk = ipList.slice(i, i + CHUNK);
      await Promise.all(chunk.map((ip) => this.probeIp(ip, seenIds, discovered, 'WIFI')));
    }

    // 5. Always provide test simulator fallback in development
    if (!seenIds.has('SIMULATOR')) {
      discovered.push({
        id: 'SIMULATOR',
        name: 'WLAN-Scanner Simulator (Test-Modus)',
        connectionType: 'WIFI',
        ip: 'SIMULATOR',
        port: 80,
        status: 'READY',
        statusDetails: 'Simulierter eSCL ADF/Flatbed Scanner',
        capabilities: {
          hasAdf: true,
          hasFlatbed: true,
          supportedDpi: [150, 300, 600],
          colorModes: ['Color', 'Grayscale', 'BlackAndWhite'],
          documentFormats: ['image/jpeg', 'image/png', 'application/pdf'],
        },
      });
    }

    this.logger.log(`Scanner discovery finished. Found ${discovered.length} device(s).`);
    return discovered;
  }

  private async probeIp(
    ip: string,
    seenIds: Set<string>,
    discovered: DiscoveredScannerDevice[],
    connectionType: 'WIFI' | 'LAN' = 'WIFI',
    explicitPort?: number,
  ): Promise<void> {
    const portsToTest = explicitPort ? [explicitPort] : ESCL_PORTS;

    for (const port of portsToTest) {
      try {
        const isReachable = await tcpReachable(ip, port, PROBE_TIMEOUT_MS);
        if (!isReachable) continue;

        const protocol = port === 443 || port === 8443 ? 'https' : 'http';
        const url = `${protocol}://${ip}:${port}/eSCL/ScannerCapabilities`;

        const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        if (!res.ok) continue;

        const xml = await res.text();
        const makeModel =
          extractXmlTag(xml, 'MakeAndModel') ||
          extractXmlTag(xml, 'Model') ||
          extractXmlTag(xml, 'Make') ||
          'eSCL Network Scanner';

        const inputSources = extractAllXmlTags(xml, 'InputSource');
        const xRes = extractAllXmlTags(xml, 'XResolution').map(Number).filter(Boolean);
        const dpis = [...new Set(xRes)].sort((a, b) => a - b);
        const formats = extractAllXmlTags(xml, 'DocumentFormat');
        const colorModes = extractAllXmlTags(xml, 'ColorMode');

        const deviceId = `ESCL_${ip.replace(/\./g, '_')}_${port}`;
        if (!seenIds.has(deviceId)) {
          seenIds.add(deviceId);
          discovered.push({
            id: deviceId,
            name: `${makeModel} (${ip})`,
            connectionType,
            ip,
            port,
            status: 'READY',
            statusDetails: 'eSCL AirScan bereit',
            capabilities: {
              hasAdf: inputSources.some((s) => s.toLowerCase().includes('feeder')),
              hasFlatbed: inputSources.some((s) => s.toLowerCase().includes('platen')),
              supportedDpi: dpis.length > 0 ? dpis : [150, 300, 600],
              colorModes: colorModes.length > 0 ? colorModes : ['Color', 'Grayscale'],
              documentFormats: formats.length > 0 ? formats : ['image/jpeg', 'image/png'],
            },
          });
        }
        break;
      } catch {}
    }
  }

  /**
   * Check real status of scanner device.
   */
  async checkScannerStatus(ip?: string, port: number = 80): Promise<{
    status: DiscoveredScannerDevice['status'];
    state?: string;
    details?: string;
  }> {
    if (!ip || ip === 'SIMULATOR') {
      return { status: 'READY', state: 'Idle', details: 'Simulator betriebsbereit' };
    }

    try {
      const url = `http://${ip}:${port}/eSCL/ScannerStatus`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        return { status: 'ERROR', details: `HTTP ${res.status} von Scanner` };
      }

      const xml = await res.text();
      const state = extractXmlTag(xml, 'State') || 'Idle';
      const reason = extractXmlTag(xml, 'AdfState') || extractXmlTag(xml, 'Reason') || '';

      if (state.toLowerCase().includes('busy') || state.toLowerCase().includes('processing')) {
        return { status: 'BUSY', state, details: 'Scanner führt Scanauftrag aus' };
      }
      if (reason.toLowerCase().includes('jam')) {
        return { status: 'PAPER_JAM', state, details: 'Papierstau im Einzug' };
      }
      if (reason.toLowerCase().includes('empty') || reason.toLowerCase().includes('nopaper')) {
        return { status: 'NO_PAPER', state, details: 'Kein Papier im Scanner' };
      }
      if (reason.toLowerCase().includes('open') || reason.toLowerCase().includes('cover')) {
        return { status: 'COVER_OPEN', state, details: 'Scanner-Abdeckung ist geöffnet' };
      }

      return { status: 'READY', state, details: 'Scanner bereit' };
    } catch (err: any) {
      return { status: 'OFFLINE', details: `Nicht erreichbar (${err.message})` };
    }
  }

  /**
   * Execute scan job over eSCL / AirScan or USB WIA and return page buffers.
   */
  async triggerScan(options: TriggerScanOptions): Promise<{ pages: { buffer: Buffer; mimeType: string }[] }> {
    const ip = options.scannerIp || this.config.get<string>('SCANNER_IP');

    if (ip === 'SIMULATOR' || !ip) {
      this.logger.log('Executing test simulator scan (sample realistic document image)');
      // Return a valid dummy 1x1 JPEG or test page buffer
      const dummyJpeg = Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        'base64',
      );
      return {
        pages: [{ buffer: dummyJpeg, mimeType: 'image/jpeg' }],
      };
    }

    // Windows USB Scan
    if (ip.startsWith('USB_') || ip.startsWith('WIA_')) {
      const tempOut = path.join(os.tmpdir(), `usb_scan_${Date.now()}.jpg`);
      try {
        const psScript = `
        try {
          $deviceManager = New-Object -ComObject WIA.DeviceManager
          if ($deviceManager.DeviceInfos.Count -gt 0) {
            $device = $deviceManager.DeviceInfos.Item(1).Connect()
            $item = $device.Items.Item(1)
            $image = $item.Transfer()
            $image.SaveFile("${tempOut.replace(/\\/g, '\\\\')}")
          } else { exit 1 }
        } catch { exit 2 }
        `;
        await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 25000 });
        if (fs.existsSync(tempOut)) {
          const buffer = fs.readFileSync(tempOut);
          try { fs.unlinkSync(tempOut); } catch {}
          return { pages: [{ buffer, mimeType: 'image/jpeg' }] };
        }
      } catch (err: any) {
        throw new ServiceUnavailableException(`USB-Scan fehlgeschlagen: ${err.message}`);
      }
    }

    // eSCL Network Scan
    const port = options.scannerPort || 80;
    const dpi = options.dpi || 300;
    const inputSource = options.inputSource || 'Platen';
    const colorMode = options.colorMode === 'Color' ? 'RGB24' : options.colorMode === 'Grayscale' ? 'Grayscale8' : 'BlackAndWhite1';
    const mime = options.format === 'png' ? 'image/png' : 'image/jpeg';

    const scanXml = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.6</pwg:Version>
  <scan:Intent>Document</scan:Intent>
  <pwg:InputSource>${inputSource}</pwg:InputSource>
  <scan:ColorMode>${colorMode}</scan:ColorMode>
  <scan:XResolution>${dpi}</scan:XResolution>
  <scan:YResolution>${dpi}</scan:YResolution>
  <pwg:DocumentFormat>${mime}</pwg:DocumentFormat>
</scan:ScanSettings>`;

    try {
      const postUrl = `http://${ip}:${port}/eSCL/ScanJobs`;
      const jobRes = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: scanXml,
        signal: AbortSignal.timeout(10000),
      });

      if (!jobRes.ok && jobRes.status !== 201) {
        throw new Error(`eSCL ScanJobs POST failed (HTTP ${jobRes.status})`);
      }

      const jobLocation = jobRes.headers.get('location') || `${postUrl}/Job1`;
      const nextDocUrl = jobLocation.endsWith('/NextDocument') ? jobLocation : `${jobLocation}/NextDocument`;

      // Poll next document
      const pages: { buffer: Buffer; mimeType: string }[] = [];
      let attempts = 0;
      while (attempts < 20) {
        attempts++;
        const docRes = await fetch(nextDocUrl, { signal: AbortSignal.timeout(15000) });
        if (docRes.status === 200) {
          const arrayBuf = await docRes.arrayBuffer();
          pages.push({ buffer: Buffer.from(arrayBuf), mimeType: mime });
          if (!options.batchScan || inputSource !== 'Feeder') break;
        } else if (docRes.status === 503 || docRes.status === 404) {
          // Waiting for scan head / next page
          await new Promise((r) => setTimeout(r, 1500));
        } else {
          break;
        }
      }

      if (pages.length === 0) {
        throw new Error('Keine Bilddaten vom Scanner empfangen.');
      }

      return { pages };
    } catch (err: any) {
      this.logger.error(`eSCL Scan execution failed: ${err.message}`);
      throw new ServiceUnavailableException(`Scan konnte nicht ausgeführt werden: ${err.message}`);
    }
  }
}
