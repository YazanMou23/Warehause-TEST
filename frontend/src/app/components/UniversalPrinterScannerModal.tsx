'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Printer,
  Wifi,
  Usb,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plug,
  Loader2,
  X,
  Sliders,
  Layers,
  Download,
  ShieldCheck,
  ChevronRight,
  FileScan,
  Zap,
} from 'lucide-react';
import {
  getConnectorUrl,
  scanDocument,
  getInstallerInfo,
  DiscoveredDevice,
  ScannerBackendInfo,
  ScannerDiagnostic,
} from '../../lib/connector';
import { useConnector } from '../../lib/ConnectorContext';
import { API_URL } from '../../config/api';

interface UniversalPrinterScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (files: File[]) => void;
  title?: string;
  description?: string;
}

export default function UniversalPrinterScannerModal({
  isOpen,
  onClose,
  onScanComplete,
  title = 'Vom Drucker / Scanner scannen',
  description = 'Dokumente direkt über verbundene WLAN- & USB-Drucker erfassen.',
}: UniversalPrinterScannerModalProps) {
  const { 
    status: connStatus, 
    devices, 
    activeDevice, 
    isChecking, 
    isDiscovering, 
    refreshStatus, 
    discoverDevices, 
    setActiveDevice 
  } = useConnector();

  const [isConnecting, setIsConnecting]           = useState(false);
  const [isScanning, setIsScanning]               = useState(false);
  const [errorMsg, setErrorMsg]                   = useState('');
  const [scanStatusText, setScanStatusText]       = useState('');

  // Scan Settings
  const [inputSource, setInputSource] = useState<'Auto' | 'Feeder' | 'Platen'>('Auto');
  const [colorMode, setColorMode]     = useState<'Color' | 'Grayscale'>('Grayscale');
  const [dpi, setDpi]                 = useState<number>(300);
  const [batchScan, setBatchScan]     = useState<boolean>(true);

  const scanAbortController = useRef<AbortController | null>(null);

  // Trigger discovery when opening modal if we are connected but have no devices
  useEffect(() => {
    if (isOpen && connStatus.status === 'connected' && devices.length === 0 && !isDiscovering) {
      discoverDevices();
    }
  }, [isOpen, connStatus.status, devices.length, isDiscovering, discoverDevices]);

  // ── 3. Test Connection & Select Device ──────────────────────────────────────
  const handleSelectDevice = async (device: DiscoveredDevice) => {
    setActiveDevice(device);
    setIsConnecting(true);
    setErrorMsg('');

    try {
      const res = await fetch(`${getConnectorUrl()}/connect`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(device),
        signal:  AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.capabilities) {
          device.capabilities = { ...device.capabilities, ...result.capabilities };
          // Note: Ideally we'd update the device in the context list too, but activeDevice holds the reference for now.
        }
      }

      setInputSource('Auto');
    } catch (err: any) {
      setErrorMsg('Geräteverbindung konnte nicht verifiziert werden: ' + err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  // ── 4. Execute Physical Scan ────────────────────────────────────────────────
  const handleStartScan = async () => {
    if (!activeDevice) {
      setErrorMsg('Bitte wählen Sie zuerst ein Scan-Gerät aus.');
      return;
    }

    setIsScanning(true);
    setScanStatusText(
      inputSource === 'Feeder'
        ? 'Dokumente werden über automatischen Einzug (ADF) gescannt...'
        : inputSource === 'Platen'
        ? 'Dokument wird von Flachbettglas gescannt...'
        : 'Scan wird vorbereitet (ADF automatisch bevorzugt)...'
    );
    setErrorMsg('');

    scanAbortController.current = new AbortController();

    try {
      const sourceParam = inputSource === 'Feeder' ? 'adf' : (inputSource === 'Platen' ? 'flatbed' : 'auto');
      const isBatch = inputSource !== 'Platen';

      const files = await scanDocument({
        scannerIp:   activeDevice.ip,
        scannerPort: activeDevice.port ?? 80,
        dpi,
        colorMode,
        source:      sourceParam,
        inputSource: inputSource === 'Auto' ? 'auto' : inputSource,
        format:      'jpeg',
        batchScan:   isBatch,
        multiPage:   true,
        signal:      scanAbortController.current.signal,
        onProgress:  (prog) => {
          if (prog.message) setScanStatusText(prog.message);
        },
      });

      if (files.length === 0) throw new Error('Keine Seiten vom Scanner empfangen.');
      setScanStatusText(`${files.length} Seite(n) erfolgreich gescannt! Übertrage...`);
      onScanComplete(files);
      onClose();
    } catch (err: any) {
      if (err.message !== 'Scan abgebrochen') {
        setErrorMsg(err.message || 'Scanvorgang fehlgeschlagen. Bitte Verbindung zum Drucker/Scanner prüfen.');
      }
    } finally {
      setIsScanning(false);
      setScanStatusText('');
      scanAbortController.current = null;
    }
  };

  const handleCancelScan = () => {
    if (scanAbortController.current) {
      scanAbortController.current.abort();
    }
  };

  const handleDownloadInstaller = () => {
    const { apiPath, fileName } = getInstallerInfo(API_URL);
    const link = document.createElement('a');
    link.href = apiPath;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const installerLabel = getInstallerInfo(API_URL).label;

  if (!isOpen) return null;

  // Determine current step based on global state
  let step: 'check' | 'offline' | 'outdated' | 'discovery' | 'configured' = 'check';
  if (isChecking) {
    step = 'check';
  } else if (connStatus.status === 'missing' || connStatus.status === 'error') {
    step = 'offline';
  } else if (connStatus.status === 'outdated') {
    step = 'outdated';
  } else {
    step = activeDevice ? 'configured' : 'discovery';
  }

  const connectorVersion = connStatus.version;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-800/80 bg-slate-900/90">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-blue-600/15 border border-blue-500/25 text-blue-400">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-headline-sm font-bold text-slate-100 text-lg sm:text-xl">{title}</h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[72vh] overflow-y-auto">
          {/* Error Message */}
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm space-y-3"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                <div className="flex-1 font-medium leading-relaxed">
                  {(() => {
                    const match = errorMsg.match(/\{[\s\S]*\}/);
                    if (match) {
                      try {
                        const parsed = JSON.parse(match[0]);
                        if (parsed.message) return parsed.message;
                      } catch {}
                    }
                    return errorMsg;
                  })()}
                </div>
              </div>

              {/* Action Suggestions */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-red-500/20 text-xs">
                {activeDevice?.ip && activeDevice.ip !== 'SIMULATOR' && (
                  <a
                    href={`http://${activeDevice.ip}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors"
                  >
                    🌐 Drucker Web-Menü öffnen ({activeDevice.ip})
                  </a>
                )}
                {devices.some((d) => d.id === 'SIMULATOR') && activeDevice?.id !== 'SIMULATOR' && (
                  <button
                    type="button"
                    onClick={() => {
                      const sim = devices.find((d) => d.id === 'SIMULATOR');
                      if (sim) handleSelectDevice(sim);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/30 transition-colors cursor-pointer"
                  >
                    🧪 Zum Test-Simulator wechseln
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* ── STEP: CHECKING / LOADING ── */}
          {step === 'check' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <div>
                <h4 className="font-bold text-slate-200 text-base">Verbindung zum lokalen Connector prüfen...</h4>
                <p className="text-xs text-slate-400 mt-1">Prüfe 127.0.0.1:48281</p>
              </div>
            </div>
          )}

          {/* ── STEP: CONNECTOR NOT DETECTED (OFFLINE) ── */}
          {step === 'offline' && (
            <div className="space-y-6 py-2">
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 space-y-2">
                <div className="flex items-center gap-2.5 font-bold text-base">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                  <span>LogiFlow Printer Connector nicht aktiv</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Ihr Browser kann aus Sicherheitsgründen nicht direkt auf Ihr lokales WLAN zugreifen.
                  Der kleine Windows-Connector verbindet diese Web-App nahtlos mit Ihren physischen Druckern & Scannern.
                </p>
                {connStatus.errorMessage && (
                  <p className="text-[11px] text-amber-200/90 mt-2 bg-amber-500/10 p-2 rounded">
                    Fehler: {connStatus.errorMessage}
                  </p>
                )}
              </div>

              {/* 3-Step Guide */}
              <div className="space-y-3 bg-slate-950/40 p-4 sm:p-5 rounded-2xl border border-slate-800">
                <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400">In 3 Schritten starten:</h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <span className="inline-block px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold text-[11px]">Schritt 1</span>
                    <p className="font-medium text-slate-200">Installer herunterladen</p>
                    <p className="text-slate-400 text-[11px]">ZIP-Paket mit 1 Klick laden.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <span className="inline-block px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold text-[11px]">Schritt 2</span>
                    <p className="font-medium text-slate-200">install.bat ausführen</p>
                    <p className="text-slate-400 text-[11px]">Doppelklick genügt (keine CMD-Kenntnisse nötig).</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[11px]">Schritt 3</span>
                    <p className="font-medium text-slate-200">Erneut verbinden</p>
                    <p className="text-slate-400 text-[11px]">Der Connector startet automatisch im Hintergrund.</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  onClick={handleDownloadInstaller}
                  className="w-full sm:flex-1 py-3 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {installerLabel}
                </button>
                <button
                  onClick={refreshStatus}
                  className="w-full sm:w-auto py-3 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 border border-slate-700 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Verbindung erneut prüfen
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: CONNECTOR OUTDATED ── */}
          {step === 'outdated' && (
            <div className="space-y-5 py-2">
              <div className="p-5 rounded-2xl bg-orange-500/10 border border-orange-500/25 space-y-2">
                <div className="flex items-center gap-2.5 font-bold text-base text-orange-300">
                  <AlertCircle className="w-5 h-5 text-orange-400" />
                  <span>Connector-Update verfügbar</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Ihre Connector-Version{connectorVersion ? ` (v${connectorVersion})` : ''} ist veraltet. Bitte laden Sie die aktuelle Version herunter und installieren Sie sie.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleDownloadInstaller}
                  className="w-full sm:flex-1 py-3 px-5 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {installerLabel}
                </button>
                <button
                  onClick={refreshStatus}
                  className="w-full sm:w-auto py-3 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 border border-slate-700 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Erneut prüfen
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: DISCOVERY & CONFIGURED ── */}
          {(step === 'discovery' || step === 'configured') && (
            <div className="space-y-5">
              {/* Connector Status Bar */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <div className="flex items-center gap-2.5 text-xs text-slate-300">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Connector: <strong className="text-emerald-400">Aktiv{connectorVersion ? ` v${connectorVersion}` : ''} (127.0.0.1:48281)</strong></span>
                </div>
                <button
                  onClick={discoverDevices}
                  disabled={isDiscovering}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                  Geräte neu suchen
                </button>
              </div>

              {/* Device List Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <Search className="w-4 h-4 text-blue-400" />
                    Erkannte Drucker & Scanner ({devices.length})
                  </h4>
                  {isDiscovering && (
                    <span className="text-xs text-blue-400 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Suche im lokalen Netzwerk...
                    </span>
                  )}
                </div>

                {devices.length === 0 && isDiscovering ? (
                  <div className="p-8 rounded-2xl bg-slate-950/40 border border-slate-800 text-center space-y-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                    <p className="text-sm font-medium text-slate-300">Suche nach WLAN- und USB-Geräten...</p>
                    <p className="text-xs text-slate-500">Prüfe mDNS, WS-Discovery, AirScan und USB</p>
                  </div>
                ) : devices.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-950/40 border border-slate-800 text-center space-y-2">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                    <p className="text-sm font-semibold text-slate-200">Keine Drucker/Scanner gefunden</p>
                    <p className="text-xs text-slate-400">
                      Stellen Sie sicher, dass Ihr Drucker eingeschaltet und im gleichen WLAN wie dieser PC ist.
                    </p>
                    <button
                      onClick={discoverDevices}
                      className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Erneut suchen
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {devices.map((device) => {
                      const isSelected = activeDevice?.id === device.id;
                      const isReadyToScan = device.id === 'SIMULATOR' || device.backendInfo?.readyToScan || (device.capabilities?.scanning && device.protocol !== 'SPOOLER');
                      const hasAdf = Boolean(isReadyToScan && device.capabilities?.adf);
                      const hasFlatbed = Boolean(isReadyToScan && (device.capabilities?.flatbed ?? true));

                      return (
                        <div
                          key={device.id}
                          onClick={() => handleSelectDevice(device)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-blue-600/15 border-blue-500/60 ring-1 ring-blue-500/40'
                              : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-950/80'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className={`p-2.5 rounded-xl border ${
                              device.connectionType === 'USB'
                                ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                                : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                            }`}>
                              {device.connectionType === 'USB' ? <Usb className="w-5 h-5" /> : <Wifi className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-slate-100 truncate">
                                {device.displayName || device.name}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-[11px] text-slate-400">
                                  {device.manufacturer || 'Netzwerk'} • {device.connectionType === 'USB' ? 'USB' : 'WLAN/LAN'}
                                </span>
                                {device.id === 'SIMULATOR' || device.protocol === 'SIMULATOR' ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/25">
                                    ✓ Demo-Simulator bereit
                                  </span>
                                ) : isReadyToScan ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/25">
                                    ✓ Scan-Backend bereit ({device.backend || 'WIA'})
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/25">
                                    ⚠ Treiber erforderlich
                                  </span>
                                )}
                                {hasAdf && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold border border-blue-500/25">
                                    ADF Einzug
                                  </span>
                                )}
                                {hasFlatbed && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold border border-slate-700">
                                    Flachbett
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {isSelected ? (
                              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                                isReadyToScan 
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              }`}>
                                <CheckCircle2 className="w-4 h-4" /> {isReadyToScan ? 'Verbunden' : 'Ausgewählt'}
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
                              >
                                Verbinden
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Hardware Diagnostic Banner when selected device is not ready */}
              {activeDevice && (activeDevice.backendInfo?.readyToScan === false || (activeDevice.id !== 'SIMULATOR' && !activeDevice.capabilities?.scanning)) && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <div className="flex items-center gap-2.5 text-amber-300 font-bold text-sm">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                    <span>Scan-Backend nicht eingerichtet ({activeDevice.displayName || activeDevice.name})</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {activeDevice.backendInfo?.statusText || 'Dieses Gerät wurde im Netzwerk gefunden, aber es ist noch kein aktiver Windows WIA-Scannertreiber eingerichtet.'}
                  </p>
                  
                  {/* Detailed Diagnostics Table */}
                  <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Geräte-Erkennung:</span>
                      <span className="text-emerald-400 font-semibold">✓ Im Netzwerk gefunden ({activeDevice.ip || 'USB'})</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Scanner erkannt:</span>
                      <span className="text-emerald-400 font-semibold">✓ {activeDevice.displayName || activeDevice.name}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Scan-Backend ({activeDevice.backend || 'WIA/AirScan'}):</span>
                      <span className="text-amber-400 font-semibold">✗ Nicht initialisiert</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>ADF-Dauereinzug:</span>
                      <span className="text-slate-500">✗ Backend nicht bereit</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800">
                      <span>Scan-Bereitschaft:</span>
                      <span className="text-red-400 font-semibold">✗ Treiber erforderlich</span>
                    </div>
                  </div>

                  {activeDevice.diagnostics?.remedy && (
                    <p className="text-[11px] text-amber-200/90 leading-relaxed bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                      💡 <strong>Lösung:</strong> {activeDevice.diagnostics.remedy}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {devices.some((d) => d.id === 'SIMULATOR') && (
                      <button
                        type="button"
                        onClick={() => {
                          const sim = devices.find((d) => d.id === 'SIMULATOR');
                          if (sim) handleSelectDevice(sim);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                      >
                        🧪 Zum WLAN-Scanner Simulator wechseln
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Scan Options (Available when device is ready to scan) */}
              {activeDevice && (activeDevice.id === 'SIMULATOR' || activeDevice.backendInfo?.readyToScan || (activeDevice.capabilities?.scanning && activeDevice.protocol !== 'SPOOLER')) && (
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                  <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-400" />
                    Scan-Einstellungen ({activeDevice.displayName || activeDevice.name})
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {/* Source */}
                    <div className="space-y-1.5 sm:col-span-1">
                      <label className="font-semibold text-slate-400">Quelle:</label>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          type="button"
                          onClick={() => setInputSource('Auto')}
                          className={`py-2 px-1.5 rounded-xl border text-center font-medium text-[11px] transition-all cursor-pointer ${
                            inputSource === 'Auto'
                              ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          ⚡ Auto
                        </button>
                        <button
                          type="button"
                          onClick={() => setInputSource('Feeder')}
                          className={`py-2 px-1.5 rounded-xl border text-center font-medium text-[11px] transition-all cursor-pointer ${
                            inputSource === 'Feeder'
                              ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          📄 ADF (Einzug)
                        </button>
                        <button
                          type="button"
                          onClick={() => setInputSource('Platen')}
                          className={`py-2 px-1.5 rounded-xl border text-center font-medium text-[11px] transition-all cursor-pointer ${
                            inputSource === 'Platen'
                              ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          🔍 Flachbett
                        </button>
                      </div>
                    </div>

                    {/* Color Mode */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-slate-400">Farbe:</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setColorMode('Grayscale')}
                          className={`py-2 px-2.5 rounded-xl border text-center font-medium transition-all cursor-pointer ${
                            colorMode === 'Grayscale'
                              ? 'bg-blue-600 text-white border-blue-500 font-bold'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          Graustufen
                        </button>
                        <button
                          type="button"
                          onClick={() => setColorMode('Color')}
                          className={`py-2 px-2.5 rounded-xl border text-center font-medium transition-all cursor-pointer ${
                            colorMode === 'Color'
                              ? 'bg-blue-600 text-white border-blue-500 font-bold'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          Farbe
                        </button>
                      </div>
                    </div>

                    {/* Resolution */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-slate-400">Auflösung:</label>
                      <select
                        value={dpi}
                        onChange={(e) => setDpi(Number(e.target.value))}
                        className="w-full py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-medium focus:border-blue-500 focus:outline-none"
                      >
                        <option value={150}>150 DPI (Schnell)</option>
                        <option value={300}>300 DPI (Empfohlen für OCR)</option>
                        <option value={600}>600 DPI (Hochauflösend)</option>
                      </select>
                    </div>
                  </div>

                  {inputSource !== 'Platen' && (
                    <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 p-2.5 rounded-xl">
                      <span className="font-bold">✓ Mehrseitiger ADF-Einzug aktiv:</span>
                      <span className="text-emerald-200">
                        Legen Sie 1 bis 50 Seiten oben in den automatischen Einzug (ADF). Alle Seiten werden nacheinander erfasst.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 sm:p-6 border-t border-slate-800/80 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={() => {
              if (isScanning) {
                handleCancelScan();
              }
              onClose();
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors cursor-pointer"
          >
            {isScanning ? 'Scan abbrechen' : 'Abbrechen'}
          </button>

          {(step === 'discovery' || step === 'configured') && (
            <button
              onClick={handleStartScan}
              disabled={!activeDevice || isScanning || isConnecting || (activeDevice.backendInfo?.readyToScan === false || (activeDevice.id !== 'SIMULATOR' && !activeDevice.capabilities?.scanning))}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{scanStatusText || 'Scan läuft...'}</span>
                </>
              ) : isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verbinde Gerät...</span>
                </>
              ) : (activeDevice && activeDevice.backendInfo?.readyToScan === false) ? (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>Scan-Backend nicht bereit</span>
                </>
              ) : (
                <>
                  <FileScan className="w-4 h-4" />
                  <span>Dokument jetzt scannen</span>
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
