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
  Edit2,
  Save,
  Server
} from "lucide-react";
import {
  checkConnectorStatus,
  fetchLatestRelease,
  detectPlatform,
  compareVersions,
  getDevices,
  getConnectorUrl,
  setConnectorUrl,
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

  // IP Editing State
  const [isEditingIp, setIsEditingIp] = useState(false);
  const [ipInput, setIpInput] = useState("");

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

  // Initialize IP input from current URL
  useEffect(() => {
    setIpInput(getConnectorUrl().replace(/^https?:\/\//, ""));
  }, []);

  // ── poll connector health & devices every 8s ────────────────────────────────
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await checkConnectorStatus();
      setConnStatus(result);

      if (result.status === "connected" || result.status === "outdated") {
        const entry = { version: result.version ?? "", ts: new Date().toISOString() };
        try { localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(entry)); } catch {}
        setLastSeen(entry);

        try {
          const devices = await getDevices();
          setDeviceList(devices || []);
          if (devices && devices.length > 0) {
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
    const MAX = 15;
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
          return;
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

    if (latestVer) startVerifyPolling(latestVer);
    else startVerifyPolling();
  }, [platform, release, latestVer, startVerifyPolling]);

  const handleSaveIp = () => {
    setConnectorUrl(ipInput);
    setIsEditingIp(false);
    refresh(); // immediately check new ip
  };

  const isOffline = connStatus.status === "missing" || connStatus.status === "error";
  const hasAdf = activeDevice?.capabilities?.adf ?? activeDevice?.sources?.adf ?? false;

  // ── Render Verification Screens ──
  if (verifyMsg === "verifying") {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-100 rounded-2xl shadow-lg p-10 text-center flex flex-col items-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-6 drop-shadow-sm" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Verifying Connection...</h2>
        <p className="text-slate-600 font-medium">Please wait while the connector is starting in the background.</p>
      </div>
    );
  }

  if (verifyMsg === "success") {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-100 rounded-2xl shadow-lg p-10">
        <h2 className="text-2xl font-black text-slate-800 mb-8 text-center tracking-tight">Connector Verified!</h2>
        
        <div className="max-w-sm mx-auto space-y-4 mb-10">
          <div className="flex items-center gap-4 text-emerald-700 bg-white/60 p-3 rounded-xl border border-emerald-100">
            <CheckCircle className="w-6 h-6 shrink-0 drop-shadow-sm text-emerald-500" />
            <span className="font-semibold">Installed successfully</span>
          </div>
          <div className="flex items-center gap-4 text-emerald-700 bg-white/60 p-3 rounded-xl border border-emerald-100">
            <CheckCircle className="w-6 h-6 shrink-0 drop-shadow-sm text-emerald-500" />
            <span className="font-semibold">Connector running actively</span>
          </div>
          <div className="flex items-center gap-4 text-emerald-700 bg-white/60 p-3 rounded-xl border border-emerald-100">
            <CheckCircle className="w-6 h-6 shrink-0 drop-shadow-sm text-emerald-500" />
            <span className="font-semibold">Connection established</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/timesheets"
            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-bold px-8 py-3 rounded-xl text-center transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          >
            Start Scanning
          </a>
          <button
            onClick={() => setVerifyMsg("idle")}
            className="w-full sm:w-auto bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 font-bold px-8 py-3 rounded-xl transition-all"
          >
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  if (verifyMsg === "fail") {
    return (
      <div className="bg-white border-2 border-red-100 rounded-2xl shadow-lg p-10 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-400 to-rose-500" />
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500 drop-shadow-sm" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">Verification Failed</h2>
        <p className="text-slate-600 font-medium mb-10 max-w-md mx-auto leading-relaxed">
          The connector might still be starting, or a firewall is blocking the connection. If you are on another device, check the IP settings.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => startVerifyPolling(latestVer)}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          >
            Try Again
          </button>
          <button
            onClick={() => setVerifyMsg("idle")}
            className="bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 font-bold px-8 py-3 rounded-xl transition-all"
          >
            Check Settings
          </button>
        </div>
      </div>
    );
  }

  // ── Premium UI Render ──
  return (
    <div className="relative group rounded-3xl p-[2px] bg-gradient-to-b from-slate-200 to-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative bg-white rounded-[22px] overflow-hidden">
        {/* Header Section */}
        <div className="bg-slate-50/80 backdrop-blur-md border-b border-slate-100 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isOffline ? "bg-slate-100 text-slate-400" : "bg-indigo-50 text-indigo-600"}`}>
              <Scan className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">Scanner Connector</h2>
              <p className="text-xs font-medium text-slate-500">Local Hardware Bridge</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              {!isOffline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOffline ? "bg-slate-300" : "bg-emerald-500"}`}></span>
            </span>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              {isOffline ? "Offline" : "Connected"}
            </span>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Status & Device Details */}
          <div className="space-y-6">
            
            {/* Version & IP */}
            <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Server className="w-4 h-4" />
                  <span className="text-sm font-semibold">Connector IP</span>
                </div>
                {isEditingIp ? (
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={ipInput} 
                      onChange={e => setIpInput(e.target.value)}
                      className="text-sm font-mono border-b-2 border-indigo-400 bg-transparent outline-none w-32 px-1 text-slate-800"
                      placeholder="127.0.0.1:48281"
                      autoFocus
                    />
                    <button onClick={handleSaveIp} className="p-1 hover:bg-slate-200 rounded-md text-indigo-600 transition-colors">
                      <Save className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group/edit cursor-pointer" onClick={() => setIsEditingIp(true)}>
                    <span className="text-sm font-mono font-medium text-slate-800 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">{ipInput}</span>
                    <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover/edit:text-indigo-500 transition-colors" />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Cpu className="w-4 h-4" />
                  <span className="text-sm font-semibold">Version</span>
                </div>
                <span className="text-sm font-bold text-slate-800">
                  {connStatus.version ? `v${connStatus.version}` : "Not installed"}
                </span>
              </div>
            </div>

            {/* Active Scanner Details */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Detected Hardware</h3>
              
              <div className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                activeDevice 
                  ? "bg-gradient-to-r from-emerald-50/50 to-white border-emerald-100 shadow-sm" 
                  : "bg-slate-50 border-slate-100"
              }`}>
                <div className={`p-2 rounded-lg ${activeDevice ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-400"}`}>
                  {activeDevice ? <Printer className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    {activeDevice ? (activeDevice.displayName || activeDevice.name) : "No Scanner Found"}
                  </h4>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                      hasAdf ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                    }`}>
                      {hasAdf ? "ADF Ready" : "Flatbed Only"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions & Updates */}
          <div className="flex flex-col justify-between space-y-6">
            
            {updateAvailable ? (
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden group/update">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full blur-2xl transform translate-x-10 -translate-y-10 group-hover/update:scale-150 transition-transform duration-700" />
                <div className="relative z-10">
                  <h4 className="font-black text-lg mb-1 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" /> Update Available
                  </h4>
                  <p className="text-indigo-100 text-sm font-medium mb-4">Version {latestVer} brings new improvements.</p>
                  
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="w-full bg-white text-indigo-600 hover:bg-indigo-50 font-black text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Download Update
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col items-center justify-center text-center h-full">
                <CheckCircle className="w-8 h-8 text-slate-300 mb-2" />
                <h4 className="font-bold text-slate-600">Up to date</h4>
                <p className="text-xs font-medium text-slate-400 mt-1">You're running the latest connector.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <a
                href="/timesheets"
                className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <Scan className="w-4 h-4" /> Go Scan
              </a>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Re-install
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
