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
import UniversalPrinterScannerModal from "../../components/UniversalPrinterScannerModal";
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

  // Universal Windows Printer Connector state
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);

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

  const processOcrFile = async (fileToProcess: File) => {
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
      formData.append("file", fileToProcess);
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
      setMessage({ text: `${(data.data || []).length} Container erfolgreich erkannt!`, type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "OCR Service Fehler.", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleUploadOCR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage({ text: "Bitte wähle eine Dokumenten-Bilddatei aus.", type: "error" });
      return;
    }
    await processOcrFile(file);
  };

  // Direct Printer Scan complete handler from Universal Connector
  const handlePrinterScanComplete = async (files: File[]) => {
    if (files.length === 0) return;
    const scanned = files[0];
    setFile(scanned);
    await processOcrFile(scanned);
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

      const res = await fetch(`${API_URL}/containers/bulk-import`, {
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
      {/* Title */}
      <div>
        <h3 className="font-headline-lg font-bold text-on-surface">Container Liste Scanner & Upload</h3>
        <p className="text-on-surface-variant font-body-sm">
          Lade Containerlisten hoch – oder scanne Dokumente direkt über verbundene WLAN & USB-Drucker.
        </p>
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
        <div className="bg-white border border-outline-variant p-stack-md rounded-2xl shadow-sm space-y-4">
          <h5 className="font-bold text-body-lg flex items-center gap-2">
            <FileScan className="w-5 h-5 text-secondary" /> Ziel-Lager & Zuordnung
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
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm outline-none appearance-none font-medium"
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
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm outline-none appearance-none font-medium"
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

          <div className="pt-3 border-t border-outline-variant">
            <button
              type="button"
              onClick={() => setIsPrinterModalOpen(true)}
              className="w-full py-3 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center gap-2 border border-blue-200 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-blue-700" />
              <span>Drucker / Scanner öffnen</span>
            </button>
          </div>
        </div>

        {/* Upload & Printer Scan Form */}
        <div className="bg-white border border-outline-variant p-stack-md rounded-2xl shadow-sm lg:col-span-2 flex flex-col justify-between">
          <form onSubmit={handleUploadOCR} className="space-y-4 h-full flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h5 className="font-bold text-body-lg">Containerliste Bild-Upload oder Direktscan</h5>
                <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                  <Printer className="w-3.5 h-3.5" /> Zero-Config Connector
                </span>
              </div>

              {/* Drag/Drop Zone */}
              <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 text-center bg-surface-container-low hover:bg-surface-container-low/50 transition-colors relative cursor-pointer">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp, application/pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 bg-white rounded-full shadow-xs text-outline">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-body-md font-semibold text-on-surface">
                    {file ? file.name : "Klicke zum Auswählen oder ziehe die Datei hierher"}
                  </div>
                  <div className="text-label-md text-outline">
                    Unterstützt PNG, JPG, JPEG, WEBP oder PDF
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <button
                type="submit"
                disabled={uploading || !file}
                className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
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

              <button
                type="button"
                onClick={() => setIsPrinterModalOpen(true)}
                disabled={uploading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <Printer className="w-4 h-4 text-white" />
                <span>Vom Drucker scannen</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Universal Printer Scanner Modal */}
      <UniversalPrinterScannerModal
        isOpen={isPrinterModalOpen}
        onClose={() => setIsPrinterModalOpen(false)}
        onScanComplete={handlePrinterScanComplete}
        title="Containerliste vom Drucker scannen"
        description="Dokumente direkt über verbundene WLAN- & USB-Drucker scannen und per OCR extrahieren."
      />

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
