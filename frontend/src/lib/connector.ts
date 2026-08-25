export const CONNECTOR_URL = 'http://127.0.0.1:48281';
export const CONNECTOR_MIN_VERSION = '2.0.0';
export const HEALTH_CHECK_TIMEOUT_MS = 2000;

export type ConnectorStatus = 'checking' | 'connected' | 'outdated' | 'missing' | 'error';

export interface ConnectorStatusResult {
  status: ConnectorStatus;
  version?: string;
  platform?: string;
  connectorId?: string;
  errorMessage?: string;
}

export interface DeviceCapabilities {
  printing: boolean; scanning: boolean; adf: boolean; duplex: boolean;
  flatbed: boolean; color: boolean; grayscale: boolean;
  supportedDpi: number[]; supportedPaperSizes: string[];
  documentFormats: string[];
}

export interface DiscoveredDevice {
  id: string; name: string; displayName: string; manufacturer: string;
  model: string; type: string; connectionType: 'WIFI' | 'USB' | 'LAN' | 'UNKNOWN';
  ip?: string; port?: number; protocol: string; serial?: string | null;
  status: string; statusDetails: string; capabilities: DeviceCapabilities;
}

export interface ScanOptions {
  scannerIp?: string; scannerPort?: number; dpi?: number;
  colorMode?: 'Color' | 'Grayscale' | 'BlackAndWhite';
  inputSource?: 'Platen' | 'Feeder' | 'FeederDuplex';
  format?: 'jpeg' | 'png'; batchScan?: boolean;
}

export interface ScannedPage { pageNumber: number; mimeType: string; base64Data: string; }

export async function checkConnectorStatus(): Promise<ConnectorStatusResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const response = await fetch(CONNECTOR_URL + '/health', { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return { status: 'error', errorMessage: 'HTTP ' + response.status };
    const health = await response.json();
    const isOutdated = compareVersions(health.version || '0', CONNECTOR_MIN_VERSION) < 0;
    return { status: isOutdated ? 'outdated' : 'connected', version: health.version, platform: health.platform, connectorId: health.connectorId };
  } catch (err: any) {
    const msg = String(err);
    if (err?.name === 'AbortError' || msg.includes('fetch') || msg.includes('ECONNREFUSED')) return { status: 'missing' };
    return { status: 'error', errorMessage: err?.message ?? 'Unknown error' };
  }
}

export async function getDevices(): Promise<DiscoveredDevice[]> {
  const r = await fetch(CONNECTOR_URL + '/devices', { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('GET /devices failed: HTTP ' + r.status);
  return r.json();
}

export async function discoverDevices(): Promise<DiscoveredDevice[]> {
  const r = await fetch(CONNECTOR_URL + '/discover', { method: 'POST', signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('POST /discover failed: HTTP ' + r.status);
  return r.json();
}

export async function scanDocument(opts: ScanOptions): Promise<File[]> {
  const payload = {
    scannerIp: opts.scannerIp, scannerPort: opts.scannerPort ?? 80,
    dpi: opts.dpi ?? 300, colorMode: opts.colorMode ?? 'Grayscale',
    inputSource: opts.inputSource ?? 'Platen', format: opts.format ?? 'jpeg',
    batchScan: opts.batchScan ?? false,
  };
  const r = await fetch(CONNECTOR_URL + '/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Scan failed (HTTP ' + r.status + '): ' + t); }
  const rawData = await r.json();
  const pages: ScannedPage[] = Array.isArray(rawData) ? rawData : (rawData.pages || []);
  return pages.map((p, idx) => {
    const bytes = atob(p.base64Data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: p.mimeType || 'image/jpeg' });
    const ext = (p.mimeType || '').includes('png') ? 'png' : 'jpg';
    return new File([blob], 'scan_' + Date.now() + '_page' + (idx + 1) + '.' + ext,
      { type: p.mimeType || 'image/jpeg', lastModified: Date.now() });
  });
}

export type Platform = 'windows' | 'macos' | 'unknown';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  return 'unknown';
}

export function getInstallerInfo(apiBaseUrl: string): { platform: Platform; fileName: string; label: string; apiPath: string } {
  const p = detectPlatform();
  if (p === 'windows') return { platform: p, fileName: 'LogiFlow-Connector-Setup.exe', label: 'Für Windows herunterladen (.exe)', apiPath: apiBaseUrl + '/scanner/download-installer?platform=windows' };
  if (p === 'macos')   return { platform: p, fileName: 'LogiFlow-Connector.dmg',       label: 'Für macOS herunterladen (.dmg)',  apiPath: apiBaseUrl + '/scanner/download-installer?platform=macos' };
  return { platform: p, fileName: 'LogiFlow-Connector.zip', label: 'Connector herunterladen', apiPath: apiBaseUrl + '/scanner/download-installer' };
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
  const [a0, a1, a2] = parse(a); const [b0, b1, b2] = parse(b);
  return (a0 - b0) || (a1 - b1) || (a2 - b2);
}
