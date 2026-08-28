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
  Server,
  Play
} from "lucide-react";
import {
  fetchLatestRelease,
  detectPlatform,
  compareVersions,
  getConnectorUrl,
  setConnectorUrl,
  type ConnectorReleaseInfo,
} from "../../lib/connector";
import { useConnector } from "../../lib/ConnectorContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const DISMISSED_UPDATE_KEY = "logiflow_dismissed_update";

export default function ConnectorSettingsCard() {
  const { 
    status, 
    statusDetails,
    version: installedVer, 
    devices,
    activeDevice, 
    isChecking, 
    isDiscovering,
    isStarting,
    refreshStatus,
    discoverDevices,
    startConnector
  } = useConnector();
  
  const [release, setRelease]               = useState<ConnectorReleaseInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [downloading, setDownloading]       = useState(false);

  // IP Editing State
  const [isEditingIp, setIsEditingIp] = useState(false);
  const [ipInput, setIpInput] = useState("");

  const platform = detectPlatform();

  const latestVer = release?.latestVersion || '3.0.0';
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

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_UPDATE_KEY) ?? "";
    setUpdateDismissed(!!dismissed);
    fetchLatestRelease(API_BASE).then(setRelease);
  }, []);

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
  }, [platform, release]);

  const handleSaveIp = async () => {
    setConnectorUrl(ipInput);
    setIsEditingIp(false);
    await refreshStatus();
  };

  const isOnline = status === 'CONNECTED' || status === 'READY';
  const hasAdf = activeDevice?.capabilities?.adf ?? activeDevice?.sources?.adf ?? false;

  // Status Badge UI
  const getStatusBadge = () => {
    if (isChecking) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
          <Loader2 className="w-3 h-3 animate-spin" /> Prüfe...
        </span>
      );
    }
    if (isStarting || status === 'STARTING') {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200">
          <Loader2 className="w-3 h-3 animate-spin" /> Startet...
        </span>
      );
    }
    if (status === 'READY') {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Bereit ({devices.length} Geräte)
        </span>
      );
    }
    if (status === 'CONNECTED') {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Verbunden
        </span>
      );
    }
    if (status === 'UPDATE_REQUIRED') {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200">
          <AlertTriangle className="w-3 h-3" /> Update erforderlich
        </span>
      );
    }
    if (status === 'INSTALLED_NOT_RUNNING') {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Nicht aktiv
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
        <span className="w-2 h-2 rounded-full bg-slate-400" /> Nicht installiert
      </span>
    );
  };

  return (
    <div className="relative group rounded-3xl p-[2px] bg-gradient-to-b from-slate-200 to-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative bg-white rounded-[22px] overflow-hidden">
        {/* Header Section */}
        <div className="bg-slate-50/80 backdrop-blur-md border-b border-slate-100 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isOnline ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
              <Scan className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">Scanner Connector</h2>
              <p className="text-xs font-medium text-slate-500">Lokale Hardware-Bridge (WLAN &amp; USB)</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {getStatusBadge()}
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
                      onChange={(e) => setIpInput(e.target.value)}
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
                  {installedVer ? `v${installedVer}` : "Nicht aktiv"}
                </span>
              </div>
            </div>

            {/* Active Scanner Details */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Erkanntes Scan-Gerät</h3>
                {isOnline && (
                  <button
                    onClick={discoverDevices}
                    disabled={isDiscovering}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isDiscovering ? 'animate-spin' : ''}`} />
                    Geräte suchen
                  </button>
                )}
              </div>
              
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
                    {activeDevice ? (activeDevice.displayName || activeDevice.name) : (isOnline ? "Kein Scanner gefunden" : "Connector offline")}
                  </h4>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                      hasAdf ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                    }`}>
                      {hasAdf ? "ADF Bereit" : "Flachbett"}
                    </span>
                    {activeDevice?.ip && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono">
                        {activeDevice.ip}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions & Updates */}
          <div className="flex flex-col justify-between space-y-6">
            
            {status === 'UPDATE_REQUIRED' || updateAvailable ? (
              <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                  <h4 className="font-black text-lg mb-1 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" /> Update verfügbar (v{latestVer})
                  </h4>
                  <p className="text-orange-100 text-sm font-medium mb-4">
                    Neue Version mit verbesserter Treiber-Erkennung und robuster ADF-Steuerung.
                  </p>
                  
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="w-full bg-white text-orange-600 hover:bg-orange-50 font-black text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Update herunterladen
                  </button>
                </div>
              </div>
            ) : status === 'INSTALLED_NOT_RUNNING' ? (
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                  <Zap className="w-4 h-4 text-indigo-600" />
                  <span>Dienst im Hintergrund starten</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Der Connector ist auf Ihrem PC installiert. Klicken Sie hier, um ihn im Hintergrund aufzuwecken.
                </p>
                <button
                  onClick={startConnector}
                  disabled={isStarting}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                  <span>{isStarting ? 'Starte Dienst...' : 'Connector jetzt starten'}</span>
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col items-center justify-center text-center h-full">
                <CheckCircle className="w-8 h-8 text-emerald-400 mb-2" />
                <h4 className="font-bold text-slate-700">Connector v3.0</h4>
                <p className="text-xs font-medium text-slate-400 mt-1">
                  {isOnline ? "Aktiv und einsatzbereit für Scans." : "Bereit zur Installation."}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <a
                href="/timesheets"
                className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <Scan className="w-4 h-4" /> Zum Scan
              </a>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Installer laden
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
