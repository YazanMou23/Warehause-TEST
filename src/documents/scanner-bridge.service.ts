import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { Subject, Observable } from 'rxjs';
import { generateSampleDocumentPng } from '../common/utils/sample-document.util';

const execAsync = promisify(exec);

// ─── Constants ────────────────────────────────────────────────────────────────
const ESCL_PORTS    = [80, 8080, 443, 8443, 5757, 9100];
const PROBE_TIMEOUT = 1400;
const AGENT_URL     = 'http://127.0.0.1:48281';
const AGENT_TIMEOUT = 1500;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveredScannerDevice {
  id: string;
  name: string;
  displayName?: string;
  connectionType: 'WIFI' | 'USB' | 'LAN' | 'UNKNOWN';
  ip?: string;
  port?: number;
  protocol?: string;
  serial?: string | null;
  status: 'READY' | 'SCANNING' | 'BUSY' | 'OFFLINE' | 'PAPER_JAM' | 'NO_PAPER' | 'COVER_OPEN' | 'ERROR' | 'UNKNOWN';
  statusDetails?: string;
  isAgentDevice?: boolean;  // discovered via local agent
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
  format?: string;
  inputSource?: 'Platen' | 'Feeder';
  batchScan?: boolean;
  deviceId?: string;
}

export interface ScannerEvent {
  type: 'scan.started' | 'scan.page' | 'scan.completed' | 'scan.failed' | 'scanner.status.changed';
  jobId?: string;
  deviceId?: string;
  pageNumber?: number;
  totalPages?: number;
  status?: string;
  data?: any;
  timestamp: string;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function extractXmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function extractAllXmlTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

// ─── Network helpers ─────────────────────────────────────────────────────────

function getLocalIpv4Addresses(): string[] {
  const ifaces = os.networkInterfaces();
  const addrs: string[] = [];
  for (const iface of Object.values(ifaces)) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) addrs.push(info.address);
    }
  }
  return addrs;
}

function subnetHosts(ip: string): string[] {
  const parts = ip.split('.');
  if (parts.length !== 4) return [];
  const prefix = parts.slice(0, 3).join('.');
  const hosts: string[] = [];
  for (let i = 1; i <= 254; i++) hosts.push(`${prefix}.${i}`);
  return hosts;
}

function tcpReachable(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock  = new net.Socket();
    const timer = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
    sock.once('connect', () => { clearTimeout(timer); sock.destroy(); resolve(true); });
    sock.once('error',   () => { clearTimeout(timer); resolve(false); });
    sock.connect(port, ip);
  });
}

function colorModeToEscl(mode: string): string {
  const map: Record<string, string> = {
    Color:         'RGB24',
    Grayscale:     'Grayscale8',
    BlackAndWhite: 'BlackAndWhite1',
  };
  return map[mode] ?? 'Grayscale8';
}

function buildScanXml(opts: { dpi: number; colorMode: string; inputSource: string; mime: string }): string {
  const a4w = Math.round((210 / 25.4) * opts.dpi);
  const a4h = Math.round((297 / 25.4) * opts.dpi);
  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings
  xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
  xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.6</pwg:Version>
  <scan:Intent>Document</scan:Intent>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:Height>${a4h}</pwg:Height>
      <pwg:Width>${a4w}</pwg:Width>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>${opts.inputSource}</pwg:InputSource>
  <scan:ColorMode>${opts.colorMode}</scan:ColorMode>
  <scan:XResolution>${opts.dpi}</scan:XResolution>
  <scan:YResolution>${opts.dpi}</scan:YResolution>
  <pwg:DocumentFormat>${opts.mime}</pwg:DocumentFormat>
</scan:ScanSettings>`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ScannerBridgeService {
  private readonly logger = new Logger(ScannerBridgeService.name);

  /** SSE event stream for real-time scan progress */
  private readonly scanEventSubject = new Subject<ScannerEvent>();

  getScanEventStream(): Observable<ScannerEvent> {
    return this.scanEventSubject.asObservable();
  }

  private emitScanEvent(event: Omit<ScannerEvent, 'timestamp'>) {
    this.scanEventSubject.next({ ...event, timestamp: new Date().toISOString() });
  }

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Local Agent Detection ───────────────────────────────────────────────

  /**
   * Returns true if the local scanner agent is running at 127.0.0.1:48281
   */
  async isLocalAgentAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${AGENT_URL}/health`, {
        signal: AbortSignal.timeout(AGENT_TIMEOUT),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─── Discovery ───────────────────────────────────────────────────────────

  /**
   * Discover real scanners. Strategy (priority order):
   * 1. Local agent (127.0.0.1:48281) — best quality, finds LAN devices
   * 2. Configured SCANNER_IP from .env
   * 3. Windows WIA (USB) — server-side only
   * 4. /24 subnet eSCL sweep — server-side (works when backend is local)
   * 5. Simulator fallback
   */
  async discoverScanners(): Promise<DiscoveredScannerDevice[]> {
    const discovered: DiscoveredScannerDevice[] = [];
    const seenIds = new Set<string>();

    // ── 1. Local Scanner Agent ────────────────────────────────────────────
    let agentAvailable = false;
    try {
      const agentRes = await fetch(`${AGENT_URL}/scanners`, {
        signal: AbortSignal.timeout(AGENT_TIMEOUT),
      });
      if (agentRes.ok) {
        agentAvailable = true;
        const agentDevices: DiscoveredScannerDevice[] = await agentRes.json();
        for (const dev of agentDevices) {
          if (!seenIds.has(dev.id)) {
            seenIds.add(dev.id);
            discovered.push({
              ...dev,
              isAgentDevice: true,
              statusDetails: (dev.statusDetails || '') + ' [via Local Agent]',
            });
          }
        }
        this.logger.log(`Local agent found ${agentDevices.length} device(s).`);
      }
    } catch {
      this.logger.debug('Local scanner agent not running — falling back to server-side discovery.');
    }

    // ── 2. .env configured SCANNER_IP ────────────────────────────────────
    const envIp   = this.config.get<string>('SCANNER_IP');
    const envPort = parseInt(this.config.get<string>('SCANNER_PORT') ?? '80', 10);
    if (envIp && envIp !== 'SIMULATOR' && !seenIds.has(envIp)) {
      await this.probeIp(envIp, seenIds, discovered, 'WIFI', envPort);
    }

    // ── 3. Windows WIA (USB) — only meaningful when backend is local ──────
    if (!agentAvailable && process.platform === 'win32') {
      try {
        const psScript = `
          try {
            $dm = New-Object -ComObject WIA.DeviceManager
            foreach ($d in $dm.DeviceInfos) {
              $n = try { $d.Properties.Item('Name').Value } catch { 'Unknown' }
              Write-Output "$($d.DeviceID)||$n"
            }
          } catch {}
        `;
        const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 5000 }).catch(() => ({ stdout: '' }));
        for (const line of (stdout ?? '').trim().split('\n').filter(Boolean)) {
          const [devId, devName] = line.split('||');
          if (devId && devName && !seenIds.has(devId.trim())) {
            seenIds.add(devId.trim());
            discovered.push({
              id:             devId.trim(),
              name:           devName.trim(),
              displayName:    `USB: ${devName.trim()}`,
              connectionType: 'USB',
              protocol:       'WIA',
              status:         'READY',
              statusDetails:  'USB-Scanner (WIA) am Server',
              capabilities: {
                hasAdf:          false,
                hasFlatbed:      true,
                supportedDpi:    [150, 300, 600],
                colorModes:      ['RGB24', 'Grayscale8', 'BlackAndWhite1'],
                documentFormats: ['image/jpeg', 'image/png'],
              },
            });
          }
        }
      } catch (e: any) {
        this.logger.debug(`WIA probe skipped: ${e.message}`);
      }
    }

    // ── 4. ARP + /24 subnet sweep (server-side — meaningful when local) ───
    if (!agentAvailable) {
      try {
        const { stdout: arpOut } = await execAsync('arp -a', { timeout: 3000 }).catch(() => ({ stdout: '' }));
        const ipRe  = /\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/g;
        const arpIps = [...new Set((arpOut ?? '').match(ipRe) ?? [])];

        const localIps  = getLocalIpv4Addresses();
        const subnetSet = new Set<string>(arpIps);
        for (const lip of localIps) subnetHosts(lip).forEach((h) => subnetSet.add(h));

        const ipList = [...subnetSet].filter((ip) => !seenIds.has(ip));
        const CHUNK  = 40;
        for (let i = 0; i < ipList.length; i += CHUNK) {
          const chunk = ipList.slice(i, i + CHUNK);
          await Promise.all(chunk.map((ip) => this.probeIp(ip, seenIds, discovered)));
        }
      } catch (e: any) {
        this.logger.debug(`Subnet sweep error: ${e.message}`);
      }
    }

    // ── 5. Simulator — always present ─────────────────────────────────────
    if (!seenIds.has('SIMULATOR')) {
      discovered.push({
        id:             'SIMULATOR',
        name:           'LogiFlow Scanner Simulator',
        displayName:    'WLAN-Scanner Simulator (Test-Modus)',
        connectionType: 'WIFI',
        ip:             'SIMULATOR',
        port:           80,
        protocol:       'SIMULATOR',
        status:         'READY',
        statusDetails:  'Virtueller Testscanner — kein echtes Gerät',
        capabilities: {
          hasAdf:          true,
          hasFlatbed:      true,
          supportedDpi:    [150, 300, 600],
          colorModes:      ['RGB24', 'Grayscale8', 'BlackAndWhite1'],
          documentFormats: ['image/jpeg', 'image/png', 'application/pdf'],
        },
      });
    }

    this.logger.log(`Discovery complete — ${discovered.length} device(s) found. Agent: ${agentAvailable ? 'YES' : 'NO'}`);
    return discovered;
  }

  /** Probe a single IP across all eSCL ports */
  private async probeIp(
    ip: string,
    seenIds: Set<string>,
    discovered: DiscoveredScannerDevice[],
    connectionType: 'WIFI' | 'LAN' = 'WIFI',
    explicitPort?: number,
  ): Promise<void> {
    const ports = explicitPort ? [explicitPort] : ESCL_PORTS;
    for (const port of ports) {
      try {
        const open = await tcpReachable(ip, port, PROBE_TIMEOUT);
        if (!open) continue;

        const protocol = (port === 443 || port === 8443) ? 'https' : 'http';
        const capUrl   = `${protocol}://${ip}:${port}/eSCL/ScannerCapabilities`;
        const res      = await fetch(capUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT) });
        if (!res.ok) continue;

        const xml          = await res.text();
        const makeModel    = extractXmlTag(xml, 'MakeAndModel') || extractXmlTag(xml, 'Model') || 'eSCL Scanner';
        const inputSources = extractAllXmlTags(xml, 'InputSource');
        const xRes         = extractAllXmlTags(xml, 'XResolution').map(Number).filter(Boolean);
        const dpis         = [...new Set(xRes)].sort((a, b) => a - b);
        const formats      = extractAllXmlTags(xml, 'DocumentFormat');
        const colorModes   = extractAllXmlTags(xml, 'ColorMode');
        const serial       = extractXmlTag(xml, 'SerialNumber') || null;

        const deviceId = serial
          ? `ESCL_${makeModel.replace(/\s+/g, '_')}_${serial}`
          : `ESCL_${ip.replace(/\./g, '_')}_${port}`;

        if (!seenIds.has(deviceId)) {
          seenIds.add(deviceId);
          discovered.push({
            id:             deviceId,
            name:           makeModel,
            displayName:    makeModel,
            connectionType,
            ip,
            port,
            protocol:       'ESCL',
            serial,
            status:         'READY',
            statusDetails:  `eSCL AirScan — ${ip}:${port}`,
            capabilities: {
              hasAdf:          inputSources.some((s) => s.toLowerCase().includes('feeder')),
              hasFlatbed:      inputSources.some((s) => s.toLowerCase().includes('platen')) || inputSources.length === 0,
              supportedDpi:    dpis.length > 0 ? dpis : [150, 300, 600],
              colorModes:      colorModes.length > 0 ? colorModes : ['RGB24', 'Grayscale8'],
              documentFormats: formats.length > 0 ? formats : ['image/jpeg'],
            },
          });
        }
        return;
      } catch { /* next port */ }
    }
  }

  // ─── Device Status ───────────────────────────────────────────────────────

  async checkScannerStatus(ip?: string, port: number = 80): Promise<{
    status: DiscoveredScannerDevice['status'];
    state?: string;
    details?: string;
  }> {
    if (!ip || ip === 'SIMULATOR') {
      return { status: 'READY', state: 'Idle', details: 'Simulator bereit' };
    }
    try {
      const url = `http://${ip}:${port}/eSCL/ScannerStatus`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return { status: 'ERROR', details: `HTTP ${res.status}` };

      const xml    = await res.text();
      const state  = extractXmlTag(xml, 'State') ?? 'Idle';
      const reason = extractXmlTag(xml, 'AdfState') ?? extractXmlTag(xml, 'Reason') ?? '';

      let status: DiscoveredScannerDevice['status'] = 'READY';
      if (/busy|processing/i.test(state))     status = 'BUSY';
      if (/jam/i.test(reason))                status = 'PAPER_JAM';
      if (/empty|nopaper/i.test(reason))      status = 'NO_PAPER';
      if (/open|cover/i.test(reason))         status = 'COVER_OPEN';

      return { status, state, details: `eSCL Zustand: ${state}` };
    } catch (e: any) {
      return { status: 'OFFLINE', details: `Nicht erreichbar: ${e.message}` };
    }
  }

  // ─── Device Registry (Persistence) ──────────────────────────────────────

  async getConnectedDevices(userId: string) {
    return this.prisma.scannerDevice.findMany({
      where:   { userId },
      orderBy: { lastSeen: 'desc' },
    });
  }

  async connectDevice(userId: string, deviceData: {
    deviceIdentifier: string;
    manufacturer?: string;
    model?: string;
    deviceName: string;
    lastKnownIp?: string;
    port?: number;
    protocol?: string;
    capabilities?: any;
    hasAdf?: boolean;
    hasFlatbed?: boolean;
  }) {
    // Upsert — update if device already saved by this user
    const device = await this.prisma.scannerDevice.upsert({
      where: {
        userId_deviceIdentifier: {
          userId,
          deviceIdentifier: deviceData.deviceIdentifier,
        },
      },
      update: {
        deviceName:   deviceData.deviceName,
        lastKnownIp:  deviceData.lastKnownIp,
        port:         deviceData.port,
        capabilities: deviceData.capabilities,
        hasAdf:       deviceData.hasAdf ?? false,
        hasFlatbed:   deviceData.hasFlatbed ?? true,
        isConnected:  true,
        status:       'READY',
        lastSeen:     new Date(),
        updatedAt:    new Date(),
      },
      create: {
        userId,
        deviceIdentifier: deviceData.deviceIdentifier,
        manufacturer:     deviceData.manufacturer,
        model:            deviceData.model,
        deviceName:       deviceData.deviceName,
        lastKnownIp:      deviceData.lastKnownIp,
        port:             deviceData.port ?? 80,
        protocol:         deviceData.protocol ?? 'ESCL',
        capabilities:     deviceData.capabilities,
        hasAdf:           deviceData.hasAdf ?? false,
        hasFlatbed:       deviceData.hasFlatbed ?? true,
        isConnected:      true,
        status:           'READY',
      },
    });

    this.logger.log(`Device connected: ${device.deviceName} (${device.deviceIdentifier}) for user ${userId}`);
    return device;
  }

  async disconnectDevice(userId: string, deviceId: string) {
    const device = await this.prisma.scannerDevice.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) throw new NotFoundException('Gerät nicht gefunden.');

    return this.prisma.scannerDevice.update({
      where: { id: deviceId },
      data:  { isConnected: false, status: 'UNKNOWN' },
    });
  }

  async getDeviceStatus(userId: string, deviceId: string) {
    const device = await this.prisma.scannerDevice.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) throw new NotFoundException('Gerät nicht gefunden.');

    const live = await this.checkScannerStatus(device.lastKnownIp ?? undefined, device.port ?? 80);

    // Update stored status
    await this.prisma.scannerDevice.update({
      where: { id: deviceId },
      data:  { status: live.status, lastSeen: new Date() },
    });

    return { device, live };
  }

  // ─── Scan Job Tracking ───────────────────────────────────────────────────

  async createScanJob(userId: string, deviceId: string | null, options: TriggerScanOptions) {
    return this.prisma.scanJob.create({
      data: {
        userId,
        deviceId:   deviceId ?? undefined,
        status:     'QUEUED',
        inputSource: options.inputSource ?? 'Platen',
        colorMode:   options.colorMode  ?? 'Grayscale',
        dpi:         options.dpi        ?? 300,
        format:      options.format     ?? 'jpeg',
        batchScan:   options.batchScan  ?? false,
      },
    });
  }

  async updateScanJob(jobId: string, data: Partial<{ status: string; totalPages: number; processedPages: number; errorMessage: string; batchId: string; startedAt: Date; completedAt: Date }>) {
    return this.prisma.scanJob.update({
      where: { id: jobId },
      data,
    });
  }

  async getScanJob(userId: string, jobId: string) {
    const job = await this.prisma.scanJob.findFirst({
      where:   { id: jobId, userId },
      include: { device: true },
    });
    if (!job) throw new NotFoundException('Scan-Auftrag nicht gefunden.');
    return job;
  }

  async cancelScanJob(userId: string, jobId: string) {
    const job = await this.prisma.scanJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('Scan-Auftrag nicht gefunden.');
    return this.prisma.scanJob.update({
      where: { id: jobId },
      data:  { status: 'CANCELLED', completedAt: new Date() },
    });
  }

  // ─── Scanning ────────────────────────────────────────────────────────────

  /**
   * Execute scan. Tries local agent first, then direct eSCL, then WIA.
   * Returns array of page buffers.
   */
  async triggerScan(options: TriggerScanOptions): Promise<{ pages: { buffer: Buffer; mimeType: string }[] }> {
    const ip = options.scannerIp ?? this.config.get<string>('SCANNER_IP');

    // ── Simulator ─────────────────────────────────────────────────────────
    if (ip === 'SIMULATOR' || !ip) {
      this.logger.log('Simulator scan.');
      return { pages: [{ buffer: generateSampleDocumentPng(600, 800), mimeType: 'image/png' }] };
    }

    // ── USB / WIA ─────────────────────────────────────────────────────────
    if (ip.startsWith('USB_') || ip.startsWith('WIA_')) {
      return this.triggerWiaScan();
    }

    // ── Try Local Agent first ─────────────────────────────────────────────
    try {
      const agentRes = await fetch(`${AGENT_URL}/health`, { signal: AbortSignal.timeout(AGENT_TIMEOUT) });
      if (agentRes.ok) {
        this.logger.log(`Delegating scan to local agent for ${ip}`);
        const scanRes = await fetch(`${AGENT_URL}/scan`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(options),
          signal:  AbortSignal.timeout(120_000),
        });
        if (scanRes.ok) {
          const data = await scanRes.json() as { pages: { base64Data: string; mimeType: string }[] };
          const pages = data.pages.map((p) => ({
            buffer:   Buffer.from(p.base64Data, 'base64'),
            mimeType: p.mimeType,
          }));
          return { pages };
        }
      }
    } catch {
      this.logger.debug('Local agent unavailable — falling back to direct eSCL.');
    }

    // ── Direct eSCL (works when backend runs locally) ─────────────────────
    return this.triggerEsclScan(ip, options.scannerPort ?? 80, options);
  }

  private async triggerWiaScan(): Promise<{ pages: { buffer: Buffer; mimeType: string }[] }> {
    const tempOut = path.join(os.tmpdir(), `logiflow_scan_${Date.now()}.jpg`);
    const psScript = `
      try {
        $dm = New-Object -ComObject WIA.DeviceManager
        if ($dm.DeviceInfos.Count -gt 0) {
          $dev  = $dm.DeviceInfos.Item(1).Connect()
          $item = $dev.Items.Item(1)
          $img  = $item.Transfer()
          $img.SaveFile("${tempOut.replace(/\\/g, '\\\\')}")
        } else { exit 1 }
      } catch { exit 2 }
    `;
    await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 25000 });
    if (fs.existsSync(tempOut)) {
      const buffer = fs.readFileSync(tempOut);
      try { fs.unlinkSync(tempOut); } catch {}
      return { pages: [{ buffer, mimeType: 'image/jpeg' }] };
    }
    throw new ServiceUnavailableException('WIA-Scan hat keine Ausgabedatei erzeugt.');
  }

  private async triggerEsclScan(
    ip: string,
    port: number,
    options: TriggerScanOptions,
  ): Promise<{ pages: { buffer: Buffer; mimeType: string }[] }> {
    const dpi         = options.dpi         ?? 300;
    const colorMode   = colorModeToEscl(options.colorMode ?? 'Grayscale');
    const inputSource = options.inputSource ?? 'Platen';
    const format      = options.format      ?? 'jpeg';
    const mime        = format === 'png' ? 'image/png' : 'image/jpeg';
    const batchScan   = options.batchScan && inputSource === 'Feeder';

    const scanXml  = buildScanXml({ dpi, colorMode, inputSource, mime });
    const baseUrl  = `http://${ip}:${port}`;
    const jobsUrl  = `${baseUrl}/eSCL/ScanJobs`;

    this.logger.log(`eSCL scan → ${jobsUrl} [${dpi}DPI ${options.colorMode} ${inputSource}]`);

    const jobRes = await fetch(jobsUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body:    scanXml,
      signal:  AbortSignal.timeout(20_000),
    });

    if (!jobRes.ok && jobRes.status !== 201) {
      throw new ServiceUnavailableException(`eSCL POST /ScanJobs → HTTP ${jobRes.status}`);
    }

    const location    = jobRes.headers.get('location') ?? `${jobsUrl}/Job1`;
    const jobLocation = location.startsWith('http') ? location : `${baseUrl}${location}`;
    const nextDocUrl  = jobLocation.endsWith('/NextDocument') ? jobLocation : `${jobLocation}/NextDocument`;

    const pages: { buffer: Buffer; mimeType: string }[] = [];
    let   done   = false;

    while (!done) {
      let attempt   = 0;
      let pageBuffer: Buffer | null = null;

      while (attempt < 20 && !pageBuffer) {
        attempt++;
        await new Promise((r) => setTimeout(r, 1200));
        const docRes = await fetch(nextDocUrl, { signal: AbortSignal.timeout(15_000) });
        if (docRes.ok) {
          const ab = await docRes.arrayBuffer();
          pageBuffer = Buffer.from(ab);
        } else if (docRes.status === 404) {
          done = true; break; // ADF exhausted / job expired
        } else if (docRes.status === 503) {
          // Scanner still processing — keep polling
        } else {
          break;
        }
      }

      if (pageBuffer) {
        pages.push({ buffer: pageBuffer, mimeType: mime });
        this.logger.log(`Page ${pages.length} scanned (${pageBuffer.length} bytes).`);
        if (!batchScan) done = true;
      } else {
        done = true;
      }
    }

    if (pages.length === 0) {
      throw new ServiceUnavailableException(
        'Scanner hat keine Seiten zurückgegeben. Bitte legen Sie ein Dokument ein und versuchen Sie es erneut.',
      );
    }

    return { pages };
  }
}
