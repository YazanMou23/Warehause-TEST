"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Printer,
  RefreshCw,
  Play,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Settings2,
  Wifi,
  Usb,
  Loader2,
  ScanLine,
  ChevronRight,
  Layers,
  ZapOff,
} from "lucide-react";
import { API_URL } from "../../../config/api";
import DeviceManagerModal, { type SavedDevice } from "./DeviceManagerModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanPage {
  pageNumber: number;
  mimeType: string;
  base64Data: string;
}

interface ScannerCaptureTabProps {
  onScanCompleted: (doc: {
    originalFileName: string;
    source: "SCANNER";
    mimeType: string;
    pages: ScanPage[];
  }) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScannerCaptureTab({ onScanCompleted }: ScannerCaptureTabProps) {
  const [selectedDevice, setSelectedDevice] = useState<SavedDevice | null>(null);
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [scanning, setScanning]             = useState(false);
  const [errorMsg, setErrorMsg]             = useState("");
  const [successMsg, setSuccessMsg]         = useState("");
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  // Scan settings
  const [inputSource, setInputSource] = useState<"Platen" | "Feeder">("Platen");
  const [colorMode, setColorMode]     = useState<"Color" | "Grayscale" | "BlackAndWhite">("Grayscale");
  const [dpi, setDpi]                 = useState<number>(300);
  const [batchScan, setBatchScan]     = useState<boolean>(true);

  // Page progress
  const [scanJobId, setScanJobId]     = useState<string | null>(null);

  // Auto-select ADF source if device supports it
  useEffect(() => {
    if (selectedDevice?.hasAdf) setInputSource("Feeder");
    else setInputSource("Platen");
  }, [selectedDevice]);

  // Load last-used device from saved devices on mount
  useEffect(() => {
    const loadLastDevice = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const res   = await fetch(`${API_URL}/documents/scanner/devices`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const devices: SavedDevice[] = await res.json();
          const connected = devices.find((d) => d.isConnected);
          if (connected) setSelectedDevice(connected);
        }
      } catch {}
    };
    loadLastDevice();
  }, []);

  const handleDeviceSelected = useCallback((device: SavedDevice) => {
    setSelectedDevice(device);
    setErrorMsg("");
    setSuccessMsg("");
  }, []);

  const handleStartScan = async () => {
    if (!selectedDevice) {
      setErrorMsg("Bitte wähle zuerst einen Scanner aus.");
      return;
    }

    setScanning(true);
    setErrorMsg("");
    setSuccessMsg("");
    setScanJobId(null);

    try {
      const token = localStorage.getItem("accessToken");
      const res   = await fetch(`${API_URL}/documents/scanner/scan`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          deviceId:    selectedDevice.id,
          scannerIp:   selectedDevice.lastKnownIp,
          scannerPort: selectedDevice.port,
          colorMode,
          dpi,
          format:      "jpeg",
          source:      inputSource === "Feeder" ? "adf" : "flatbed",
          inputSource,
          multiPage:   true,
          batchScan:   inputSource === "Feeder" ? true : false,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Scan fehlgeschlagen (HTTP ${res.status})`);
      }

      const data = await res.json();
      setScanJobId(data.jobId || null);

      if (!data.pages || data.pages.length === 0) {
        throw new Error("Keine Seiten vom Scanner empfangen.");
      }

      setSuccessMsg(`✓ ${data.pages.length} Seite(n) erfolgreich gescannt!`);

      onScanCompleted({
        originalFileName: `Scan_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`,
        source:           "SCANNER",
        mimeType:         "image/jpeg",
        pages:            data.pages,
      });
    } catch (e: any) {
      setErrorMsg(e.message || "Scanvorgang fehlgeschlagen.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Device Selector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                Hardware-Scanner
                <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                  eSCL / WIA
                </span>
              </h3>
              <p className="text-xs text-slate-400">Brother, HP, Canon, Epson, Lexmark &amp; USB-Scanner</p>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            Geräte verwalten
          </button>
        </div>

        {/* Selected device */}
        <AnimatePresence>
          {selectedDevice ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-4 flex items-center justify-between p-3 rounded-xl bg-blue-500/8 border border-blue-500/25"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-blue-500/15">
                  {selectedDevice.protocol === "WIA" ? (
                    <Usb className="w-3.5 h-3.5 text-purple-400" />
                  ) : (
                    <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{selectedDevice.deviceName}</p>
                  <p className="text-xs text-slate-400">
                    {selectedDevice.lastKnownIp
                      ? `${selectedDevice.lastKnownIp}:${selectedDevice.port}`
                      : selectedDevice.protocol}
                    {selectedDevice.hasAdf && " · ADF"}
                    {selectedDevice.hasFlatbed && " · Flachbett"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                  selectedDevice.status === "READY" || selectedDevice.status === "UNKNOWN"
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                    : "text-amber-400 bg-amber-500/10 border-amber-500/25"
                }`}>
                  {selectedDevice.status === "UNKNOWN" ? "Bereit" : selectedDevice.status}
                </span>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline"
                >
                  Ändern
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setIsModalOpen(true)}
              className="mt-4 w-full flex items-center justify-between p-3.5 rounded-xl border border-dashed border-slate-700 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
            >
              <span className="text-sm text-slate-400 group-hover:text-slate-300">
                Keinen Scanner ausgewählt
              </span>
              <div className="flex items-center gap-1.5 text-blue-400 text-sm font-medium">
                <Search className="w-4 h-4" />
                Gerät auswählen
                <ChevronRight className="w-4 h-4" />
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Scan Settings */}
      {selectedDevice && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Sliders className="w-4 h-4 text-blue-400" />
            Scan-Einstellungen
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Input Source */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Papiereinzug</label>
              <select
                value={inputSource}
                onChange={(e) => setInputSource(e.target.value as "Platen" | "Feeder")}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              >
                {selectedDevice.hasFlatbed && (
                  <option value="Platen">Flachbett (Einzelblatt)</option>
                )}
                {selectedDevice.hasAdf && (
                  <option value="Feeder">Automatik-Einzug (ADF)</option>
                )}
                {!selectedDevice.hasAdf && !selectedDevice.hasFlatbed && (
                  <>
                    <option value="Platen">Flachbett</option>
                    <option value="Feeder">ADF-Einzug</option>
                  </>
                )}
              </select>
            </div>

            {/* Color Mode */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Farbmodus</label>
              <select
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="Color">Vollfarbe (RGB)</option>
                <option value="Grayscale">Graustufen (Schneller)</option>
                <option value="BlackAndWhite">Schwarz/Weiß (Text)</option>
              </select>
            </div>

            {/* Resolution */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Auflösung (DPI)</label>
              <select
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value={150}>150 DPI (Schnell)</option>
                <option value={300}>300 DPI (Empfohlen für OCR)</option>
                <option value={600}>600 DPI (Hohe Qualität)</option>
              </select>
            </div>
          </div>

          {/* ADF Batch mode */}
          {inputSource === "Feeder" && (
            <motion.label
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={batchScan}
                onChange={(e) => setBatchScan(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-700 text-blue-600 focus:ring-0 bg-slate-950"
              />
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                Stapel-Modus: Alle Seiten aus dem ADF nacheinander einziehen
              </div>
            </motion.label>
          )}
        </motion.div>
      )}

      {/* Messages */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs"
          >
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Row */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          onClick={() => setShowTroubleshoot((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          Scanner nicht erreichbar?
        </button>

        <button
          onClick={handleStartScan}
          disabled={scanning || !selectedDevice}
          className="flex items-center gap-2.5 px-7 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
        >
          {scanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scan läuft…
            </>
          ) : (
            <>
              <ScanLine className="w-4 h-4" />
              Scannen starten
            </>
          )}
        </button>
      </div>

      {/* Troubleshooting */}
      <AnimatePresence>
        {showTroubleshoot && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                <ZapOff className="w-3.5 h-3.5 text-amber-400" />
                Hinweise zur Scanner-Einrichtung:
              </p>
              <ul className="list-disc pl-4 space-y-1.5">
                <li>Stelle sicher, dass <strong>AirScan / eSCL</strong> am Drucker im Browser-Menü aktiviert ist.</li>
                <li>Scanner und dieser PC müssen im <strong>gleichen WLAN</strong> sein.</li>
                <li>
                  Für automatische LAN-Erkennung: Verwende den{" "}
                  <strong className="text-slate-300">LogiFlow Connector</strong>.
                </li>
                <li>
                  <strong>HP</strong>: Port 8080 &nbsp;|&nbsp;
                  <strong>Brother/Canon/Epson</strong>: Port 80 &nbsp;|&nbsp;
                  <strong>Verschlüsselt</strong>: Port 443
                </li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Device Manager Modal */}
      <DeviceManagerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onDeviceSelected={handleDeviceSelected}
        selectedDeviceId={selectedDevice?.id}
      />
    </div>
  );
}

// Needed since we reference it in JSX without import
function Search({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx={11} cy={11} r={8} />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
    </svg>
  );
}
