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
  printing: boolean;
  scanning: boolean;
  adf: boolean;
  duplex: boolean;
  flatbed: boolean;
  color: boolean;
  grayscale: boolean;
  supportedDpi: number[];
  supportedPaperSizes: string[];
  documentFormats: string[];
}

export type ScannerBackendType = 'ESCL' | 'WIA' | 'BJNP' | 'WSD' | 'SIMULATOR' | 'NONE';

export interface ScannerBackendInfo {
  type: ScannerBackendType;
  initialized: boolean;
  readyToScan: boolean;
  statusText: string;
}

export interface ScannerDiagnostic {
  discovery: boolean;
  scannerDetected: boolean;
  backend: string;
  backendInitialized: boolean;
  flatbed: boolean;
  adf: boolean;
  duplex: boolean;
  readyToScan: boolean;
  statusText: string;
  remedy?: string | null;
}

export interface DiscoveredDevice {
  id: string;
  name: string;
  displayName: string;
  manufacturer: string;
  model: string;
  type: string;
  connectionType: 'WIFI' | 'USB' | 'LAN' | 'UNKNOWN';
  ip?: string;
  port?: number;
  protocol: string;
  serial?: string | null;
  status: string;
  statusDetails: string;
  capabilities: DeviceCapabilities;
  backend?: ScannerBackendType;
  backendInfo?: ScannerBackendInfo;
  diagnostics?: ScannerDiagnostic;
  sources?: {
    flatbed: boolean;
    adf: boolean;
    duplex: boolean;
  };
  selectedSource?: string;
  adfStatus?: 'Loaded' | 'Empty' | 'Jam' | 'Available' | 'None' | 'Unknown';
}

export interface ScanOptions {
  scannerIp?: string;
  scannerPort?: number;
  dpi?: number;
  colorMode?: 'Color' | 'Grayscale' | 'BlackAndWhite';
  source?: 'auto' | 'adf' | 'flatbed';
  inputSource?: 'Platen' | 'Feeder' | 'FeederDuplex' | 'auto';
  format?: 'jpeg' | 'png' | 'pdf';
  batchScan?: boolean;
  duplex?: boolean;
  multiPage?: boolean;
  pageCount?: number;
  onProgress?: (progress: { status: string; page?: number; message: string }) => void;
  signal?: AbortSignal;
}

export interface ScannedPage {
  pageNumber: number;
  mimeType: string;
  base64Data: string;
}

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
  const r = await fetch(CONNECTOR_URL + '/devices', { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('GET /devices failed: HTTP ' + r.status);
  return r.json();
}

export async function discoverDevices(): Promise<DiscoveredDevice[]> {
  const r = await fetch(CONNECTOR_URL + '/discover', { method: 'POST', signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('POST /discover failed: HTTP ' + r.status);
  return r.json();
}

export async function scanDocument(opts: ScanOptions): Promise<File[]> {
  const effectiveSource = opts.source ?? (opts.inputSource === 'Platen' ? 'flatbed' : (opts.inputSource === 'Feeder' ? 'adf' : 'auto'));
  const payload = {
    scannerIp:   opts.scannerIp,
    scannerPort: opts.scannerPort ?? 80,
    dpi:         opts.dpi ?? 300,
    colorMode:   opts.colorMode ?? 'Grayscale',
    source:      effectiveSource,
    inputSource: opts.inputSource ?? (effectiveSource === 'flatbed' ? 'Platen' : (effectiveSource === 'adf' ? 'Feeder' : 'auto')),
    duplex:      opts.duplex ?? (opts.inputSource === 'FeederDuplex'),
    format:      opts.format ?? 'jpeg',
    multiPage:   opts.multiPage ?? true,
    batchScan:   opts.batchScan ?? true,
    pageCount:   opts.pageCount,
  };

  // Try Async Job Endpoint first for live progress & multi-page ADF status
  try {
    const jobRes = await fetch(CONNECTOR_URL + '/scan/job', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  opts.signal ? opts.signal : AbortSignal.timeout(10000),
    });

    if (jobRes.ok) {
      const jobData = await jobRes.json();
      const jobId = jobData.jobId;
      if (jobId) {
        // Poll Job Status
        while (true) {
          if (opts.signal?.aborted) {
            try { await fetch(`${CONNECTOR_URL}/scan/${jobId}/cancel`, { method: 'POST' }); } catch {}
            throw new Error('Scan abgebrochen');
          }

          await new Promise((r) => setTimeout(r, 600));

          const statusRes = await fetch(`${CONNECTOR_URL}/scan/${jobId}/status`);
          if (!statusRes.ok) continue;
          const status = await statusRes.json();

          if (opts.onProgress && status.message) {
            opts.onProgress({
              status:  status.status,
              page:    status.pageCount,
              message: status.message,
            });
          }

          if (status.status === 'COMPLETED') {
            const rawPages: ScannedPage[] = status.pages || [];
            return rawPages.map((p, idx) => {
              const bytes = atob(p.base64Data);
              const arr = new Uint8Array(bytes.length);
              for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
              const blob = new Blob([arr], { type: p.mimeType || 'image/jpeg' });
              const ext = (p.mimeType || '').includes('png') ? 'png' : 'jpg';
              return new File([blob], `scan_${Date.now()}_page${idx + 1}.${ext}`, {
                type: p.mimeType || 'image/jpeg',
                lastModified: Date.now(),
              });
            });
          }

          if (status.status === 'FAILED' || status.status === 'CANCELLED') {
            throw new Error(status.error || status.message || 'Scanauftrag fehlgeschlagen');
          }
        }
      }
    }
  } catch (err: any) {
    if (err.message === 'Scan abgebrochen') throw err;
    // Fallback to synchronous /scan
  }

  // Fallback: Synchronous POST /scan
  const r = await fetch(CONNECTOR_URL + '/scan', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  opts.signal ? opts.signal : AbortSignal.timeout(180000), // 3 minutes timeout for large ADF batches
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let errDetail = t;
    try {
      const parsed = JSON.parse(t);
      if (parsed.message) errDetail = parsed.message;
      else if (parsed.error) errDetail = parsed.error;
    } catch {}
    throw new Error('Scan fehlgeschlagen: ' + errDetail);
  }

  const rawData = await r.json();
  const pages: ScannedPage[] = Array.isArray(rawData) ? rawData : (rawData.pages || []);
  return pages.map((p, idx) => {
    const bytes = atob(p.base64Data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: p.mimeType || 'image/jpeg' });
    const ext = (p.mimeType || '').includes('png') ? 'png' : 'jpg';
    return new File([blob], 'scan_' + Date.now() + '_page' + (idx + 1) + '.' + ext, {
      type: p.mimeType || 'image/jpeg',
      lastModified: Date.now(),
    });
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

export interface ConnectorReleaseInfo {
  latestVersion: string;
  changelog: string;
  installerUrl: {
    windows: string;
    macos: string;
    fallback: string;
  };
}

/**
 * Fetch the backend's latest connector release info.
 * Returns null on network failure so callers can degrade gracefully.
 */
export async function fetchLatestRelease(apiBaseUrl: string): Promise<ConnectorReleaseInfo | null> {
  try {
    const r = await fetch(apiBaseUrl + '/scanner/connector-info', { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

/**
 * Compare two semantic version strings.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
  const [a0, a1, a2] = parse(a); const [b0, b1, b2] = parse(b);
  return (a0 - b0) || (a1 - b1) || (a2 - b2);
}
