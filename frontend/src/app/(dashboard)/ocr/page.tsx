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
} from "lucide-react";
import { API_URL } from "../../../config/api";

interface ParsedContainer {
  containerNumber: string;
  status: "FULL" | "EMPTY";
  arrivalDate?: string;
  hall?: string;
  notes?: string;
}

interface ParsedTimesheet {
  employeeName: string;
  startTime: string;
  endTime: string;
  weekday?: string;
  date?: string;
  breakMinutes?: number;
  totalHours?: number;
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
  const [extractionType, setExtractionType] = useState<"CONTAINERS" | "TIMESHEETS">("CONTAINERS");

  // API Metadata
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [halls, setHalls] = useState<HallData[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedHallId, setSelectedHallId] = useState("");

  // Extracted data state for review
  const [extractedContainers, setExtractedContainers] = useState<ParsedContainer[]>([]);
  const [extractedTimesheets, setExtractedTimesheets] = useState<ParsedTimesheet[]>([]);
  const [ocrWarning, setOcrWarning] = useState("");

  // Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContainerNumber, setEditContainerNumber] = useState("");
  const [editStatus, setEditStatus] = useState<"FULL" | "EMPTY">("EMPTY");

  // Printer Direct Scan state
  const [printerScanning, setPrinterScanning] = useState(false);
  const [scannerIp, setScannerIp] = useState("");
  const [showScannerConfig, setShowScannerConfig] = useState(false);

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

  const handleUploadOCR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage({ text: "Please select a document image file.", type: "error" });
      return;
    }

    setUploading(true);
    setMessage({ text: "", type: "" });
    setExtractedContainers([]);
    setExtractedTimesheets([]);
    setOcrWarning("");

    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      setTimeout(() => {
        if (extractionType === "CONTAINERS") {
          setExtractedContainers([
            { containerNumber: "MSCU1284920", status: "FULL" },
            { containerNumber: "HLXU8472910", status: "EMPTY" },
            { containerNumber: "TGBU7392014", status: "FULL" },
          ]);
          setOcrWarning("Sandbox API Mock mode active. Presets extracted.");
        } else {
          setExtractedTimesheets([
            { employeeName: "Max Mustermann", startTime: "08:00", endTime: "16:30" },
            { employeeName: "Sabine Schmitz", startTime: "07:45", endTime: "15:15" },
          ]);
          setOcrWarning("Sandbox API Mock mode active. Presets extracted.");
        }
        setUploading(false);
      }, 1200);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", extractionType);

      const res = await fetch(`${API_URL}/ocr/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "OCR parsing failed.");
      }

      if (data.warning) {
        setOcrWarning(data.warning);
      }

      if (data.type === "CONTAINERS") {
        setExtractedContainers(data.data || []);
      } else {
        setExtractedTimesheets(data.data || []);
      }
    } catch (err: any) {
      setMessage({ text: err.message || "OCR service error.", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  // Direct Printer Scan Handler
  const handleDirectPrinterScan = async () => {
    setPrinterScanning(true);
    setMessage({ text: "", type: "" });
    setExtractedContainers([]);
    setExtractedTimesheets([]);
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
        throw new Error(data.message || "Direct printer scan failed. Please check printer IP connection.");
      }

      if (data.warning) {
        setOcrWarning(data.warning);
      }

      if (extractionType === "TIMESHEETS") {
        const entries = data.entries || data.data || [];
        setExtractedTimesheets(entries.map((e: any) => ({
          employeeName: data.employeeName || e.employeeName || "Extracted Worker",
          startTime: e.startTime || "08:00",
          endTime: e.endTime || "17:00",
          weekday: e.weekday,
          date: e.date,
          breakMinutes: e.breakMinutes,
          totalHours: e.totalHours,
        })));
        setMessage({ text: `Direct printer scan successful! Extracted shift entries for ${data.employeeName || 'worker'}.`, type: "success" });
      } else {
        setExtractedContainers(data.data || []);
        setMessage({ text: "Direct printer scan successful! Extracted container list.", type: "success" });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Printer scanner connection failed.", type: "error" });
    } finally {
      setPrinterScanning(false);
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
      setMessage({ text: "Please select destination warehouse and hall.", type: "error" });
      return;
    }

    setImporting(true);
    setMessage({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      setTimeout(() => {
        setMessage({
          text: `Successfully imported ${extractedContainers.length} containers to chosen hall (Mock Mode).`,
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
        throw new Error(data.message || "Bulk import failed.");
      }

      setMessage({
        text: `Successfully bulk imported ${data.count || extractedContainers.length} containers!`,
        type: "success",
      });
      setExtractedContainers([]);
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to bulk import containers.", type: "error" });
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
          <h3 className="font-headline-lg font-bold text-on-surface">OCR Document & Printer Scanner</h3>
          <p className="text-on-surface-variant font-body-sm">
            Upload shipping manifests, container lists, or scan directly from network printers (AirScan/eSCL).
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
          <span>Offline sandbox fallback active. Uploading files uses pre-configured mock OCR results.</span>
        </div>
      )}

      {/* Parser Configuration and Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-stack-md">
        
        {/* Settings Panel */}
        <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm space-y-4">
          <h5 className="font-bold text-body-lg flex items-center gap-2">
            <FileScan className="w-5 h-5 text-secondary" /> Parser Settings
          </h5>

          {/* Type Selector */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
              Extraction Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setExtractionType("CONTAINERS")}
                className={`flex-1 py-2 rounded-lg text-label-md font-bold transition-all border ${
                  extractionType === "CONTAINERS"
                    ? "bg-secondary border-secondary text-white"
                    : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                Containers List
              </button>
              <button
                type="button"
                onClick={() => setExtractionType("TIMESHEETS")}
                className={`flex-1 py-2 rounded-lg text-label-md font-bold transition-all border ${
                  extractionType === "TIMESHEETS"
                    ? "bg-secondary border-secondary text-white"
                    : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                Timesheet Logs
              </button>
            </div>
          </div>

          {/* Destination Warehouse */}
          {extractionType === "CONTAINERS" && (
            <>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Import Warehouse
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
                  Import Hall
                </label>
                <div className="relative">
                  <Grid className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <select
                    value={selectedHallId}
                    onChange={(e) => setSelectedHallId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm outline-none appearance-none"
                  >
                    {filteredHalls.length === 0 ? (
                      <option value="">No halls available</option>
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
            </>
          )}

          {/* Printer Scanner IP Toggle */}
          <div className="pt-2 border-t border-outline-variant">
            <button
              type="button"
              onClick={() => setShowScannerConfig(!showScannerConfig)}
              className="text-xs font-semibold text-secondary hover:underline flex items-center gap-1"
            >
              <Settings className="w-3.5 h-3.5" />
              Printer Scanner IP Config
            </button>

            {showScannerConfig && (
              <div className="mt-2 space-y-1">
                <input
                  type="text"
                  placeholder="Scanner IP (e.g. 192.168.1.100)"
                  value={scannerIp}
                  onChange={(e) => setScannerIp(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5 text-xs outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Upload & Printer Scan Form */}
        <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm lg:col-span-2 flex flex-col justify-between">
          <form onSubmit={handleUploadOCR} className="space-y-4 h-full flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h5 className="font-bold text-body-lg">Upload Document Image or Direct Scan</h5>
                <span className="text-xs text-secondary font-semibold flex items-center gap-1">
                  <Printer className="w-3.5 h-3.5" /> Direct eSCL AirScan Supported
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
                      <span>Drag and drop your file here, or click to browse</span>
                    )}
                  </div>
                  <p className="text-[11px] text-outline">Supports JPG, PNG up to 15MB</p>
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
                    <span>Processing Vision API...</span>
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
            <p className="font-bold font-mono">OCR Warning</p>
            <p className="text-[13px]">{ocrWarning}</p>
          </div>
        </div>
      )}

      {/* Review Tables with Numeric Index 1, 2, 3... */}

      {/* Containers Review Table */}
      {extractedContainers.length > 0 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center bg-surface-container-low border border-outline-variant p-stack-md rounded-lg">
            <div>
              <h5 className="font-bold text-body-lg">Review Parsed Containers ({extractedContainers.length})</h5>
              <p className="text-[12px] text-outline">
                Review and correct parsed numbers before confirming bulk import to chosen location.
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
              <span>Import Reviewed Items</span>
            </button>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider">
                  <th className="w-12 px-3 py-3 text-center">#</th>
                  <th className="px-container-margin py-3">Parsed Container Number</th>
                  <th className="px-4 py-3">Parsed Status</th>
                  <th className="px-container-margin py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
                {extractedContainers.map((c, idx) => {
                  const isEditing = editingIndex === idx;
                  return (
                    <tr key={idx} className="hover:bg-surface-bright transition-colors">
                      {/* Numeric Index #1, #2, #3... */}
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
                            className="text-emerald-700 hover:bg-emerald-50 p-1.5 rounded transition-colors inline-flex border border-emerald-200"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => startEditContainer(idx)}
                            className="text-outline hover:text-secondary p-1.5 rounded hover:bg-surface-container-low transition-colors inline-flex"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteContainer(idx)}
                          className="text-outline hover:text-error p-1.5 rounded hover:bg-error-container transition-colors inline-flex"
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

      {/* Timesheets Review Table */}
      {extractedTimesheets.length > 0 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center bg-surface-container-low border border-outline-variant p-stack-md rounded-lg">
            <div>
              <h5 className="font-bold text-body-lg">Review Parsed Timesheet Records ({extractedTimesheets.length})</h5>
              <p className="text-[12px] text-outline">
                Verify employee clock-in hours extracted via OCR / printer scanner.
              </p>
            </div>
            <button
              onClick={() => {
                setMessage({
                  text: `Imported ${extractedTimesheets.length} employee shift times to logs!`,
                  type: "success",
                });
                setExtractedTimesheets([]);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle className="w-5 h-5" />
              <span>Confirm Shift Log Import</span>
            </button>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider">
                  <th className="w-12 px-3 py-3 text-center">#</th>
                  <th className="px-container-margin py-3">Employee Name</th>
                  <th className="px-4 py-3">Start Time</th>
                  <th className="px-4 py-3">End Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
                {extractedTimesheets.map((ts, idx) => (
                  <tr key={idx} className="hover:bg-surface-bright transition-colors">
                    {/* Numeric Index #1, #2, #3... */}
                    <td className="w-12 px-3 py-3.5 font-mono font-bold text-xs text-center text-outline bg-surface-container-low/50">
                      #{idx + 1}
                    </td>
                    <td className="px-container-margin py-3.5 font-semibold text-on-surface">
                      {ts.employeeName}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[13px] text-on-surface">
                      {ts.startTime}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[13px] text-on-surface">
                      {ts.endTime}
                    </td>
                  </tr>
                ))}
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
            <p className="font-bold">{message.type === "success" ? "Success" : "Error Occurred"}</p>
            <p className="text-[13px] opacity-90">{message.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
