"use client";

import React, { useState, useEffect } from "react";
import {
  Printer,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  ChevronRight,
  Wifi,
  Usb,
  Play,
  HelpCircle,
} from "lucide-react";
import { API_URL } from "../../../config/api";

interface ScannerDevice {
  id: string;
  name: string;
  connectionType: "WIFI" | "USB" | "LAN" | "UNKNOWN";
  ip?: string;
  port?: number;
  status: string;
  statusDetails?: string;
  capabilities?: {
    hasAdf: boolean;
    hasFlatbed: boolean;
    supportedDpi: number[];
    colorModes: string[];
    documentFormats: string[];
  };
}

interface ScannerCaptureTabProps {
  onScanCompleted: (doc: {
    originalFileName: string;
    source: "SCANNER";
    mimeType: string;
    pages: { pageNumber: number; base64Data: string; mimeType: string }[];
  }) => void;
}

export default function ScannerCaptureTab({ onScanCompleted }: ScannerCaptureTabProps) {
  const [scanners, setScanners] = useState<ScannerDevice[]>([]);
  const [selectedScannerId, setSelectedScannerId] = useState<string>("");
  const [discovering, setDiscovering] = useState<boolean>(false);
  const [scanning, setScanning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  // Scan options
  const [inputSource, setInputSource] = useState<"Platen" | "Feeder">("Platen");
  const [colorMode, setColorMode] = useState<"Color" | "Grayscale" | "BlackAndWhite">("Color");
  const [dpi, setDpi] = useState<number>(300);
  const [batchScan, setBatchScan] = useState<boolean>(true);
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);

  useEffect(() => {
    discoverScanners();
  }, []);

  const discoverScanners = async () => {
    setDiscovering(true);
    setErrorMsg("");
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_URL}/documents/scanner/discover`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setScanners(data);
        if (data.length > 0) {
          setSelectedScannerId(data[0].id);
          if (data[0].capabilities?.hasAdf) {
            setInputSource("Feeder");
          }
        }
      } else {
        throw new Error(`Fehler bei Scanner-Suche (HTTP ${res.status})`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Netzwerkscanner konnten nicht ermittelt werden.");
    } finally {
      setDiscovering(false);
    }
  };

  const selectedScanner = scanners.find((s) => s.id === selectedScannerId);

  const handleStartScan = async () => {
    if (!selectedScanner) {
      setErrorMsg("Bitte wähle einen Scanner aus.");
      return;
    }

    setScanning(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_URL}/documents/scanner/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scannerIp: selectedScanner.ip,
          scannerPort: selectedScanner.port,
          colorMode,
          dpi,
          format: "jpeg",
          inputSource,
          batchScan,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Scan fehlgeschlagen (HTTP ${res.status})`);
      }

      const scanResult = await res.json();
      if (!scanResult.pages || scanResult.pages.length === 0) {
        throw new Error("Keine Seiten vom Scanner empfangen.");
      }

      setSuccessMsg(`${scanResult.pages.length} Seite(n) erfolgreich vom Scanner erfasst!`);

      onScanCompleted({
        originalFileName: `Scan_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`,
        source: "SCANNER",
        mimeType: "image/jpeg",
        pages: scanResult.pages,
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Scanvorgang abgebrochen oder fehlgeschlagen.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Scanner Selector & Discovery */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                Hardware-Scanner (WLAN / AirScan & USB)
                <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                  eSCL / WIA
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Erkennt Brother, HP, Canon, Epson, Lexmark & USB-Scanner im lokalen Netzwerk.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={discoverScanners}
            disabled={discovering || scanning}
            className="flex items-center space-x-2 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${discovering ? "animate-spin text-blue-400" : ""}`} />
            <span>{discovering ? "Suche Geräte..." : "Neu scannen"}</span>
          </button>
        </div>

        {/* Scanner Selection List */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {scanners.map((dev) => (
            <div
              key={dev.id}
              onClick={() => setSelectedScannerId(dev.id)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedScannerId === dev.id
                  ? "bg-blue-600/15 border-blue-500 text-white ring-1 ring-blue-500"
                  : "bg-slate-950/40 border-slate-800 text-slate-300 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {dev.connectionType === "USB" ? (
                    <Usb className="w-4 h-4 text-purple-400" />
                  ) : (
                    <Wifi className="w-4 h-4 text-cyan-400" />
                  )}
                  <span className="font-medium text-sm truncate max-w-[180px]">{dev.name}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {dev.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">
                {dev.statusDetails || (dev.ip ? `IP: ${dev.ip}` : "Lokal")}
              </p>
            </div>
          ))}

          {scanners.length === 0 && !discovering && (
            <div className="col-span-2 text-center py-6 text-slate-400 bg-slate-950/30 rounded-lg border border-dashed border-slate-800 text-xs">
              Kein aktiver Netzwerkscanner gefunden. Stelle sicher, dass der Scanner eingeschaltet und im selben WLAN ist.
            </div>
          )}
        </div>
      </div>

      {/* Scanner Options */}
      {selectedScanner && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>Scan-Einstellungen</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Input Source */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Papiereinzug</label>
              <select
                value={inputSource}
                onChange={(e) => setInputSource(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="Platen">Flachbett (Glas / Einzelblatt)</option>
                <option value="Feeder">Automatischer Einzug (ADF Stapel)</option>
              </select>
            </div>

            {/* Color Mode */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Farbmodus</label>
              <select
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="Color">Vollfarbe (RGB)</option>
                <option value="Grayscale">Graustufen (Schneller)</option>
                <option value="BlackAndWhite">Schwarz/Weiß (Text)</option>
              </select>
            </div>

            {/* Resolution */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Auflösung (DPI)</label>
              <select
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value={150}>150 DPI (Schnell)</option>
                <option value={300}>300 DPI (Empfohlen für OCR)</option>
                <option value={600}>600 DPI (Hohe Qualität)</option>
              </select>
            </div>
          </div>

          {inputSource === "Feeder" && (
            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={batchScan}
                onChange={(e) => setBatchScan(e.target.checked)}
                className="rounded border-slate-700 text-blue-600 focus:ring-0 bg-slate-950"
              />
              <span>Stapel-Modus: Alle Blätter aus dem ADF nacheinander einziehen</span>
            </label>
          )}
        </div>
      )}

      {/* Messages */}
      {errorMsg && (
        <div className="flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center space-x-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Action Button */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setShowTroubleshoot(!showTroubleshoot)}
          className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          <span>Scanner nicht erreichbar?</span>
        </button>

        <button
          type="button"
          onClick={handleStartScan}
          disabled={scanning || !selectedScanner}
          className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-lg transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
        >
          {scanning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Scan läuft (bitte warten)...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>Scanvorgang starten</span>
            </>
          )}
        </button>
      </div>

      {/* Troubleshooting guide accordion */}
      {showTroubleshoot && (
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-2">
          <p className="font-semibold text-slate-200">Hinweise zur Scanner-Einrichtung:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Stelle sicher, dass AirScan / eSCL oder Web Services am Drucker im Browser-Menü aktiviert ist.</li>
            <li>Bei USB-Verbindung muss der Windows-WIA-Dienst gestartet sein.</li>
            <li>Wenn der Server auf einer Cloud-Umgebung läuft, kannst du die Begleiter-App (Scanner Bridge) auf deinem Arbeitsplatz-PC starten.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
