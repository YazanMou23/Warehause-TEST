"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Building2,
  User,
  Calendar,
  DollarSign,
  Layers,
  Sparkles,
  Printer,
  Camera,
  Upload,
  RefreshCw,
  Tag,
  Hash,
} from "lucide-react";
import { API_URL } from "../../../config/api";

export interface UniversalDocumentItem {
  id: string;
  batchId: string;
  source: "SCANNER" | "CAMERA" | "UPLOAD" | "DRAG_AND_DROP";
  status:
    | "CREATED"
    | "UPLOADING"
    | "UPLOADED"
    | "QUEUED"
    | "OCR_PROCESSING"
    | "AI_ANALYZING"
    | "PERSISTING"
    | "COMPLETED"
    | "FAILED"
    | "SKIPPED"
    | "CANCELLED";
  queuePosition: number;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  pageCount: number;
  ocrLanguage?: string;
  ocrRawText?: string;
  analysisResult?: any;
  matchedEntityType?: string;
  matchedEntityId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  pages?: { id: string; pageNumber: number }[];
}

export interface DocumentBatchDetail {
  id: string;
  batchNumber: number;
  title?: string;
  status: "DRAFT" | "INGESTING" | "PROCESSING" | "PAUSED" | "COMPLETED" | "FAILED";
  totalDocuments: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  documents: UniversalDocumentItem[];
  createdBy?: { id: string; name: string; role: string };
  auditLogs?: any[];
}

interface ProcessingQueueViewProps {
  batchId: string;
  onNewBatchClick: () => void;
}

export default function ProcessingQueueView({
  batchId,
  onNewBatchClick,
}: ProcessingQueueViewProps) {
  const [batch, setBatch] = useState<DocumentBatchDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch full batch details
  const fetchBatch = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_URL}/documents/batches/${batchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBatch(data);
        setErrorMsg("");
      } else {
        throw new Error(`Batch nicht gefunden (HTTP ${res.status})`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Laden der Warteschlange.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatch();

    // Setup Server-Sent Events (SSE) stream for real-time progress updates
    const token = localStorage.getItem("accessToken");
    const eventSource = new EventSource(`${API_URL}/documents/events`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.batchId === batchId || !data.batchId) {
          fetchBatch();
        }
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    // Polling fallback every 3 seconds while processing
    const pollInterval = setInterval(() => {
      fetchBatch();
    }, 3000);

    return () => {
      eventSource.close();
      clearInterval(pollInterval);
    };
  }, [batchId]);

  // Queue Control Actions
  const handlePause = async () => {
    setActionLoading("pause");
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`${API_URL}/documents/batches/${batchId}/pause`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchBatch();
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    setActionLoading("resume");
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`${API_URL}/documents/batches/${batchId}/resume`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchBatch();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async (docId: string) => {
    setActionLoading(docId);
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`${API_URL}/documents/documents/${docId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchBatch();
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkip = async (docId: string) => {
    setActionLoading(docId);
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`${API_URL}/documents/documents/${docId}/skip`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchBatch();
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !batch) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm">Lade sequentielle KI-Verarbeitungswarteschlange...</p>
      </div>
    );
  }

  if (errorMsg && !batch) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-center space-y-3">
        <AlertCircle className="w-8 h-8 mx-auto text-red-400" />
        <p className="text-sm font-semibold">{errorMsg}</p>
        <button
          type="button"
          onClick={fetchBatch}
          className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-200 text-xs rounded-lg transition-colors"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!batch) return null;

  const total = batch.totalDocuments || batch.documents.length || 1;
  const completed = batch.completedCount || 0;
  const percent = Math.min(100, Math.round((completed / total) * 100));

  // Find the single active document (strict sequential rule: MAX_ACTIVE = 1)
  const activeDoc = batch.documents.find((d) =>
    ["OCR_PROCESSING", "AI_ANALYZING", "PERSISTING"].includes(d.status)
  );

  // Waiting documents
  const queuedDocs = batch.documents.filter((d) =>
    ["QUEUED", "CREATED", "UPLOADING", "UPLOADED"].includes(d.status)
  );

  // Completed documents
  const completedDocs = batch.documents.filter((d) => d.status === "COMPLETED");

  // Failed or Skipped documents
  const issueDocs = batch.documents.filter((d) =>
    ["FAILED", "SKIPPED", "CANCELLED"].includes(d.status)
  );

  const getSourceIcon = (source: UniversalDocumentItem["source"]) => {
    switch (source) {
      case "SCANNER":
        return <Printer className="w-3.5 h-3.5 text-blue-400" />;
      case "CAMERA":
        return <Camera className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Upload className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Batch Status Header & Progress Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-bold text-slate-100">
                {batch.title || `Stapel #${batch.batchNumber}`}
              </h2>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                  batch.status === "COMPLETED"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : batch.status === "PAUSED"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"
                }`}
              >
                {batch.status === "COMPLETED"
                  ? "Abgeschlossen"
                  : batch.status === "PAUSED"
                  ? "Angehalten"
                  : "Sequentielle KI-Verarbeitung aktiv"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Strikte sequentielle Verarbeitung: Dokument N muss vollständig abgeschlossen & in der Datenbank gespeichert sein, bevor Dokument N+1 startet.
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-2">
            {batch.status === "PROCESSING" && (
              <button
                type="button"
                onClick={handlePause}
                disabled={actionLoading === "pause"}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Anhalten</span>
              </button>
            )}

            {batch.status === "PAUSED" && (
              <button
                type="button"
                onClick={handleResume}
                disabled={actionLoading === "resume"}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-lg shadow-blue-600/20"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Fortsetzen</span>
              </button>
            )}

            <button
              type="button"
              onClick={onNewBatchClick}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition-colors"
            >
              <span>+ Neuer Stapel</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium text-slate-300">
            <span>
              Verarbeitet: <b className="text-white">{completed}</b> von <b className="text-white">{total}</b> Dokumenten ({percent}%)
            </span>
            <span>
              Fehlgeschlagen: <b className="text-red-400">{batch.failedCount}</b> | Übersprungen: <b className="text-slate-400">{batch.skippedCount}</b>
            </span>
          </div>

          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ACTIVE DOCUMENT IN PROGRESS (Single Concurrency Worker) */}
      {activeDoc && (
        <div className="bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-900 border-2 border-blue-500/60 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-blue-900/40">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center animate-pulse">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold uppercase tracking-wider">
                    Aktuell in Verarbeitung (Dokument #{activeDoc.queuePosition})
                  </span>
                  <span className="flex items-center space-x-1 text-xs text-slate-400">
                    {getSourceIcon(activeDoc.source)}
                    <span className="capitalize">{activeDoc.source.toLowerCase().replace("_", " ")}</span>
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">{activeDoc.originalFileName}</h3>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-400 block">{activeDoc.pageCount} Seite(n)</span>
              <span className="text-xs text-blue-400 font-medium">Sprache: {activeDoc.ocrLanguage?.toUpperCase() || "DE"}</span>
            </div>
          </div>

          {/* 3-Step Live Pipeline Status Indicator */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
            {/* Step 1: OCR */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                activeDoc.status === "OCR_PROCESSING"
                  ? "bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-600/10"
                  : "bg-slate-950/50 border-slate-800/80 text-slate-400"
              }`}
            >
              <div className="flex items-center space-x-2">
                <RefreshCw
                  className={`w-4 h-4 ${
                    activeDoc.status === "OCR_PROCESSING" ? "animate-spin text-blue-400" : "text-emerald-400"
                  }`}
                />
                <span className="font-semibold text-xs">1. OCR-Textextraktion</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {activeDoc.status === "OCR_PROCESSING" ? "Liest Dokumentinhalte..." : "OCR abgeschlossen"}
              </p>
            </div>

            {/* Step 2: AI Analysis */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                activeDoc.status === "AI_ANALYZING"
                  ? "bg-purple-600/20 border-purple-500 text-white shadow-lg shadow-purple-600/10"
                  : ["PERSISTING", "COMPLETED"].includes(activeDoc.status)
                  ? "bg-slate-950/50 border-slate-800/80 text-slate-400"
                  : "bg-slate-950/20 border-slate-800/40 text-slate-600"
              }`}
            >
              <div className="flex items-center space-x-2">
                <Sparkles
                  className={`w-4 h-4 ${
                    activeDoc.status === "AI_ANALYZING" ? "animate-spin text-purple-400" : "text-purple-400"
                  }`}
                />
                <span className="font-semibold text-xs">2. KI-Analyse & Klassifikation</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {activeDoc.status === "AI_ANALYZING"
                  ? "Extrahiert CRM-Daten mit GPT-4o..."
                  : "Warten auf OCR"}
              </p>
            </div>

            {/* Step 3: Persistence */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                activeDoc.status === "PERSISTING"
                  ? "bg-emerald-600/20 border-emerald-500 text-white shadow-lg shadow-emerald-600/10"
                  : "bg-slate-950/20 border-slate-800/40 text-slate-600"
              }`}
            >
              <div className="flex items-center space-x-2">
                <CheckCircle2
                  className={`w-4 h-4 ${
                    activeDoc.status === "PERSISTING" ? "animate-spin text-emerald-400" : "text-slate-500"
                  }`}
                />
                <span className="font-semibold text-xs">3. CRM-Persistierung</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {activeDoc.status === "PERSISTING"
                  ? "Speichert Datensätze in PostgreSQL..."
                  : "Abschließender Schritt"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* WAITING QUEUE LIST */}
      {queuedDocs.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span>Warteschlange ({queuedDocs.length} wartend)</span>
            <span className="text-slate-500">Werden der Reihe nach verarbeitet</span>
          </div>

          <div className="space-y-2">
            {queuedDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl text-xs"
              >
                <div className="flex items-center space-x-3">
                  <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 font-bold flex items-center justify-center text-[11px]">
                    #{doc.queuePosition}
                  </span>
                  <div className="flex items-center space-x-1.5">
                    {getSourceIcon(doc.source)}
                    <span className="font-medium text-slate-200">{doc.originalFileName}</span>
                  </div>
                  <span className="text-slate-500">• {doc.pageCount} Seite(n)</span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    Wartend
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSkip(doc.id)}
                    className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                    title="Überspringen"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMPLETED DOCUMENTS WITH EXTRACTED CRM DATA */}
      {completedDocs.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between text-sm font-bold text-slate-200">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Erfolgreich verarbeitete CRM-Dokumente ({completedDocs.length})</span>
            </div>
          </div>

          <div className="space-y-3">
            {completedDocs.map((doc) => {
              const res = doc.analysisResult || {};
              const isExpanded = expandedDocId === doc.id;

              return (
                <div
                  key={doc.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden transition-all hover:border-slate-700"
                >
                  {/* Summary Bar */}
                  <div
                    onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer bg-slate-950 hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="font-bold text-sm text-slate-100 truncate">
                            {res.companyName || doc.originalFileName}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {res.documentType || "DOKUMENT"}
                          </span>
                          {res.totalAmount && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {res.totalAmount.toFixed(2)} {res.currency || "EUR"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-lg">
                          {res.summary || "Dokument erfolgreich extrahiert und zugeordnet."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0 text-xs text-slate-400">
                      {res.documentDate && (
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{res.documentDate}</span>
                        </span>
                      )}
                      <button
                        type="button"
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded CRM Structured Details */}
                  {isExpanded && (
                    <div className="p-5 border-t border-slate-800/80 bg-slate-900/30 space-y-4">
                      {/* Grid of Key CRM Attributes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                          <span className="text-slate-500 block mb-0.5">Unternehmen / Aussteller</span>
                          <span className="font-semibold text-slate-200">{res.companyName || "—"}</span>
                        </div>
                        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                          <span className="text-slate-500 block mb-0.5">Kontaktperson / Mitarbeiter</span>
                          <span className="font-semibold text-slate-200">{res.contactPerson || "—"}</span>
                        </div>
                        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                          <span className="text-slate-500 block mb-0.5">Referenz- / Belegnummer</span>
                          <span className="font-semibold text-slate-200">{res.referenceNumber || "—"}</span>
                        </div>
                        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                          <span className="text-slate-500 block mb-0.5">Gesamtbetrag</span>
                          <span className="font-semibold text-emerald-400">
                            {res.totalAmount ? `${res.totalAmount.toFixed(2)} ${res.currency || "EUR"}` : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Matched Entities Notification */}
                      {res.matchedEntities && Object.keys(res.matchedEntities).length > 0 && (
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 flex items-center space-x-2">
                          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                          <span>
                            <b>CRM-Zuordnung:</b> Automatisch verknüpft mit{" "}
                            {res.matchedEntities.employee && `Mitarbeiter "${res.matchedEntities.employee.name}"`}
                            {res.matchedEntities.container && `Container "${res.matchedEntities.container.containerNumber}"`}
                            {res.matchedEntities.warehouse && `Lager "${res.matchedEntities.warehouse.name}"`}
                          </span>
                        </div>
                      )}

                      {/* Line Items Table if extracted */}
                      {res.lineItems && res.lineItems.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold text-slate-300">Positionen / Einzelposten</span>
                          <div className="rounded-lg border border-slate-800 overflow-hidden">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-950 text-slate-400">
                                <tr>
                                  <th className="p-2">Beschreibung</th>
                                  <th className="p-2 text-right">Menge</th>
                                  <th className="p-2 text-right">Einzelpreis</th>
                                  <th className="p-2 text-right">Gesamt</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800 text-slate-200">
                                {res.lineItems.map((item: any, i: number) => (
                                  <tr key={i}>
                                    <td className="p-2">{item.description}</td>
                                    <td className="p-2 text-right">{item.quantity || "—"}</td>
                                    <td className="p-2 text-right">{item.unitPrice ? `${item.unitPrice.toFixed(2)} €` : "—"}</td>
                                    <td className="p-2 text-right font-medium">{item.totalPrice ? `${item.totalPrice.toFixed(2)} €` : "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Download / View Button */}
                      <div className="flex justify-end pt-2">
                        <a
                          href={`${API_URL}/documents/documents/${doc.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Originaldokument öffnen</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ISSUES / FAILED DOCUMENTS */}
      {issueDocs.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-sm font-bold text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span>Fehlgeschlagene oder übersprungene Dokumente ({issueDocs.length})</span>
          </div>

          <div className="space-y-2">
            {issueDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3.5 bg-slate-950 rounded-xl border border-red-500/20 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-200">{doc.originalFileName}</span>
                  <p className="text-red-400 text-[11px] mt-0.5">
                    {doc.errorMessage || (doc.status === "SKIPPED" ? "Manuell übersprungen" : "Verarbeitungsfehler")}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleRetry(doc.id)}
                    disabled={actionLoading === doc.id}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Wiederholen</span>
                  </button>
                  {doc.status !== "SKIPPED" && (
                    <button
                      type="button"
                      onClick={() => handleSkip(doc.id)}
                      disabled={actionLoading === doc.id}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                    >
                      <SkipForward className="w-3 h-3" />
                      <span>Überspringen</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
