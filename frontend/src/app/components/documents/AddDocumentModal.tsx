"use client";

import React, { useState } from "react";
import {
  X,
  Printer,
  Camera,
  UploadCloud,
  FilePlus,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import ScannerCaptureTab from "./ScannerCaptureTab";
import CameraCaptureTab from "./CameraCaptureTab";
import UploadCaptureTab from "./UploadCaptureTab";
import StagingDocumentList, { StagedDocument } from "./StagingDocumentList";
import { API_URL } from "../../../config/api";

interface AddDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBatchCreated: (batchId: string) => void;
}

export default function AddDocumentModal({
  isOpen,
  onClose,
  onBatchCreated,
}: AddDocumentModalProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "scanner" | "camera">("upload");
  const [stagedDocuments, setStagedDocuments] = useState<StagedDocument[]>([]);
  const [batchTitle, setBatchTitle] = useState<string>(
    `Erfassung_${new Date().toLocaleDateString("de-DE").replace(/\./g, "-")}_${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }).replace(":", "")}`
  );
  const [ocrLanguage, setOcrLanguage] = useState<string>("de");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  if (!isOpen) return null;

  const handleAddDocument = (doc: {
    originalFileName: string;
    source: StagedDocument["source"];
    mimeType: string;
    pages: { pageNumber: number; base64Data: string; mimeType: string }[];
  }) => {
    const newDoc: StagedDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      originalFileName: doc.originalFileName,
      source: doc.source,
      mimeType: doc.mimeType,
      pages: doc.pages,
    };
    setStagedDocuments((prev) => [...prev, newDoc]);
    setErrorMessage("");
  };

  const handleAddMultipleDocuments = (docs: StagedDocument[]) => {
    const withIds = docs.map((d, i) => ({
      ...d,
      id: `doc_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
    }));
    setStagedDocuments((prev) => [...prev, ...withIds]);
    setErrorMessage("");
  };

  const handleRemoveDocument = (id: string) => {
    setStagedDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setStagedDocuments((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= stagedDocuments.length - 1) return;
    setStagedDocuments((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleSubmitBatch = async () => {
    if (stagedDocuments.length === 0) {
      setErrorMessage("Bitte füge mindestens ein Dokument hinzu.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const token = localStorage.getItem("accessToken");
      const payload = {
        batchTitle: batchTitle.trim() || `Dokumentenstapel #${Date.now().toString().slice(-4)}`,
        documents: stagedDocuments.map((d) => ({
          originalFileName: d.originalFileName,
          source: d.source,
          mimeType: d.mimeType,
          ocrLanguage,
          pages: d.pages,
        })),
      };

      const res = await fetch(`${API_URL}/documents/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Fehler beim Einreihen (HTTP ${res.status})`);
      }

      const result = await res.json();
      const batchId = result.batch.id;

      // Reset state and notify parent
      setStagedDocuments([]);
      onBatchCreated(batchId);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Dokumente konnten nicht in die Warteschlange eingereiht werden.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl">
              <FilePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Dokumente erfassen & KI-Verarbeitung</h2>
              <p className="text-xs text-slate-400">
                Wähle Hardware-Scanner, Kamera oder Datei-Upload. Alle Quellen fließen in die sequentielle KI-Warteschlange.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="px-6 pt-4 border-b border-slate-800 bg-slate-950/30 flex space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === "upload"
                ? "border-blue-500 text-blue-400 bg-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Datei-Upload & Drag-and-Drop</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("scanner")}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === "scanner"
                ? "border-blue-500 text-blue-400 bg-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>Netzwerk- / USB-Scanner</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("camera")}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === "camera"
                ? "border-blue-500 text-blue-400 bg-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Live-Kamera</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMessage && (
            <div className="flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Tab 1: Upload / Drag & Drop */}
          {activeTab === "upload" && (
            <UploadCaptureTab onFilesAdded={handleAddMultipleDocuments as any} />
          )}

          {/* Tab 2: Hardware Scanner */}
          {activeTab === "scanner" && (
            <ScannerCaptureTab onScanCompleted={handleAddDocument} />
          )}

          {/* Tab 3: Camera */}
          {activeTab === "camera" && (
            <CameraCaptureTab onDocumentCreated={handleAddDocument} />
          )}

          {/* Unified Staging Section (Accumulates documents from all 3 tabs) */}
          <StagingDocumentList
            documents={stagedDocuments}
            batchTitle={batchTitle}
            onBatchTitleChange={setBatchTitle}
            ocrLanguage={ocrLanguage}
            onOcrLanguageChange={setOcrLanguage}
            onRemoveDocument={handleRemoveDocument}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onSubmitBatch={handleSubmitBatch}
            submitting={submitting}
          />
        </div>
      </div>
    </div>
  );
}
