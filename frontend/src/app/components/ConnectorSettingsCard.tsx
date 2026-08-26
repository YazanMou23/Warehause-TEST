"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Download,
  CheckCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  Loader2,
  Zap,
  Clock,
  Cpu,
} from "lucide-react";
import {
  checkConnectorStatus,
  fetchLatestRelease,
  detectPlatform,
  compareVersions,
  CONNECTOR_URL,
  type ConnectorStatusResult,
  type ConnectorReleaseInfo,
} from "../../lib/connector";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const LAST_SEEN_KEY = "logiflow_connector_last_seen";
const DISMISSED_UPDATE_KEY = "logiflow_dismissed_update";

// ─── helpers ──────────────────────────────────────────────────────────────────
function saveLastSeen(version: string) {
  try {
    localStorage.setItem(
      LAST_SEEN_KEY,
      JSON.stringify({ version, ts: new Date().toISOString() })
    );
  } catch {}
}

function loadLastSeen(): { version: string; ts: string } | null {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatRelative(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  return `vor ${Math.floor(s / 86400)} Tagen`;
}

// ─── sub-components ───────────────────────────────────────────────────────────
function StatusPill({ status, version }: { status: ConnectorStatusResult["status"]; version?: string }) {
  const configs: Record<string, { dot: string; bg: string; text: string; label: string }> = {
    connected:  { dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200",  text: "text-emerald-700", label: "Verbunden" },
    outdated:   { dot: "bg-amber-500",   bg: "bg-amber-50 border-amber-200",      text: "text-amber-700",   label: "Veraltet" },
    missing:    { dot: "bg-slate-400",   bg: "bg-slate-50 border-slate-200",      text: "text-slate-600",   label: "Offline" },
    error:      { dot: "bg-red-500",     bg: "bg-red-50 border-red-200",          text: "text-red-700",     label: "Fehler" },
    checking:   { dot: "bg-blue-400 animate-pulse", bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Prüfe..." },
  };
  const c = configs[status] ?? configs.checking;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
      {version && status !== "checking" && <span className="opacity-70 font-normal ml-0.5">v{version}</span>}
    </span>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className="text-outline shrink-0">{icon}</span>
      <span className="text-on-surface-variant w-28 shrink-0">{label}</span>
      <span className="text-on-surface font-medium">{value ?? "—"}</span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function ConnectorSettingsCard() {
  const [connStatus, setConnStatus]     = useState<ConnectorStatusResult>({ status: "checking" });
  const [release, setRelease]           = useState<ConnectorReleaseInfo | null>(null);
  const [scannerName, setScannerName]   = useState<string | null>(null);
  const [hasAdf, setHasAdf]             = useState<boolean | null>(null);
  const [lastSeen, setLastSeen]         = useState<{ version: string; ts: string } | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [downloading, setDownloading]   = useState(false);
  const [verifyMsg, setVerifyMsg]       = useState<"idle" | "verifying" | "success" | "fail">("idle");
  const verifyInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const platform = detectPlatform();

  // derive update state
  const installedVer = connStatus.version;
  const latestVer    = release?.latestVersion;
  const updateAvailable = !!(
    installedVer &&
    latestVer &&
    compareVersions(installedVer, latestVer) < 0 &&
    !updateDismissed
  );

  // ── poll connector health every 8s ──────────────────────────────────────────
  const refresh = useCallback(async () => {
    const result = await checkConnectorStatus();
    setConnStatus(result);

    if (result.status === "connected" || result.status === "outdated") {
      // persist last seen
      const entry = { version: result.version ?? "", ts: new Date().toISOString() };
      try { localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(entry)); } catch {}
      setLastSeen(entry);

      // fetch extended health for scanner name + ADF
      try {
        const h = await fetch(CONNECTOR_URL + "/health", { signal: AbortSignal.timeout(2000) });
        if (h.ok) {
          const data = await h.json();
          setScannerName(data.scanner?.name ?? null);
          setHasAdf(
            Array.isArray(data.features)
              ? data.features.includes("adf")
              : data.scanner?.sources?.adf ?? null
          );
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    const ls = loadLastSeen();
    setLastSeen(ls);
    const dismissed = localStorage.getItem(DISMISSED_UPDATE_KEY) ?? "";
    setUpdateDismissed(!!dismissed);

    refresh();
    fetchLatestRelease(API_BASE).then(setRelease);

    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, [refresh]);

  // ── verified-update polling ──────────────────────────────────────────────────
  const startVerifyPolling = useCallback((expectedVersion: string) => {
    setVerifyMsg("verifying");
    let attempts = 0;
    const MAX = 15; // 15 × 2s = 30s
    verifyInterval.current = setInterval(async () => {
      attempts++;
      const r = await checkConnectorStatus();
      if ((r.status === "connected" || r.status === "outdated") && r.version) {
        const updated = compareVersions(r.version, expectedVersion) >= 0;
        if (updated) {
          clearInterval(verifyInterval.current!);
          setVerifyMsg("success");
          setConnStatus(r);
          setTimeout(() => setVerifyMsg("idle"), 6000);
          return;
        }
      }
      if (attempts >= MAX) {
        clearInterval(verifyInterval.current!);
        setVerifyMsg("fail");
        setTimeout(() => setVerifyMsg("idle"), 8000);
      }
    }, 2000);
  }, []);

  useEffect(() => () => { if (verifyInterval.current) clearInterval(verifyInterval.current); }, []);

  // ── download + verify ────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const installerPath =
      platform === "windows"
        ? release?.installerUrl.windows ?? "/scanner/download-installer?platform=windows"
        : platform === "macos"
        ? release?.installerUrl.macos ?? "/scanner/download-installer?platform=macos"
        : release?.installerUrl.fallback ?? "/scanner/download-installer";

    setDownloading(true);
    const link = document.createElement("a");
    link.href = API_BASE + installerPath;
    link.download =
      platform === "windows"
        ? "LogiFlow-Connector-Setup.exe"
        : platform === "macos"
        ? "LogiFlow-Connector.dmg"
        : "LogiFlow-Connector.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setDownloading(false), 2000);

    if (latestVer) startVerifyPolling(latestVer);
  }, [platform, release, latestVer, startVerifyPolling]);

  const handleDismissUpdate = useCallback(() => {
    setUpdateDismissed(true);
    try { localStorage.setItem(DISMISSED_UPDATE_KEY, latestVer ?? ""); } catch {}
  }, [latestVer]);

  const isOffline = connStatus.status === "missing" || connStatus.status === "error";

  return (
    <div className="bg-white border border-outline-variant rounded-lg shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-md ${isOffline ? "bg-slate-100" : "bg-secondary/10"}`}>
            {isOffline
              ? <WifiOff className="w-4.5 h-4.5 text-slate-500" />
              : <Wifi className="w-4.5 h-4.5 text-secondary" />}
          </div>
          <h5 className="font-bold text-body-lg text-on-surface">Scanner Connector</h5>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill status={connStatus.status} version={connStatus.version} />
          <button
            onClick={refresh}
            title="Status aktualisieren"
            className="p-1.5 rounded-md hover:bg-surface-container-low text-outline transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Update Available banner ── */}
      {updateAvailable && (
        <div className="mx-5 mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <Zap className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[13px] text-amber-800">Neue Connector-Version verfügbar</p>
            <p className="text-[12px] text-amber-700 mt-0.5">
              Installiert: <strong>v{installedVer}</strong> &rarr; Aktuell: <strong>v{latestVer}</strong>
            </p>
            {release?.changelog && (
              <p className="text-[11px] text-amber-600 mt-1 italic">{release.changelog}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-[12px] font-bold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
            >
              {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Update Now
            </button>
            <button
              onClick={handleDismissUpdate}
              className="text-amber-700 text-[12px] hover:underline px-1"
            >
              Später
            </button>
          </div>
        </div>
      )}

      {/* ── Version mismatch (latest version loaded, connector says it's up to date) ── */}
      {!updateAvailable && latestVer && installedVer && compareVersions(installedVer, latestVer) >= 0 && (
        <div className="mx-5 mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 flex items-center gap-2 text-[12px] text-emerald-700">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>Connector ist auf dem neuesten Stand <strong>(v{installedVer})</strong></span>
        </div>
      )}

      {/* ── Verify result toast ── */}
      {verifyMsg === "verifying" && (
        <div className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-2 text-[12px] text-blue-700">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Warte auf Connector-Neustart… (bis 30s)
        </div>
      )}
      {verifyMsg === "success" && (
        <div className="mx-5 mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 flex items-center gap-2 text-[12px] text-emerald-700 font-semibold">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Connector erfolgreich aktualisiert.
        </div>
      )}
      {verifyMsg === "fail" && (
        <div className="mx-5 mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-center gap-2 text-[12px] text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Connector hat sich nach dem Update nicht neu verbunden. Bitte manuell starten.
        </div>
      )}

      {/* ── Info rows ── */}
      <div className="px-5 py-4 space-y-3">
        <InfoRow
          icon={<Cpu className="w-4 h-4" />}
          label="Scanner"
          value={
            connStatus.status === "connected"
              ? (scannerName ?? (
                  <span className="text-outline text-[12px]">Kein Gerät verbunden</span>
                ))
              : <span className="text-outline text-[12px]">—</span>
          }
        />

        <InfoRow
          icon={<Zap className="w-4 h-4" />}
          label="ADF Einzug"
          value={
            hasAdf === null
              ? <span className="text-outline text-[12px]">—</span>
              : hasAdf
                ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />Verfügbar</span>
                : <span className="text-slate-500">Nicht verfügbar</span>
          }
        />

        <InfoRow
          icon={<Info className="w-4 h-4" />}
          label="Version installiert"
          value={
            connStatus.version
              ? <span>v{connStatus.version}</span>
              : <span className="text-outline text-[12px]">Nicht installiert</span>
          }
        />

        <InfoRow
          icon={<ChevronRight className="w-4 h-4" />}
          label="Neueste Version"
          value={
            latestVer
              ? <span>v{latestVer}</span>
              : <span className="text-outline text-[12px]">Lädt…</span>
          }
        />

        <InfoRow
          icon={<Clock className="w-4 h-4" />}
          label="Zuletzt verbunden"
          value={
            connStatus.status === "connected"
              ? "Gerade eben"
              : lastSeen
                ? formatRelative(lastSeen.ts)
                : <span className="text-outline text-[12px]">Noch nie</span>
          }
        />
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-outline-variant mx-5" />

      {/* ── Actions ── */}
      <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="bg-secondary hover:bg-secondary/90 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 text-[13px] cursor-pointer"
        >
          {downloading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Download className="w-4 h-4" />}
          {isOffline ? "Connector herunterladen" : "Neu herunterladen"}
        </button>

        {isOffline && (
          <div className="flex items-start gap-1.5 text-[12px] text-outline bg-surface-container-low p-2.5 rounded border border-outline-variant flex-1 min-w-0">
            <Info className="w-3.5 h-3.5 shrink-0 text-secondary mt-0.5" />
            <span>
              Connector ist offline. Laden Sie den Installer herunter, führen Sie ihn auf diesem PC aus und öffnen Sie LogiFlow erneut.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
