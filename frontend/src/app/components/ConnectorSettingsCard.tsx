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
  Scan,
  Printer,
} from "lucide-react";
import {
  checkConnectorStatus,
  fetchLatestRelease,
  detectPlatform,
  compareVersions,
  getDevices,
  CONNECTOR_URL,
  type ConnectorStatusResult,
  type ConnectorReleaseInfo,
  type DiscoveredDevice,
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
      <span className="text-on-surface-variant w-32 shrink-0">{label}</span>
      <span className="text-on-surface font-medium flex-1">{value ?? "—"}</span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function ConnectorSettingsCard() {
  const [connStatus, setConnStatus]         = useState<ConnectorStatusResult>({ status: "checking" });
  const [release, setRelease]               = useState<ConnectorReleaseInfo | null>(null);
  const [activeDevice, setActiveDevice]     = useState<DiscoveredDevice | null>(null);
  const [deviceList, setDeviceList]         = useState<DiscoveredDevice[]>([]);
  const [isRefreshing, setIsRefreshing]     = useState(false);
  const [lastSeen, setLastSeen]             = useState<{ version: string; ts: string } | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [downloading, setDownloading]       = useState(false);
  const [verifyMsg, setVerifyMsg]           = useState<"idle" | "verifying" | "success" | "fail">("idle");
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

  // ── poll connector health & devices every 8s ────────────────────────────────
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await checkConnectorStatus();
      setConnStatus(result);

      if (result.status === "connected" || result.status === "outdated") {
        // persist last seen
        const entry = { version: result.version ?? "", ts: new Date().toISOString() };
        try { localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(entry)); } catch {}
        setLastSeen(entry);

        // Fetch real discovered devices from connector
        try {
          const devices = await getDevices();
          setDeviceList(devices || []);
          if (devices && devices.length > 0) {
            // Prioritize physical scanner (eSCL Wi-Fi or USB) over PDF virtual printer
            const realScanner =
              devices.find((d) => d.protocol === "ESCL" || (d.ip && d.ip !== "SIMULATOR" && !d.id.includes("PDF"))) ||
              devices.find((d) => d.ip && d.ip !== "SIMULATOR") ||
              devices[0];

            setActiveDevice(realScanner || null);
          } else {
            setActiveDevice(null);
          }
        } catch {
          // Ignore discovery poll failures
        }
      } else {
        setActiveDevice(null);
      }
    } finally {
      setIsRefreshing(false);
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
  const startVerifyPolling = useCallback((expectedVersion?: string) => {
    setVerifyMsg("verifying");
    let attempts = 0;
    const MAX = 15; // 15 × 2s = 30s
    verifyInterval.current = setInterval(async () => {
      attempts++;
      const r = await checkConnectorStatus();
      if (r.status === "connected" || r.status === "outdated") {
        const updated = expectedVersion ? compareVersions(r.version || "0", expectedVersion) >= 0 : true;
        if (updated) {
          clearInterval(verifyInterval.current!);
          setVerifyMsg("success");
          setConnStatus(r);
          refresh();
          return; // Stay on success screen until user dismisses or clicks start scanning
        }
      }
      if (attempts >= MAX) {
        clearInterval(verifyInterval.current!);
        setVerifyMsg("fail");
        setTimeout(() => setVerifyMsg("idle"), 8000);
      }
    }, 2000);
  }, [refresh]);

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

    // If update available, we expect the latest version. If initial install, we just expect a connection.
    if (latestVer) startVerifyPolling(latestVer);
    else startVerifyPolling();
  }, [platform, release, latestVer, startVerifyPolling]);

  const handleDismissUpdate = useCallback(() => {
    setUpdateDismissed(true);
    try { localStorage.setItem(DISMISSED_UPDATE_KEY, latestVer ?? ""); } catch {}
  }, [latestVer]);

  const isOffline = connStatus.status === "missing" || connStatus.status === "error";
  const hasAdf = activeDevice?.capabilities?.adf ?? activeDevice?.sources?.adf ?? false;

  // ── Render Verification Screens ──
  if (verifyMsg === "verifying") {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 text-center flex flex-col items-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Installation wird verifiziert...</h2>
        <p className="text-sm text-slate-600">Bitte warten, während der Connector im Hintergrund gestartet wird.</p>
      </div>
    );
  }

  if (verifyMsg === "success") {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8">
        <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">Connector installed successfully</h2>
        
        <div className="max-w-xs mx-auto space-y-3 mb-8">
          <div className="flex items-center gap-3 text-emerald-700 font-medium">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>Connector installed</span>
          </div>
          <div className="flex items-center gap-3 text-emerald-700 font-medium">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>Connector running</span>
          </div>
          <div className="flex items-center gap-3 text-emerald-700 font-medium">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>Connection established</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 text-center mb-8">
          <h3 className="font-bold text-slate-800 mb-4">You're ready to scan documents.</h3>
          <div className="flex flex-col gap-2 text-sm text-slate-600">
            <div className="flex justify-center gap-2">
              <span className="font-medium text-slate-500">Scanner:</span>
              <span className="font-semibold text-slate-800">{activeDevice?.displayName || activeDevice?.name || "Scanner gefunden"}</span>
            </div>
            <div className="flex justify-center gap-2">
              <span className="font-medium text-slate-500">ADF:</span>
              <span className={`font-semibold ${hasAdf ? "text-emerald-600" : "text-slate-800"}`}>
                {hasAdf ? "Ready" : "Not Available"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/timesheets"
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-lg text-center transition-colors shadow-sm"
          >
            Start Scanning
          </a>
          <button
            onClick={() => setVerifyMsg("idle")}
            className="w-full sm:w-auto bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-6 py-2.5 rounded-lg transition-colors"
          >
            Open Connector Settings
          </button>
        </div>
      </div>
    );
  }

  if (verifyMsg === "fail") {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Connector installed, but connection could not be verified.</h2>
        <p className="text-sm text-slate-600 mb-8">
          The connector might still be starting, or a firewall is blocking the connection.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => startVerifyPolling(latestVer)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            Try Again
          </button>
          <button
            onClick={handleDownload}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-6 py-2.5 rounded-lg transition-colors"
          >
            Re-download Connector
          </button>
        </div>
      </div>
    );
  }

  // ── Main UI ──
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Scan className="w-5 h-5 text-slate-500" />
          Scanner Connector
        </h2>

        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-3 text-sm">
            <span className="w-24 text-slate-500 font-medium shrink-0">Status:</span>
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <span className={`w-2.5 h-2.5 rounded-full ${isOffline ? "bg-slate-400" : "bg-emerald-500"}`} />
              {isOffline ? "Offline" : "Connected"}
            </div>
          </div>
          
          <div className="flex items-center gap-3 text-sm">
            <span className="w-24 text-slate-500 font-medium shrink-0">Version:</span>
            <span className="font-semibold text-slate-800">
              {connStatus.version ? `${connStatus.version}` : "Not installed"}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="w-24 text-slate-500 font-medium shrink-0">Scanner:</span>
            <span className="font-semibold text-slate-800">
              {activeDevice ? (activeDevice.displayName || activeDevice.name) : (isOffline ? "—" : "Searching...")}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="w-24 text-slate-500 font-medium shrink-0">ADF:</span>
            <span className={`font-semibold ${hasAdf ? "text-emerald-600" : "text-slate-800"}`}>
              {isOffline ? "—" : (hasAdf ? "Ready" : "Not Ready")}
            </span>
          </div>
        </div>

        {updateAvailable && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-bold text-blue-900 mb-1">Update Available (v{latestVer})</h4>
                <p className="text-sm text-blue-700">A new version of the Scanner Connector is available for download.</p>
              </div>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-md transition-colors shadow-sm flex items-center gap-2"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Update Connector
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-slate-100 pt-6">
          <a
            href="/timesheets"
            className="flex-1 sm:flex-none text-center bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <Scan className="w-4 h-4" />
            Scan Document
          </a>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 sm:flex-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Re-download Connector
          </button>
        </div>
      </div>
    </div>
  );
}
