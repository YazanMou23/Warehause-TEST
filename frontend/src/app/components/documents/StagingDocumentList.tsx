"use client";

import React, { useState } from "react";
import {
  FileText,
  Printer,
  Camera,
  Upload,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layers,
  Globe,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export interface StagedDocument {
  id: string;
  originalFileName: string;
  source: "SCANNER" | "CAMERA" | "UPLOAD" | "DRAG_AND_DROP";
  mimeType: string;
  pages: { pageNumber: number; base64Data: string; mimeType: string }[];
}

interface StagingDocumentListProps {
  documents: StagedDocument[];
  batchTitle: string;
  onBatchTitleChange: (title: string) => void;
  ocrLanguage: string;
  onOcrLanguageChange: (lang: string) => void;
  onRemoveDocument: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onSubmitBatch: () => void;
  submitting: boolean;
}

export default function StagingDocumentList({
  documents,
  batchTitle,
  onBatchTitleChange,
  ocrLanguage,
  onOcrLanguageChange,
  onRemoveDocument,
  onMoveUp,
  onMoveDown,
  onSubmitBatch,
  submitting,
}: StagingDocumentListProps) {
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  if (documents.length === 0) {
    return null;
  }

  const getSourceIcon = (source: StagedDocument["source"]) => {
    switch (source) {
      case "SCANNER":
        return <Printer className="w-4 h-4 text-blue-400" />;
      case "CAMERA":
        return <Camera className="w-4 h-4 text-purple-400" />;
      default:
        return <Upload className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-5">
      {/* Batch Header Configuration */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex-1 w-full sm:w-auto">
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Stapel-Bezeichnung
          </label>
          <input
            type="text"
            value={batchTitle}
            onChange={(e) => onBatchTitleChange(e.target.value)}
            placeholder="z.B. Eingangsrechnungen & Stundenzettel KW 33"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="w-full sm:w-48">
          <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>Hauptsprache (OCR)</span>
          </label>
          <select
            value={ocrLanguage}
            onChange={(e) => onOcrLanguageChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="de">Deutsch (Standard)</option>
            <option value="en">English</option>
            <option value="ar">العربية (Arabisch)</option>
            <option value="tr">Türkçe (Türkisch)</option>
          </select>
        </div>
      </div>

      {/* List of Staged Documents */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>Stapel-Dokumente ({documents.length})</span>
          <span>Verarbeitungsreihenfolge (1 bis {documents.length})</span>
        </div>

        {documents.map((doc, idx) => (
          <div
            key={doc.id}
            className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 transition-all hover:border-slate-700 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              {/* Left: Index & Preview */}
              <div className="flex items-center space-x-3">
                <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-bold shrink-0">
                  {idx + 1}
                </span>

                {/* Thumbnail Preview */}
                <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {doc.pages[0]?.base64Data ? (
                    <img
                      src={doc.pages[0].base64Data}
                      alt={doc.originalFileName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileText className="w-6 h-6 text-slate-600" />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-200 truncate max-w-xs sm:max-w-md">
                    {doc.originalFileName}
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                    <span className="flex items-center space-x-1">
                      {getSourceIcon(doc.source)}
                      <span className="capitalize">{doc.source.toLowerCase().replace("_", " ")}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Layers className="w-3 h-3 text-slate-500" />
                      <span>{doc.pages.length} Seite(n)</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Reorder & Delete Actions */}
              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => onMoveUp(idx)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded disabled:opacity-30 transition-colors"
                  title="Nach oben verschieben"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={idx === documents.length - 1}
                  onClick={() => onMoveDown(idx)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded disabled:opacity-30 transition-colors"
                  title="Nach unten verschieben"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveDocument(doc.id)}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                  title="Entfernen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Expandable multi-page strip if > 1 page */}
            {doc.pages.length > 1 && (
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setExpandedDocId(expandedDocId === doc.id ? null : doc.id)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                >
                  <span>{expandedDocId === doc.id ? "Seiten ausblenden" : `Alle ${doc.pages.length} Seiten anzeigen`}</span>
                </button>

                {expandedDocId === doc.id && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-2">
                    {doc.pages.map((p) => (
                      <div key={p.pageNumber} className="relative rounded border border-slate-800 overflow-hidden bg-slate-900">
                        <img src={p.base64Data} alt={`Seite ${p.pageNumber}`} className="w-full h-16 object-cover" />
                        <span className="absolute bottom-1 right-1 bg-black/70 px-1 py-0.5 text-[9px] rounded text-white">
                          S. {p.pageNumber}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Submit Staging to Sequential Queue */}
      <div className="pt-2 flex items-center justify-between border-t border-slate-800">
        <p className="text-xs text-slate-400">
          Die Dokumente werden nacheinander (einzeln) mit KI analysiert & verarbeitet.
        </p>

        <button
          type="button"
          disabled={submitting}
          onClick={onSubmitBatch}
          className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          <span>{submitting ? "Wird eingereiht..." : `Stapel starten (${documents.length} Dokumente)`}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
