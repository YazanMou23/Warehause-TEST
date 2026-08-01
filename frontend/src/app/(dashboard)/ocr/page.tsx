"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileScan,
  CheckCircle,
  AlertTriangle,
  FileText,
  Edit2,
  Trash2,
  Warehouse,
  Grid,
  Loader2,
  Check,
  Printer,
  Settings,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { API_URL } from "../../../config/api";

interface ParsedContainer {
  containerNumber: string;
  status: "FULL" | "EMPTY";
  arrivalDate?: string;
  hall?: string;
  notes?: string;
}

interface WarehouseData {
  id: string;
  name: string;
}

interface HallData {
  id: string;
  name: string;
  warehouseId: string;
}

export default function OcrPage() {
  const [file, setFile] = useState<File | null>(null);

  // API Metadata
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [halls, setHalls] = useState<HallData[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedHallId, setSelectedHallId] = useState("");

  // Extracted data state for review
  const [extractedContainers, setExtractedContainers] = useState<ParsedContainer[]>([]);
  const [ocrWarning, setOcrWarning] = useState("");

  // Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContainerNumber, setEditContainerNumber] = useState("");
  const [editStatus, setEditStatus] = useState<"FULL" | "EMPTY">("EMPTY");

  // Printer Direct Scan state
  const [printerScanning, setPrinterScanning] = useState(false);
  const [scannerIp, setScannerIp] = useState("");
  const [showScannerConfig, setShowScannerConfig] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<
    Array<{ id: string; name: string; connectionType: string; ip?: string; port?: number; status: string }>
  >([]);

  const [isOffline, setIsOffline] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchMetadata = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };

        // Fetch warehouses
        const whRes = await fetch(`${API_URL}/warehouses`, { headers });
        const whJson = whRes.ok ? await whRes.json() : null;
        const whData = whJson && Array.isArray(whJson.data) ? whJson.data : (Array.isArray(whJson) ? whJson : []);
        setWarehouses(whData);
        if (whData.length > 0) setSelectedWarehouseId(whData[0].id);

        // Fetch halls
        const hallRes = await fetch(`${API_URL}/halls`, { headers });
        const hallJson = hallRes.ok ? await hallRes.json() : null;
        const hallData = hallJson && Array.isArray(hallJson.data) ? hallJson.data : (Array.isArray(hallJson) ? hallJson : []);
        setHalls(hallData);

        setIsOffline(false);
      } catch (err) {
        setIsOffline(true);
        const mockWH = [{ id: "wh-1", name: "Duisburg Port Hub" }];
        const mockHalls = [
          { id: "hall-a", name: "Hall A - Cold Storage", warehouseId: "wh-1" },
          { id: "hall-b", name: "Hall B - General Cargo", warehouseId: "wh-1" },
        ];
        setWarehouses(mockWH);
        setSelectedWarehouseId(mockWH[0].id);
        setHalls(mockHalls);
      }
    };

    fetchMetadata();
    discoverPrinters();
  }, [router]);

  useEffect(() => {
    const filtered = halls.filter((h) => h.warehouseId === selectedWarehouseId);
    if (filtered.length > 0) {
      setSelectedHallId(filtered[0].id);
    } else {
      setSelectedHallId("");
    }
  }, [selectedWarehouseId, halls]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setMessage({ text: "", type: "" });
    }
  };

  const handleUploadOCR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage({ text: "Bitte wähle eine Dokumenten-Bilddatei aus.", type: "error" });
      return;
    }

    setUploading(true);
    setMessage({ text: "", type: "" });
    setExtractedContainers([]);
    setOcrWarning("");

    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      setTimeout(() => {
        setExtractedContainers([
          { containerNumber: "MSCU1284920", status: "FULL" },
          { containerNumber: "HLXU8472910", status: "EMPTY" },
          { containerNumber: "TGBU7392014", status: "FULL" },
        ]);
        setOcrWarning("Sandbox API Mock mode active. Demo Container-Daten geladen.");
        setUploading(false);
      }, 1200);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "CONTAINERS");

      const res = await fetch(`${API_URL}/ocr/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "OCR Parsing fehlgeschlagen.");
      }

      if (data.warning) {
        setOcrWarning(data.warning);
      }

      setExtractedContainers(data.data || []);
    } catch (err: any) {
      setMessage({ text: err.message || "OCR Service Fehler.", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  // Direct Printer Scan Handler
  const handleDirectPrinterScan = async () => {
    setPrinterScanning(true);
    setMessage({ text: "", type: "" });
    setExtractedContainers([]);
    setOcrWarning("");

    const token = localStorage.getItem("accessToken");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

    try {
      const payload: any = {};
      if (scannerIp) payload.scannerIp = scannerIp;

      const res = await fetch(`${apiUrl}/scanner/scan-and-extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Direktscan vom Drucker fehlgeschlagen. Bitte Verbindung zum Drucker/Scanner prüfen.");
      }

      if (data.warning) {
        setOcrWarning(data.warning);
      }

      setExtractedContainers(data.data || []);
      setMessage({ text: "Direkter Scan erfolgreich! Container-Liste extrahiert.", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "Drucker-Scanner Verbindung fehlgeschlagen.", type: "error" });
    } finally {
      setPrinterScanning(false);
    }
  };

  const discoverPrinters = async () => {
    const token = localStorage.getItem("accessToken");
    setDiscovering(true);
    try {
      const res = await fetch(`${API_URL}/scanner/discover`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDiscoveredPrinters(data || []);
        if (data && data.length > 0) {
          setScannerIp(data[0].ip || data[0].id);
        }
      }
    } catch (err) {
      console.error("Fehler bei Druckersuche:", err);
    } finally {
      setDiscovering(false);
    }
  };

  // Inline container editing
  const startEditContainer = (index: number) => {
    setEditingIndex(index);
    setEditContainerNumber(extractedContainers[index].containerNumber);
    setEditStatus(extractedContainers[index].status);
  };

  const saveEditContainer = (index: number) => {
    const updated = [...extractedContainers];
    updated[index] = {
      containerNumber: editContainerNumber.toUpperCase(),
      status: editStatus,
    };
    setExtractedContainers(updated);
    setEditingIndex(null);
  };

  const deleteContainer = (index: number) => {
    setExtractedContainers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBulkImport = async () => {
    if (extractedContainers.length === 0) return;
    if (!selectedWarehouseId || !selectedHallId) {
      setMessage({ text: "Bitte Ziel-Lager und Ziel-Halle auswählen.", type: "error" });
      return;
    }

    setImporting(true);
    setMessage({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      setTimeout(() => {
        setMessage({
          text: `${extractedContainers.length} Container erfolgreich importiert (Mock Mode).`,
          type: "success",
        });
        setExtractedContainers([]);
        setImporting(false);
      }, 800);
      return;
    }

    try {
      const payload = {
        containers: extractedContainers.map((c) => ({
          containerNumber: c.containerNumber,
          status: c.status,
          warehouseId: selectedWarehouseId,
          hallId: selectedHallId,
        })),
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers/bulk-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Bulk Import fehlgeschlagen.");
      }

      setMessage({
        text: `${data.count || extractedContainers.length} Container erfolgreich importiert!`,
        type: "success",
      });
      setExtractedContainers([]);
    } catch (err: any) {
      setMessage({ text: err.message || "Fehler beim Container Import.", type: "error" });
    } finally {
      setImporting(false);
    }
  };

  const filteredHalls = halls.filter((h) => h.warehouseId === selectedWarehouseId);

  return (
    <div className="space-y-stack-lg animate-fadeIn">
      {/* Title & Direct Printer Scan Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-headline-lg font-bold text-on-surface">Container Liste Scanner & Upload</h3>
          <p className="text-on-surface-variant font-body-sm">
            Lade Containerlisten oder Ladelisten hoch – oder scanne Dokumente direkt über verbundene WLAN & USB-Drucker.
          </p>
        </div>

        {/* Direct Printer Scan Button */}
        <button
          onClick={handleDirectPrinterScan}
          disabled={printerScanning || uploading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer text-sm"
        >
          {printerScanning ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Printer className="w-4 h-4 text-white" />
          )}
          <span>Direkt vom Drucker scannen</span>
        </button>
      </div>

      {isOffline && (
        <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-2.5 rounded-lg flex items-center gap-2 text-label-md">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline Sandbox Modus aktiv. Uploads nutzen vorbereitete Demo-Containerdaten.</span>
        </div>
      )}

      {/* Parser Configuration and Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-stack-md">
        {/* Settings Panel */}
        <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm space-y-4">
          <h5 className="font-bold text-body-lg flex items-center gap-2">
            <FileScan className="w-5 h-5 text-secondary" /> Ziel-Lager & Drucker
          </h5>

          {/* Destination Warehouse */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
              Ziel-Lager
            </label>
            <div className="relative">
              <Warehouse className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm outline-none appearance-none"
              >
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
              Ziel-Halle
            </label>
            <div className="relative">
              <Grid className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <select
                value={selectedHallId}
                onChange={(e) => setSelectedHallId(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm outline-none appearance-none"
              >
                {filteredHalls.length === 0 ? (
                  <option value="">Keine Hallen verfügbar</option>
                ) : (
                  filteredHalls.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Printer Scanner IP Toggle & WiFi Discovery */}
          <div className="pt-2 border-t border-outline-variant space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowScannerConfig(!showScannerConfig)}
                className="text-xs font-semibold text-secondary hover:underline flex items-center gap-1"
              >
                <Settings className="w-3.5 h-3.5" />
                WLAN / USB Drucker Einstellungen
              </button>
              <button
                type="button"
                onClick={discoverPrinters}
                disabled={discovering}
                className="text-[11px] bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition-all border border-blue-200 cursor-pointer"
              >
                {discovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                <span>Drucker suchen (WLAN & USB)</span>
              </button>
            </div>

            {showScannerConfig && (
              <div className="mt-2 space-y-2">
                {discovering && (
                  <div className="text-xs p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-700">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Suche verbundene WLAN & USB-Drucker...</span>
                  </div>
                )}
                {discoveredPrinters.length > 0 && (
                  <div className="text-xs p-2 bg-blue-50/70 border border-blue-200 rounded-lg">
                    <label className="block text-[11px] font-bold text-blue-800 mb-1 flex items-center gap-1">
                      <Wifi className="w-3.5 h-3.5 text-blue-600" /> Erkannte Netzwerker / USB-Drucker:
                    </label>
                    <select
                      value={scannerIp}
                      onChange={(e) => setScannerIp(e.target.value)}
                      className="w-full bg-white border border-blue-300 rounded px-2 py-1 text-xs text-slate-800 outline-none font-medium"
                    >
                      <option value="" disabled>-- Bitte wählen --</option>
                      {discoveredPrinters.map((p) => (
                        <option key={p.id} value={p.ip || p.id}>
                          [{p.connectionType}] {p.name} ({p.status})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Drucker IP oder USB-ID</label>
                  <input
                    type="text"
                    placeholder="z.B. 192.168.1.100 oder USB Scanner"
                    value={scannerIp}
                    onChange={(e) => setScannerIp(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5 text-xs outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Upload & Printer Scan Form */}
        <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm lg:col-span-2 flex flex-col justify-between">
          <form onSubmit={handleUploadOCR} className="space-y-4 h-full flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h5 className="font-bold text-body-lg">Containerliste Bild-Upload oder Direktscan</h5>
                <span className="text-xs text-secondary font-semibold flex items-center gap-1">
                  <Printer className="w-3.5 h-3.5" /> Direkt scan eSCL AirScan
                </span>
              </div>

              {/* Drag/Drop Zone */}
              <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 text-center bg-surface-container-low hover:bg-surface-container-low/50 transition-colors relative cursor-pointer">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-secondary-container/10 flex items-center justify-center text-secondary">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-body-sm text-on-surface">
                    {file ? (
                      <span className="font-bold text-secondary flex items-center gap-1">
                        <FileText className="w-4 h-4" /> {file.name}
                      </span>
                    ) : (
                      <span>Datei hierher ziehen oder klicken zum Auswählen</span>
                    )}
                  </div>
                  <p className="text-[11px] text-outline">Unterstützt JPG, PNG, PDF bis 15MB</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <button
                type="submit"
                disabled={uploading || !file || printerScanning}
                className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>OCR Vision scannt...</span>
                  </>
                ) : (
                  <>
                    <FileScan className="w-4 h-4" />
                    <span>Datei auswerten</span>
                  </>
                )}
              </button>

              {/* Prominent Printer Scan Button */}
              <button
                type="button"
                onClick={handleDirectPrinterScan}
                disabled={printerScanning || uploading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {printerScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Drucker scannt...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4 text-white" />
                    <span>Direkt vom Drucker scannen</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* OCR Warnings */}
      {ocrWarning && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-lg flex items-start gap-2.5 text-body-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold font-mono">OCR Hinweis</p>
            <p className="text-[13px]">{ocrWarning}</p>
          </div>
        </div>
      )}

      {/* Containers Review Table */}
      {extractedContainers.length > 0 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center bg-surface-container-low border border-outline-variant p-stack-md rounded-lg">
            <div>
              <h5 className="font-bold text-body-lg">Extrahierter Container-Vorschau ({extractedContainers.length})</h5>
              <p className="text-[12px] text-outline">
                Prüfe und korrigiere die Containernummern vor dem Import in das ausgewählte Lager.
              </p>
            </div>
            <button
              onClick={handleBulkImport}
              disabled={importing || !selectedHallId}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
              <span>Geprüfte Container Importieren</span>
            </button>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider">
                  <th className="w-12 px-3 py-3 text-center">#</th>
                  <th className="px-container-margin py-3">Containernummer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-container-margin py-3 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
                {extractedContainers.map((c, idx) => {
                  const isEditing = editingIndex === idx;
                  return (
                    <tr key={idx} className="hover:bg-surface-bright transition-colors">
                      <td className="w-12 px-3 py-3 font-mono font-bold text-xs text-center text-outline bg-surface-container-low/50">
                        #{idx + 1}
                      </td>
                      <td className="px-container-margin py-3 font-mono font-bold">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editContainerNumber}
                            onChange={(e) => setEditContainerNumber(e.target.value)}
                            className="bg-white border border-outline focus:border-secondary rounded px-2.5 py-1 text-body-sm outline-none font-mono uppercase"
                          />
                        ) : (
                          c.containerNumber
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as any)}
                            className="bg-white border border-outline focus:border-secondary rounded px-2.5 py-1 text-body-sm outline-none"
                          >
                            <option value="EMPTY">EMPTY</option>
                            <option value="FULL">FULL</option>
                          </select>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                              c.status === "FULL"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-surface-container-high text-on-surface-variant"
                            }`}
                          >
                            {c.status}
                          </span>
                        )}
                      </td>
                      <td className="px-container-margin py-3 text-right space-x-2">
                        {isEditing ? (
                          <button
                            onClick={() => saveEditContainer(idx)}
                            className="text-emerald-700 hover:bg-emerald-50 p-1.5 rounded transition-colors inline-flex border border-emerald-200 cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => startEditContainer(idx)}
                            className="text-outline hover:text-secondary p-1.5 rounded hover:bg-surface-container-low transition-colors inline-flex cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteContainer(idx)}
                          className="text-outline hover:text-error p-1.5 rounded hover:bg-error-container transition-colors inline-flex cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {message.text && (
        <div
          className={`p-4 rounded-lg flex items-start gap-2.5 text-body-sm shadow-md animate-slideUp max-w-xl ${
            message.type === "success"
              ? "bg-emerald-100 border border-emerald-300 text-emerald-800"
              : "bg-error-container border border-error/20 text-error"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-error" />
          )}
          <div>
            <p className="font-bold">{message.type === "success" ? "Erfolg" : "Fehler aufgetreten"}</p>
            <p className="text-[13px] opacity-90">{message.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
