import { buildPdfFromJpegs, type JpegPage } from "./jpeg-pdf";
import { selectableScanners, type ConnectorScanner } from "./scanner-select";

export { pickScanner, selectableScanners, type ConnectorScanner } from "./scanner-select";

// The LogiFlow connector runs on the user's Windows PC. The browser talks to it
// directly; the cloud backend can never reach it.
export const CONNECTOR_URL = "http://127.0.0.1:48281";
export const CONNECTOR_DOWNLOAD_URL = process.env.NEXT_PUBLIC_CONNECTOR_DOWNLOAD_URL || "";
const LAST_PRINTER_KEY = "warehause.lastScannerId";

export type ConnectorProbe =
  | { state: "ready"; version: string; legacy: boolean }
  | { state: "not_running" }
  | { state: "blocked" };

export class ConnectorError extends Error {
  constructor(public code: "not_running" | "blocked" | "no_scanner" | "scan_failed" | "cancelled" | "simulator", message?: string) {
    super(message || code);
  }
}

async function call(path: string, init?: RequestInit, timeoutMs = 4000): Promise<Response> {
  try {
    return await fetch(`${CONNECTOR_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ConnectorError("not_running");
  }
}

export async function probeConnector(): Promise<ConnectorProbe> {
  try {
    const res = await call("/health", undefined, 1500);
    if (res.status === 403) return { state: "blocked" };
    if (!res.ok) return { state: "not_running" };
    const data = await res.json();
    // The old Node test connector (windows-connector/) answers on the same port and
    // produces fake simulator scans. Treat it as "not usable".
    const legacy = String(data?.connectorId || "") === "logiflow-windows-connector";
    return { state: "ready", version: String(data?.version || ""), legacy };
  } catch {
    return { state: "not_running" };
  }
}

export function getLastScannerId(): string | null {
  try {
    return localStorage.getItem(LAST_PRINTER_KEY);
  } catch {
    return null;
  }
}
export function rememberScannerId(id: string): void {
  try {
    localStorage.setItem(LAST_PRINTER_KEY, id);
  } catch {
    /* ignore */
  }
}

export async function listScanners(forceDiscover = false): Promise<ConnectorScanner[]> {
  if (forceDiscover) await call("/discover", { method: "POST" }, 15000).catch(() => undefined);
  const res = await call("/devices", undefined, 5000);
  if (res.status === 403) throw new ConnectorError("blocked");
  if (!res.ok) throw new ConnectorError("not_running");
  return selectableScanners((await res.json()) as ConnectorScanner[]);
}

interface JobPage {
  page_number?: number;
  pageNumber?: number;
  mime_type?: string;
  mimeType?: string;
  base64_data?: string;
  base64Data?: string;
}

export interface ScanProgress {
  (message: string): void;
}

export type ScanSource = "auto" | "adf" | "flatbed";

export type ScanConnection = "auto" | "escl" | "wia";

export function normalizeScanConnection(v: string | null | undefined): ScanConnection {
  return v === "escl" || v === "wia" ? v : "auto";
}

export function normalizeScanSource(v: string | null | undefined): ScanSource {
  return v === "adf" || v === "flatbed" ? v : "auto";
}

/** Start a scan on the connector and wait for the pages (base64). */
export async function scanPages(
  deviceId: string,
  onProgress?: ScanProgress,
  isCancelled?: () => boolean,
  source: ScanSource = "auto",
  connection: ScanConnection = "auto",
): Promise<JobPage[]> {
  const start = await call(
    "/scan/job",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, source, connection, format: "jpeg", dpi: 200, colorMode: "Color" }),
    },
    10000,
  );
  if (start.status === 403) throw new ConnectorError("blocked");
  const started = await start.json().catch(() => ({}));
  if (!start.ok || !started.jobId) {
    throw new ConnectorError("scan_failed", started?.message || started?.error);
  }
  const jobId = String(started.jobId);
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    if (isCancelled?.()) {
      await call(`/scan/${jobId}/cancel`, { method: "POST" }, 4000).catch(() => undefined);
      throw new ConnectorError("cancelled");
    }
    await new Promise((r) => setTimeout(r, 1000));
    const res = await call(`/scan/${jobId}/status`, undefined, 5000);
    const st = await res.json().catch(() => ({}));
    // Never hand simulator pages to the app: they are fake test images.
    if (/simulator/i.test(String(st.message || "")) || /simulator/i.test(String(st.backend || st.backendType || ""))) {
      await call(`/scan/${jobId}/cancel`, { method: "POST" }, 4000).catch(() => undefined);
      throw new ConnectorError("simulator");
    }
    if (st.message) onProgress?.(String(st.message));
    if (st.status === "COMPLETED") return (st.pages || []) as JobPage[];
    if (st.status === "FAILED") throw new ConnectorError("scan_failed", st.error || st.message);
    if (st.status === "CANCELLED") throw new ConnectorError("cancelled");
    if (st.status === "NOT_FOUND") throw new ConnectorError("scan_failed", st.message);
  }
  throw new ConnectorError("scan_failed", "timeout");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Normalise any scanned page to a JPEG (needed to know its size and to embed in a PDF). */
async function toJpegPage(page: JobPage): Promise<JpegPage> {
  const b64 = page.base64_data || page.base64Data || "";
  const mime = page.mime_type || page.mimeType || "image/jpeg";
  const bytes = base64ToBytes(b64);
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ConnectorError("scan_failed", "canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  const jpeg: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ConnectorError("scan_failed", "jpeg"))), "image/jpeg", 0.9),
  );
  const data = new Uint8Array(await jpeg.arrayBuffer());
  return { data, width: canvas.width, height: canvas.height };
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** One image file per page (used by Stundenzettel, which processes pages one by one). */
export async function pagesToImageFiles(pages: JobPage[]): Promise<File[]> {
  const files: File[] = [];
  const base = stamp();
  for (let i = 0; i < pages.length; i++) {
    const j = await toJpegPage(pages[i]);
    files.push(new File([j.data as unknown as BlobPart], `scan-${base}-${i + 1}.jpg`, { type: "image/jpeg" }));
  }
  return files;
}

/** One PDF file with all pages (used by Containerliste, which takes a single file). */
export async function pagesToPdfFile(pages: JobPage[]): Promise<File> {
  const jpegs: JpegPage[] = [];
  for (const p of pages) jpegs.push(await toJpegPage(p));
  const pdf = buildPdfFromJpegs(jpegs);
  return new File([pdf as unknown as BlobPart], `scan-${stamp()}.pdf`, { type: "application/pdf" });
}
