"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Printer,
  Wifi,
  Usb,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plug,
  PlugZap,
  Activity,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2,
  Radio,
  Monitor,
  Hash,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { API_URL } from "../../../config/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScannerDeviceRaw {
  id: string;
  name: string;
  displayName?: string;
  manufacturer?: string;
  model?: string;
  type?: string;
  connectionType: "WIFI" | "USB" | "LAN" | "UNKNOWN";
  ip?: string;
  port?: number;
  protocol?: string;
  serial?: string | null;
  status: string;
  statusDetails?: string;
  isAgentDevice?: boolean;
  capabilities?: {
    hasAdf?: boolean;
    hasFlatbed?: boolean;
    adf?: boolean;
    flatbed?: boolean;
    duplex?: boolean;
    color?: boolean;
    grayscale?: boolean;
    supportedDpi?: number[];
    colorModes?: string[];
    documentFormats?: string[];
    supportedPaperSizes?: string[];
  };
}

export interface SavedDevice {
  id: string;
  deviceIdentifier: string;
  deviceName: string;
  manufacturer?: string;
  model?: string;
  lastKnownIp?: string;
  port?: number;
  protocol?: string;
  isConnected: boolean;
  hasAdf: boolean;
  hasFlatbed: boolean;
  status: string;
  lastSeen: string;
  capabilities?: any;
}

interface DeviceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceSelected: (device: SavedDevice) => void;
  selectedDeviceId?: string | null;
}

type DiscoveryState = "idle" | "searching" | "found" | "empty" | "error";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function getStatusColor(status: string) {
  const s = (status || "").toUpperCase();
  switch (s) {
    case "READY":
    case "AVAILABLE":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    case "BUSY":
    case "SCANNING":
      return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    case "PAPER_JAM":
    case "NO_PAPER":
    case "COVER_OPEN":
    case "ERROR":
      return "text-red-400 bg-red-500/10 border-red-500/30";
    case "OFFLINE":
      return "text-slate-400 bg-slate-500/10 border-slate-500/30";
    default:
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  }
}

function getStatusLabel(status: string) {
  const s = (status || "").toUpperCase();
  const labels: Record<string, string> = {
    READY:      "Bereit",
    AVAILABLE:  "Bereit",
    BUSY:       "Beschäftigt",
    SCANNING:   "Scannt",
    PAPER_JAM:  "Papierstau",
    NO_PAPER:   "Kein Papier",
    COVER_OPEN: "Abdeckung offen",
    ERROR:      "Fehler",
    OFFLINE:    "Offline",
    UNKNOWN:    "Bereit",
  };
  return labels[s] ?? status;
}

function getProtocolIcon(protocol?: string, connectionType?: string) {
  if (connectionType === "USB") return <Usb className="w-4 h-4 text-purple-400" />;
  if (protocol === "SIMULATOR") return <Monitor className="w-4 h-4 text-slate-400" />;
  return <Wifi className="w-4 h-4 text-cyan-400" />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CapabilityBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${
      active
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
        : "bg-slate-800/60 text-slate-500 border-slate-700/50 line-through opacity-50"
    }`}>
      {active && <CheckCircle2 className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
}

function DiscoveredDeviceCard({
  device,
  isSaved,
  isConnecting,
  onConnect,
}: {
  device: ScannerDeviceRaw;
  isSaved: boolean;
  isConnecting: boolean;
  onConnect: (device: ScannerDeviceRaw) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border transition-all ${
        isSaved
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600/80"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Icon + Name */}
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              device.connectionType === "USB"
                ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                : device.protocol === "SIMULATOR"
                ? "bg-slate-700/50 border-slate-600/30 text-slate-400"
                : "bg-blue-500/10 border-blue-500/20 text-blue-400"
            }`}>
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-100">
                  {device.displayName || device.name}
                </span>
                {device.isAgentDevice && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 font-bold">
                    LOCAL AGENT
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {getProtocolIcon(device.protocol, device.connectionType)}
                <span className="text-xs text-slate-400">
                  {device.connectionType === "USB"
                    ? "USB"
                    : device.ip && device.ip !== "SIMULATOR"
                    ? `${device.ip}:${device.port}`
                    : device.connectionType}
                </span>
                {device.protocol && device.protocol !== "SIMULATOR" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 border border-slate-600/30">
                    {device.protocol}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status + Action */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${getStatusColor(device.status)}`}>
              {getStatusLabel(device.status)}
            </span>
            {isSaved ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verbunden
              </div>
            ) : (
              <button
                onClick={() => onConnect(device)}
                disabled={isConnecting || device.status === "OFFLINE"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20 cursor-pointer"
              >
                {isConnecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plug className="w-3.5 h-3.5" />
                )}
                Verbinden
              </button>
            )}
          </div>
        </div>

        {/* Capabilities summary */}
        {device.capabilities && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <CapabilityBadge label="Scanner"    active={true} />
            <CapabilityBadge label="ADF"        active={Boolean(device.capabilities.hasAdf ?? device.capabilities.adf)} />
            <CapabilityBadge label="Flachbett"  active={Boolean(device.capabilities.hasFlatbed ?? device.capabilities.flatbed ?? true)} />
            <CapabilityBadge label="Farbe"      active={Boolean(device.capabilities.color ?? device.capabilities.colorModes?.some(m => /rgb|color/i.test(m)) ?? true)} />
            {(device.capabilities.supportedDpi?.length ?? 0) > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600/40 bg-slate-700/30 text-slate-400">
                bis {Math.max(...(device.capabilities.supportedDpi || [300]))} DPI
              </span>
            )}
          </div>
        )}

        {/* Expand details */}
        {device.statusDetails && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-400 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Details
          </button>
        )}
        <AnimatePresence>
          {expanded && device.statusDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <p className="mt-2 text-xs text-slate-500 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/40">
                {device.statusDetails}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function SavedDeviceCard({
  device,
  isSelected,
  onSelect,
  onDisconnect,
}: {
  device: SavedDevice;
  isSelected: boolean;
  onSelect: (device: SavedDevice) => void;
  onDisconnect: (id: string) => void;
}) {
  return (
    <motion.div
      layout
      onClick={() => onSelect(device)}
      className={`rounded-2xl border cursor-pointer transition-all ${
        isSelected
          ? "border-blue-500/70 bg-blue-500/8 ring-1 ring-blue-500/30"
          : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600/80"
      }`}
    >
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${
            isSelected
              ? "bg-blue-500/15 border-blue-500/30 text-blue-400"
              : "bg-slate-700/40 border-slate-600/30 text-slate-400"
          }`}>
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-sm text-slate-100">{device.deviceName}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-400">
                {device.lastKnownIp ? `${device.lastKnownIp}:${device.port}` : device.protocol}
              </span>
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                {device.hasAdf && <span className="px-1.5 py-0.5 rounded bg-slate-700/50 border border-slate-600/30">ADF</span>}
                {device.hasFlatbed && <span className="px-1.5 py-0.5 rounded bg-slate-700/50 border border-slate-600/30">Flachbett</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${getStatusColor(device.status)}`}>
            {getStatusLabel(device.status)}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDisconnect(device.id); }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Gerät entfernen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function DeviceManagerModal({
  isOpen,
  onClose,
  onDeviceSelected,
  selectedDeviceId,
}: DeviceManagerModalProps) {
  const [activeTab, setActiveTab]               = useState<"myDevices" | "discover">("myDevices");
  const [discoveryState, setDiscoveryState]     = useState<DiscoveryState>("idle");
  const [discoveredDevices, setDiscoveredDevices] = useState<ScannerDeviceRaw[]>([]);
  const [savedDevices, setSavedDevices]         = useState<SavedDevice[]>([]);
  const [connectingId, setConnectingId]         = useState<string | null>(null);
  const [agentAvailable, setAgentAvailable]     = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg]                 = useState<string>("");

  // Manual IP fallback state
  const [showManualIp, setShowManualIp]   = useState(false);
  const [manualIp, setManualIp]           = useState("");
  const [manualPort, setManualPort]       = useState("80");
  const [testingManual, setTestingManual] = useState(false);

  const loadSavedDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/documents/scanner/devices`, { headers: authHeaders() });
      if (res.ok) setSavedDevices(await res.json());
    } catch {}
  }, []);

  const checkAgentStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/documents/scanner/agent-status`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAgentAvailable(data.agentAvailable);
      }
    } catch { setAgentAvailable(false); }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSavedDevices();
      checkAgentStatus();
    }
  }, [isOpen, loadSavedDevices, checkAgentStatus]);

  const handleDiscover = async () => {
    setDiscoveryState("searching");
    setErrorMsg("");
    setDiscoveredDevices([]);
    try {
      const res = await fetch(`${API_URL}/documents/scanner/discover`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const devices: ScannerDeviceRaw[] = await res.json();
      setDiscoveredDevices(devices);
      setDiscoveryState(devices.length > 0 ? "found" : "empty");
    } catch (e: any) {
      setErrorMsg(e.message || "Suche fehlgeschlagen.");
      setDiscoveryState("error");
    }
  };

  const handleConnect = async (device: ScannerDeviceRaw) => {
    setConnectingId(device.id);
    setErrorMsg("");
    try {
      const payload = {
        deviceIdentifier: device.id,
        deviceName:       device.displayName || device.name,
        lastKnownIp:      device.ip,
        port:             device.port,
        protocol:         device.protocol || "ESCL",
        capabilities:     device.capabilities,
        hasAdf:           device.capabilities?.hasAdf ?? false,
        hasFlatbed:       device.capabilities?.hasFlatbed ?? true,
      };
      const res = await fetch(`${API_URL}/documents/scanner/devices`, {
        method:  "POST",
        headers: authHeaders(),
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Verbindung fehlgeschlagen (HTTP ${res.status})`);
      const saved: SavedDevice = await res.json();
      setSavedDevices((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)]);
      setActiveTab("myDevices");
      onDeviceSelected(saved);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setConnectingId(null);
    }
  };

  const handleConnectManual = async () => {
    if (!manualIp.trim()) return;
    setTestingManual(true);
    setErrorMsg("");
    const fakeDevice: ScannerDeviceRaw = {
      id:             `ESCL_${manualIp.replace(/\./g, "_")}_${manualPort}`,
      name:           `Netzwerk-Scanner (${manualIp})`,
      displayName:    `Netzwerk-Scanner (${manualIp})`,
      connectionType: "WIFI",
      ip:             manualIp.trim(),
      port:           parseInt(manualPort, 10) || 80,
      protocol:       "ESCL",
      status:         "READY",
      capabilities: {
        hasAdf:          false,
        hasFlatbed:      true,
        supportedDpi:    [150, 300, 600],
        colorModes:      ["RGB24", "Grayscale8"],
        documentFormats: ["image/jpeg"],
      },
    };
    try {
      // Test connectivity first
      const statusRes = await fetch(
        `${API_URL}/documents/scanner/status?ip=${encodeURIComponent(manualIp)}&port=${manualPort}`,
        { headers: authHeaders() }
      );
      if (statusRes.ok) {
        const status = await statusRes.json();
        fakeDevice.status = status.status || "READY";
        fakeDevice.statusDetails = status.details;
      }
      await handleConnect(fakeDevice);
    } catch (e: any) {
      setErrorMsg("Manuelle IP konnte nicht getestet werden: " + e.message);
    } finally {
      setTestingManual(false);
    }
  };

  const handleDisconnect = async (deviceId: string) => {
    try {
      await fetch(`${API_URL}/documents/scanner/devices/${deviceId}`, {
        method:  "DELETE",
        headers: authHeaders(),
      });
      setSavedDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch {}
  };

  const handleSelectSaved = (device: SavedDevice) => {
    onDeviceSelected(device);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <Printer className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-100 text-lg">Drucker & Scanner</h2>
                  <p className="text-xs text-slate-400">Geräte im Netzwerk suchen und verbinden</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Agent Status Banner */}
            {agentAvailable !== null && (
              <div className={`px-6 py-2.5 flex items-center gap-2 text-xs border-b ${
                agentAvailable
                  ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/8 border-amber-500/20 text-amber-400"
              }`}>
                {agentAvailable ? (
                  <><ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" /> Local Scanner Agent aktiv — LAN-Scanner werden erkannt</>
                ) : (
                  <><Activity className="w-3.5 h-3.5 flex-shrink-0" /> Local Agent nicht gestartet — starte <code className="font-mono bg-black/30 px-1 rounded">scanner-agent/index.js</code> auf deinem PC für beste Erkennung</>
                )}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-800 flex-shrink-0">
              {(["myDevices", "discover"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                    activeTab === tab
                      ? "text-blue-400 border-b-2 border-blue-500"
                      : "text-slate-400 hover:text-slate-300"
                  }`}
                >
                  {tab === "myDevices" ? `Meine Geräte (${savedDevices.length})` : "Suche im Netzwerk"}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {/* ── My Devices Tab ─────────────────────────────────────── */}
                {activeTab === "myDevices" && (
                  <motion.div
                    key="myDevices"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="p-6 space-y-3"
                  >
                    {savedDevices.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/40 mb-4">
                          <Printer className="w-10 h-10 text-slate-600" />
                        </div>
                        <p className="text-slate-300 font-semibold mb-1">Noch keine Geräte verbunden</p>
                        <p className="text-xs text-slate-500 max-w-xs">
                          Klicke auf „Suche im Netzwerk" um Drucker und Scanner automatisch zu finden.
                        </p>
                        <button
                          onClick={() => setActiveTab("discover")}
                          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all"
                        >
                          <Search className="w-4 h-4" />
                          Geräte suchen
                        </button>
                      </div>
                    ) : (
                      <>
                        {savedDevices.map((device) => (
                          <SavedDeviceCard
                            key={device.id}
                            device={device}
                            isSelected={selectedDeviceId === device.id}
                            onSelect={handleSelectSaved}
                            onDisconnect={handleDisconnect}
                          />
                        ))}
                        <button
                          onClick={() => setActiveTab("discover")}
                          className="w-full py-3 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-600 text-sm transition-colors flex items-center justify-center gap-2"
                        >
                          <Search className="w-4 h-4" />
                          Weiteres Gerät hinzufügen
                        </button>
                      </>
                    )}
                  </motion.div>
                )}

                {/* ── Discover Tab ───────────────────────────────────────── */}
                {activeTab === "discover" && (
                  <motion.div
                    key="discover"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    className="p-6 space-y-4"
                  >
                    {/* Search button */}
                    {discoveryState === "idle" && (
                      <div className="flex flex-col items-center py-10 gap-4">
                        <div className="relative">
                          <div className="p-6 rounded-3xl bg-blue-500/10 border border-blue-500/20">
                            <Radio className="w-12 h-12 text-blue-400" />
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-200 font-semibold text-lg">Gerät im Netzwerk suchen</p>
                          <p className="text-slate-400 text-sm mt-1 max-w-xs">
                            Findet Drucker und Scanner automatisch im lokalen WLAN.
                          </p>
                        </div>
                        <button
                          onClick={handleDiscover}
                          className="flex items-center gap-2.5 px-8 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all shadow-xl shadow-blue-600/25 hover:shadow-blue-500/30"
                        >
                          <Search className="w-5 h-5" />
                          Geräte suchen
                        </button>
                      </div>
                    )}

                    {/* Searching animation */}
                    {discoveryState === "searching" && (
                      <div className="flex flex-col items-center py-12 gap-5">
                        <div className="relative">
                          <motion.div
                            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.1, 0.4] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute inset-0 rounded-full bg-blue-500/20"
                          />
                          <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                            className="absolute inset-2 rounded-full bg-blue-500/15"
                          />
                          <div className="relative p-5 rounded-full bg-blue-500/10 border border-blue-500/30">
                            <Wifi className="w-8 h-8 text-blue-400" />
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-200 font-semibold">Suche im Netzwerk…</p>
                          <p className="text-xs text-slate-400 mt-1">Scannt mDNS, ARP-Tabelle und /24 Subnetz</p>
                        </div>
                        <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <motion.div
                            animate={{ x: ["-100%", "100%"] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            className="h-full w-1/2 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full"
                          />
                        </div>
                      </div>
                    )}

                    {/* Results */}
                    {(discoveryState === "found" || discoveryState === "empty") && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-300">
                            {discoveryState === "found"
                              ? `${discoveredDevices.length} Gerät(e) gefunden`
                              : "Keine Geräte gefunden"}
                          </span>
                          <button
                            onClick={handleDiscover}
                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Erneut suchen
                          </button>
                        </div>

                        {discoveryState === "found" ? (
                          discoveredDevices.map((device) => (
                            <DiscoveredDeviceCard
                              key={device.id}
                              device={device}
                              isSaved={savedDevices.some((s) => s.deviceIdentifier === device.id)}
                              isConnecting={connectingId === device.id}
                              onConnect={handleConnect}
                            />
                          ))
                        ) : (
                          <div className="py-8 text-center rounded-2xl border border-dashed border-slate-700 bg-slate-800/20">
                            <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                            <p className="text-slate-300 font-medium mb-1">Kein Scanner gefunden</p>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                              Prüfe: Scanner eingeschaltet? Gleiches WLAN? AirScan/eSCL aktiviert?
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {(discoveryState === "error" || errorMsg) && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-red-300 text-xs">{errorMsg}</p>
                      </div>
                    )}

                    {/* Manual IP Fallback */}
                    <div className="pt-2">
                      <button
                        onClick={() => setShowManualIp((v) => !v)}
                        className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-400 transition-colors py-1"
                      >
                        <span className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5" />
                          Gerät per IP-Adresse verbinden
                        </span>
                        {showManualIp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      <AnimatePresence>
                        {showManualIp && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 p-4 rounded-xl border border-slate-700/50 bg-slate-800/30 space-y-3">
                              <p className="text-xs text-slate-400">
                                Falls der Scanner nicht automatisch gefunden wird, gib die IP-Adresse manuell ein.
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="192.168.1.50"
                                  value={manualIp}
                                  onChange={(e) => setManualIp(e.target.value)}
                                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                                />
                                <input
                                  type="number"
                                  placeholder="80"
                                  value={manualPort}
                                  onChange={(e) => setManualPort(e.target.value)}
                                  className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                                />
                                <button
                                  onClick={handleConnectManual}
                                  disabled={testingManual || !manualIp.trim()}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                  {testingManual ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <PlugZap className="w-4 h-4" />
                                  )}
                                  Verbinden
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                HP-Drucker: Port 8080 • Brother/Canon/Epson: Port 80 • Verschlüsselt: Port 443
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 flex-shrink-0">
              <p className="text-xs text-slate-500">
                Unterstützt: Brother, HP, Canon, Epson, Lexmark • eSCL / AirScan • USB (WIA)
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 text-sm transition-colors"
              >
                Schließen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
