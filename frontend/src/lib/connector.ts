let connectorUrlCache = 'http://127.0.0.1:48281';

if (typeof window !== 'undefined') {
  connectorUrlCache = localStorage.getItem('logiflow_connector_url') || 'http://127.0.0.1:48281';
}

export function getConnectorUrl(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('logiflow_connector_url') || 'http://127.0.0.1:48281';
  }
  return connectorUrlCache;
}

export function setConnectorUrl(url: string) {
  let finalUrl = url.trim();
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = 'http://' + finalUrl;
  }
  // Strip trailing slash if present
  if (finalUrl.endsWith('/')) {
    finalUrl = finalUrl.slice(0, -1);
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem('logiflow_connector_url', finalUrl);
  }
  connectorUrlCache = finalUrl;
}

export const CONNECTOR_MIN_VERSION = '3.0.0';
export const HEALTH_CHECK_TIMEOUT_MS = 2500;

export type ConnectorStatusType =
  | 'NOT_INSTALLED'
  | 'INSTALLED_NOT_RUNNING'
  | 'STARTING'
  | 'RECONNECTING'
  | 'CONNECTED'
  | 'READY'
  | 'UPDATE_REQUIRED'
  | 'ERROR';

export interface ConnectorStatusResult {
  status: ConnectorStatusType;
  version?: string;
  platform?: string;
  connectorId?: string;
  port?: number;
  errorMessage?: string;
  lastSeen?: string;
}

export interface DeviceCapabilities {
  printing?: boolean;
  scanning?: boolean;
  adf?: boolean;
  duplex?: boolean;
  flatbed?: boolean;
  color?: boolean;
  grayscale?: boolean;
  supportedDpi?: number[];
  defaultDpi?: number;
  supportedFormats?: string[];
  supportedPaperSizes?: string[];
  documentFormats?: string[];
  maxMediaDimensions?: any;
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

const REG_KEY_VERSION = 'logiflow_connector_registered_version';
const REG_KEY_LAST_SEEN = 'logiflow_connector_last_seen';

/**
 * Perform a live handshake check against the local connector service.
 * Correctly differentiates NOT_INSTALLED vs INSTALLED_NOT_RUNNING vs UPDATE_REQUIRED vs CONNECTED.
 */
export async function checkConnectorStatus(): Promise<ConnectorStatusResult> {
  const url = getConnectorUrl();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return { status: 'ERROR', errorMessage: `HTTP ${response.status}` };
    }

    const health = await response.json();
    const ver = health.connectorVersion || health.version || '3.0.0';

    // Store verified installation registration
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(REG_KEY_VERSION, ver);
        localStorage.setItem(REG_KEY_LAST_SEEN, new Date().toISOString());
      } catch {}
    }

    const isOutdated = compareVersions(ver, CONNECTOR_MIN_VERSION) < 0;
    return {
      status: isOutdated ? 'UPDATE_REQUIRED' : 'CONNECTED',
      version: ver,
      platform: health.platform || 'windows',
      connectorId: health.connectorId || 'logiflow-windows-connector',
      port: health.port || 48281,
    };
  } catch (err: any) {
    const msg = String(err);
    const isNetworkError = err?.name === 'AbortError' || msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch');

    if (isNetworkError && typeof window !== 'undefined') {
      const recordedVer = localStorage.getItem(REG_KEY_VERSION);
      const recordedSeen = localStorage.getItem(REG_KEY_LAST_SEEN);

      if (recordedVer || recordedSeen) {
        return {
          status: 'INSTALLED_NOT_RUNNING',
          version: recordedVer || undefined,
          lastSeen: recordedSeen || undefined,
          errorMessage: 'Connector ist auf diesem Gerät installiert, läuft aber aktuell nicht.',
        };
      }
      return { status: 'NOT_INSTALLED' };
    }

    return { status: 'ERROR', errorMessage: err?.message ?? 'Verbindungsfehler' };
  }
}

/**
 * Launch the local background connector service via custom protocol handler
 */
export function launchLocalConnector() {
  if (typeof window === 'undefined') return;
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = 'logiflow-connector://start';
    document.body.appendChild(iframe);
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch {}
    }, 1200);
  } catch {}
}

export async function getDevices(): Promise<DiscoveredDevice[]> {
  const r = await fetch(getConnectorUrl() + '/devices', { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('GET /devices failed: HTTP ' + r.status);
  return r.json();
}

export async function discoverDevices(): Promise<DiscoveredDevice[]> {
  const r = await fetch(getConnectorUrl() + '/discover', { method: 'POST', signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('POST /discover failed: HTTP ' + r.status);
  return r.json();
}

export async function getConnectorDiagnostics(): Promise<any> {
  const r = await fetch(getConnectorUrl() + '/diagnostics', { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('GET /diagnostics failed: HTTP ' + r.status);
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
    const jobRes = await fetch(getConnectorUrl() + '/scan/job', {
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
            try { await fetch(`${getConnectorUrl()}/scan/${jobId}/cancel`, { method: 'POST' }); } catch {}
            throw new Error('Scan abgebrochen');
          }

          await new Promise((r) => setTimeout(r, 600));

          const statusRes = await fetch(`${getConnectorUrl()}/scan/${jobId}/status`);
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
  const r = await fetch(getConnectorUrl() + '/scan', {
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
  if (p === 'windows') return { platform: p, fileName: 'LogiFlow-Connector-Setup.exe', label: 'Für Windows herunterladen (v3.0.0 .exe)', apiPath: apiBaseUrl + '/scanner/download-installer?platform=windows' };
  if (p === 'macos')   return { platform: p, fileName: 'LogiFlow-Connector.dmg',       label: 'Für macOS herunterladen (.dmg)',  apiPath: apiBaseUrl + '/scanner/download-installer?platform=macos' };
  return { platform: p, fileName: 'LogiFlow-Connector.zip', label: 'Connector herunterladen (v3.0.0)', apiPath: apiBaseUrl + '/scanner/download-installer' };
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
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [a0, a1, a2] = parse(a);
  const [b0, b1, b2] = parse(b);
  return (a0 - b0) || (a1 - b1) || (a2 - b2);
}
