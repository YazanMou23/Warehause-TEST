"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileScan,
  Plus,
  Layers,
  CheckCircle2,
  Clock,
  Sparkles,
  Printer,
  Camera,
  UploadCloud,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import AddDocumentModal from "../../components/documents/AddDocumentModal";
import ProcessingQueueView from "../../components/documents/ProcessingQueueView";
import { API_URL } from "../../../config/api";

interface BatchSummary {
  id: string;
  batchNumber: number;
  title?: string;
  status: "DRAFT" | "INGESTING" | "PROCESSING" | "PAUSED" | "COMPLETED" | "FAILED";
  totalDocuments: number;
  completedCount: number;
  failedCount: number;
  createdAt: string;
  createdBy?: { id: string; name: string };
}

export default function DocumentsPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchBatches();
  }, [router]);

  const fetchBatches = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_URL}/documents/batches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
        if (data.length > 0 && !selectedBatchId) {
          setSelectedBatchId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load batches", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchCreated = (newBatchId: string) => {
    setSelectedBatchId(newBatchId);
    fetchBatches();
  };

  // Compute Quick Stats
  const totalIngested = batches.reduce((acc, b) => acc + (b.totalDocuments || 0), 0);
  const totalCompleted = batches.reduce((acc, b) => acc + (b.completedCount || 0), 0);
  const activeBatchesCount = batches.filter((b) => b.status === "PROCESSING").length;
  const successRate = totalIngested > 0 ? Math.round((totalCompleted / totalIngested) * 100) : 100;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Top Banner & Main Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Universal Document Capture & AI Engine
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Dokumenten-Erfassung & KI-Pipeline
          </h1>
          <p className="text-xs md:text-sm text-slate-400 max-w-2xl">
            Erfasse Dokumente über WLAN-Scanner, Live-Kamera oder Datei-Upload in eine streng sequentielle KI-Verarbeitungswarteschlange mit automatischer CRM-Datenextraktion.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-2xl shadow-xl shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span>Dokumente erfassen</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Gesamt erfasst</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-black text-white">{totalIngested}</p>
          <span className="text-[11px] text-slate-500">Dokumente in {batches.length} Stapeln</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>KI-Verarbeitet</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{totalCompleted}</p>
          <span className="text-[11px] text-slate-500">Erfolgreich im CRM persistiert</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Aktive Warteschlangen</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-black text-purple-400">{activeBatchesCount}</p>
          <span className="text-[11px] text-slate-500">Sequentielle Worker (Concurrency=1)</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Erfolgsquote</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-black text-cyan-400">{successRate}%</p>
          <span className="text-[11px] text-slate-500">OCR & GPT-4o Validierung</span>
        </div>
      </div>

      {/* Main Workspace Layout: Left (Batch Selector) & Right (Active Queue Visualizer) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Batch History / Selection (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2 text-sm font-bold text-slate-200">
              <FolderOpen className="w-4 h-4 text-blue-400" />
              <span>Verarbeitungsstapel</span>
            </div>
            <button
              type="button"
              onClick={fetchBatches}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
              title="Aktualisieren"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {batches.map((b) => {
              const isSelected = selectedBatchId === b.id;
              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedBatchId(b.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-blue-600/15 border-blue-500 shadow-md ring-1 ring-blue-500"
                      : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-100 truncate max-w-[180px]">
                      {b.title || `Stapel #${b.batchNumber}`}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        b.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : b.status === "PAUSED"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                    <span>
                      {b.completedCount}/{b.totalDocuments} fertig
                    </span>
                    <span>{new Date(b.createdAt).toLocaleDateString("de-DE")}</span>
                  </div>
                </div>
              );
            })}

            {batches.length === 0 && !loading && (
              <div className="text-center py-12 text-slate-500 text-xs space-y-3">
                <Layers className="w-8 h-8 mx-auto text-slate-600" />
                <p>Noch keine Dokumentenstapel vorhanden.</p>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="text-blue-400 hover:text-blue-300 font-semibold text-xs"
                >
                  Ersten Stapel anlegen →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Processing Queue & Results View (8 cols) */}
        <div className="lg:col-span-8">
          {selectedBatchId ? (
            <ProcessingQueueView
              batchId={selectedBatchId}
              onNewBatchClick={() => setIsModalOpen(true)}
            />
          ) : (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-4">
              <FileScan className="w-12 h-12 mx-auto text-slate-600" />
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-300">
                  Kein Dokumentenstapel ausgewählt
                </p>
                <p className="text-xs text-slate-500">
                  Wähle einen Stapel aus der linken Liste oder erfasse neue Dokumente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/20"
              >
                + Neue Dokumente erfassen
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global Ingestion Modal */}
      <AddDocumentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onBatchCreated={handleBatchCreated}
      />
    </div>
  );
}
