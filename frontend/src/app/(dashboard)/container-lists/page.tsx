"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  Save,
  RotateCw,
  Eye,
  Info,
  Calendar,
  Building2,
  Clock,
  Users,
  Search,
  ArrowRight,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { API_URL } from "@/config/api";
import { getAuthToken } from "@/app/utils/auth";

interface FieldWarning {
  field: string;
  message: string;
  severity: "warning" | "error" | "info";
}

interface ContainerRow {
  rowOrder?: number;
  date?: string;
  containerNumber?: string;
  fuss?: string;
  artikel?: string;
  kartons?: number;
  termin?: string;
  ankunft?: string;
  start?: string;
  ende?: string;
  personal?: number;
  wartezeitVon?: string;
  wartezeitBis?: string;
  wartezeitStd?: string;
  wickel?: string;
  preis?: number;
  ps?: string;
  extraTeam?: string;
  bemerkung?: string;
  warnings?: FieldWarning[];
  uncertainFields?: string[];
}

interface SavedContainerList {
  id: string;
  site: string;
  title?: string;
  date?: string;
  rawFileName?: string;
  status: string;
  notes?: string;
  createdAt: string;
  createdBy?: { id: string; name: string; username: string };
  _count?: { rows: number };
  rows?: ContainerRow[];
}

const SUPPORTED_SITES = [
  "Gant",
  "Brooks",
  "Schwalbe",
  "WE-Britax",
  "Medisana",
  "Zwilling",
  "ProHeq",
  "Loxx",
];

export default function ContainerListsPage() {
  const [activeTab, setActiveTab] = useState<"upload" | "saved">("upload");

  // Extraction State
  const [selectedSite, setSelectedSite] = useState<string>("Gant");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [draftDate, setDraftDate] = useState<string>("");
  const [draftRows, setDraftRows] = useState<ContainerRow[]>([]);
  const [globalWarnings, setGlobalWarnings] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Saved Lists State
  const [savedLists, setSavedLists] = useState<SavedContainerList[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterSite, setFilterSite] = useState<string>("");
  const [selectedSavedList, setSelectedSavedList] = useState<SavedContainerList | null>(null);

  // Load saved lists
  const fetchSavedLists = async () => {
    setIsLoadingSaved(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      let url = `${API_URL}/container-lists?limit=50`;
      if (filterSite) url += `&site=${encodeURIComponent(filterSite)}`;

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Fehler beim Laden der gespeicherten Listen");
      const data = await res.json();
      setSavedLists(data.items || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingSaved(false);
    }
  };

  // Download a saved list as Excel or PDF (export endpoints are JWT-guarded,
  // so the download must go through fetch with the auth header, not window.open)
  const downloadExport = async (id: string, kind: "xlsx" | "pdf", site: string) => {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/container-lists/${id}/export/${kind}`, { headers });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Export fehlgeschlagen (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${site}-CTR-Liste.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMessage(err.message || "Export fehlgeschlagen");
    }
  };

  useEffect(() => {
    if (activeTab === "saved") {
      fetchSavedLists();
    }
  }, [activeTab, filterSite]);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  };

  // Helper: Live calculation of Wartezeit (bis - von) * personal
  const calculateWartezeitLive = (von?: string, bis?: string, personal?: number): string => {
    if (!von || !bis || !personal || personal <= 0) return "";
    const parse = (t: string) => {
      const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    const v = parse(von);
    const b = parse(bis);
    if (v === null || b === null) return "";
    let diff = b - v;
    if (diff < 0) diff += 24 * 60;
    const totalMin = Math.round(diff * personal);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}:${m.toString().padStart(2, "0")}`;
  };

  // Extract Action
  const handleExtract = async () => {
    if (!selectedFile) {
      setErrorMessage("Bitte wählen Sie zuerst eine Bild- oder PDF-Datei aus.");
      return;
    }

    setIsExtracting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("site", selectedSite);

      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/container-lists/extract`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Extraktion fehlgeschlagen");
      }

      const draft = await res.json();
      setSelectedSite(draft.site || selectedSite);
      setDraftTitle(`Entladeliste ${draft.site || selectedSite} - ${draft.date || ""}`);
      setDraftDate(draft.date || new Date().toISOString().slice(0, 10));
      setDraftRows(draft.rows || []);
      setGlobalWarnings(draft.globalWarnings || []);
      setSuccessMessage(`Erfolgreich extrahiert: ${draft.rows?.length || 0} Container-Zeilen gefunden.`);
    } catch (err: any) {
      setErrorMessage(`Fehler bei der Extraktion: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // Update a single field in draft row
  const updateRowField = (index: number, field: keyof ContainerRow, value: any) => {
    const updated = [...draftRows];
    const target = { ...updated[index], [field]: value };

    // Auto-recalculate Wartezeit Std when von/bis/personal changes
    if (field === "wartezeitVon" || field === "wartezeitBis" || field === "personal") {
      const calc = calculateWartezeitLive(
        field === "wartezeitVon" ? value : target.wartezeitVon,
        field === "wartezeitBis" ? value : target.wartezeitBis,
        field === "personal" ? Number(value) : target.personal,
      );
      if (calc) target.wartezeitStd = calc;
    }

    // Clean up warnings if resolved
    if (field === "personal" && Number(value) > 0) {
      target.uncertainFields = (target.uncertainFields || []).filter((f) => f !== "personal");
      target.warnings = (target.warnings || []).filter((w) => w.field !== "personal");
    }

    updated[index] = target;
    setDraftRows(updated);
  };

  // Add empty row
  const addRow = () => {
    setDraftRows([
      ...draftRows,
      {
        rowOrder: draftRows.length + 1,
        date: draftDate || "",
        containerNumber: "",
        fuss: "40",
        artikel: "",
        kartons: 0,
        termin: "",
        ankunft: "",
        start: "",
        ende: "",
        personal: 2,
        wartezeitVon: "",
        wartezeitBis: "",
        wartezeitStd: "",
        wickel: "",
        preis: 0,
        ps: "",
        extraTeam: "",
        bemerkung: "",
        warnings: [],
        uncertainFields: [],
      },
    ]);
  };

  // Remove row
  const removeRow = (index: number) => {
    const updated = draftRows.filter((_, i) => i !== index);
    setDraftRows(updated);
  };

  // Save to Database
  const handleSaveToDatabase = async () => {
    if (draftRows.length === 0) {
      setErrorMessage("Keine Zeilen zum Speichern vorhanden.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const payload = {
        site: selectedSite,
        title: draftTitle || `Containerliste ${selectedSite}`,
        date: draftDate || new Date().toISOString().slice(0, 10),
        rawFileName: selectedFile?.name,
        status: "SAVED",
        rows: draftRows,
      };

      const res = await fetch(`${API_URL}/container-lists`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Fehler beim Speichern");
      }

      setSuccessMessage("Containerliste erfolgreich in der Datenbank gespeichert! ✅");
      setSelectedFile(null);
      setDraftRows([]);
      setActiveTab("saved");
    } catch (err: any) {
      setErrorMessage(`Speichern fehlgeschlagen: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered saved lists
  const filteredLists = useMemo(() => {
    return savedLists.filter((item) => {
      const matchSearch =
        searchQuery === "" ||
        item.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.rawFileName && item.rawFileName.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSearch;
    });
  }, [savedLists, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-600/10 text-blue-600 rounded-lg">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Container-Listen (CTR-Liste)
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            KI-gestützte Erfassung, Prüfung und Verwaltung von Entladelisten der Kundenstandorte.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === "upload"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Neue Liste erfassen
          </button>
          <button
            onClick={() => setActiveTab("saved")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === "saved"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Gespeicherte Listen ({savedLists.length})
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-medium">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ─── TAB 1: UPLOAD & REVIEW DRAFT FLOW ─────────────────────────── */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          {/* Step 1: Upload & Configuration Box */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-blue-600" />
              <span>1. Original-Containerliste hochladen (Foto oder PDF)</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Site selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  Kunden-Standort (Vorlage)
                </label>
                <select
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {SUPPORTED_SITES.map((site) => (
                    <option key={site} value={site}>
                      {site}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1.5">
                  Bestimmt das spätere Excel- und PDF-Exportlayout.
                </p>
              </div>

              {/* File Dropzone */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  Datei auswählen
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/40 dark:file:text-blue-300 cursor-pointer"
                  />
                  <button
                    onClick={handleExtract}
                    disabled={!selectedFile || isExtracting}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 whitespace-nowrap shadow-sm shadow-blue-500/20 transition-all"
                  >
                    {isExtracting ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        <span>Analysiere...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        <span>KI-Extraktion starten</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Global Extraction Warnings */}
            {globalWarnings.length > 0 && (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs space-y-1">
                {globalWarnings.map((w, idx) => (
                  <p key={idx} className="flex items-center gap-1.5 font-medium">
                    <Info className="w-4 h-4 flex-shrink-0" />
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Review & Editable Table (when draft rows exist) */}
          {draftRows.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>2. Entwurf prüfen & korrigieren ({draftRows.length} Container)</span>
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Überprüfen Sie unsichere Handschriften und fehlende Mitarbeiter. Wartezeiten werden automatisch berechnet.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={addRow}
                    className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Zeile hinzufügen</span>
                  </button>
                  <button
                    onClick={handleSaveToDatabase}
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-500/20"
                  >
                    {isSaving ? <RotateCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>In Datenbank speichern</span>
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-2 w-10">#</th>
                      <th className="py-2.5 px-2 min-w-[90px]">Datum</th>
                      <th className="py-2.5 px-2 min-w-[140px]">Container-Nr.</th>
                      <th className="py-2.5 px-2 min-w-[70px]">Fuß</th>
                      <th className="py-2.5 px-2 min-w-[130px]">Artikel</th>
                      <th className="py-2.5 px-2 min-w-[80px]">Kartons</th>
                      <th className="py-2.5 px-2 min-w-[75px]">Termin</th>
                      <th className="py-2.5 px-2 min-w-[75px]">Ankunft</th>
                      <th className="py-2.5 px-2 min-w-[75px]">Start</th>
                      <th className="py-2.5 px-2 min-w-[75px]">Ende</th>
                      <th className="py-2.5 px-2 min-w-[85px] bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        Personal *
                      </th>
                      <th className="py-2.5 px-2 min-w-[75px]">Wartez. Von</th>
                      <th className="py-2.5 px-2 min-w-[75px]">Wartez. Bis</th>
                      <th className="py-2.5 px-2 min-w-[80px] text-blue-600 dark:text-blue-400 font-bold">
                        Wartez. Std
                      </th>
                      <th className="py-2.5 px-2 min-w-[80px]">Wickel</th>
                      <th className="py-2.5 px-2 min-w-[120px]">Bemerkung</th>
                      <th className="py-2.5 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                    {draftRows.map((row, idx) => {
                      const isPersonalMissing =
                        row.personal === undefined || row.personal === null || row.personal <= 0;
                      const isContainerUncertain = row.uncertainFields?.includes("containerNumber");

                      return (
                        <tr
                          key={idx}
                          className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                        >
                          <td className="py-2 px-2 text-gray-400 font-mono text-[11px]">{idx + 1}</td>

                          {/* Datum */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.date || ""}
                              onChange={(e) => updateRowField(idx, "date", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                          </td>

                          {/* Container Number */}
                          <td className="py-2 px-1">
                            <div className="relative">
                              <input
                                type="text"
                                value={row.containerNumber || ""}
                                onChange={(e) => updateRowField(idx, "containerNumber", e.target.value)}
                                className={`w-full px-2 py-1 rounded bg-transparent border font-mono font-bold text-xs outline-none ${
                                  isContainerUncertain
                                    ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                                }`}
                              />
                              {isContainerUncertain && (
                                <span className="absolute right-1 top-1.5 w-2 h-2 rounded-full bg-amber-500" title="Handschrift unsicher" />
                              )}
                            </div>
                          </td>

                          {/* Fuß */}
                          <td className="py-2 px-1">
                            <select
                              value={row.fuss || "40"}
                              onChange={(e) => updateRowField(idx, "fuss", e.target.value)}
                              className="w-full px-1.5 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                            >
                              <option value="20">20</option>
                              <option value="40">40</option>
                              <option value="45">45</option>
                            </select>
                          </td>

                          {/* Artikel */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.artikel || ""}
                              onChange={(e) => updateRowField(idx, "artikel", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs outline-none"
                            />
                          </td>

                          {/* Kartons */}
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              value={row.kartons ?? ""}
                              onChange={(e) => updateRowField(idx, "kartons", parseInt(e.target.value, 10) || 0)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none text-right"
                            />
                          </td>

                          {/* Termin */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.termin || ""}
                              placeholder="08:00"
                              onChange={(e) => updateRowField(idx, "termin", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                            />
                          </td>

                          {/* Ankunft */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.ankunft || ""}
                              placeholder="07:45"
                              onChange={(e) => updateRowField(idx, "ankunft", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                            />
                          </td>

                          {/* Start */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.start || ""}
                              placeholder="08:15"
                              onChange={(e) => updateRowField(idx, "start", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                            />
                          </td>

                          {/* Ende */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.ende || ""}
                              placeholder="11:30"
                              onChange={(e) => updateRowField(idx, "ende", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                            />
                          </td>

                          {/* Personal (Strict Warning if Missing) */}
                          <td className="py-2 px-1 bg-amber-500/5 dark:bg-amber-500/10">
                            <div className="relative">
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={row.personal ?? ""}
                                placeholder="Fehlt!"
                                onChange={(e) => updateRowField(idx, "personal", parseInt(e.target.value, 10) || undefined)}
                                className={`w-full px-2 py-1 rounded font-mono font-bold text-xs outline-none ${
                                  isPersonalMissing
                                    ? "border-2 border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                    : "border border-amber-300 dark:border-amber-700 text-gray-900 dark:text-white"
                                }`}
                              />
                            </div>
                          </td>

                          {/* Wartezeit Von */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.wartezeitVon || ""}
                              placeholder="09:00"
                              onChange={(e) => updateRowField(idx, "wartezeitVon", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                            />
                          </td>

                          {/* Wartezeit Bis */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.wartezeitBis || ""}
                              placeholder="09:50"
                              onChange={(e) => updateRowField(idx, "wartezeitBis", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                            />
                          </td>

                          {/* Wartezeit Std (Calculated) */}
                          <td className="py-2 px-2 font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">
                            {row.wartezeitStd || "—"}
                          </td>

                          {/* Wickel */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.wickel || ""}
                              placeholder="z. B. 12 Pal."
                              onChange={(e) => updateRowField(idx, "wickel", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs outline-none"
                            />
                          </td>

                          {/* Bemerkung */}
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.bemerkung || ""}
                              placeholder="z. B. Verspätung"
                              onChange={(e) => updateRowField(idx, "bemerkung", e.target.value)}
                              className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs outline-none"
                            />
                          </td>

                          {/* Actions */}
                          <td className="py-2 px-1 text-center">
                            <button
                              onClick={() => removeRow(idx)}
                              className="text-gray-400 hover:text-rose-500 transition-colors p-1"
                              title="Zeile entfernen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Warnings Legend & Summary */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between text-xs text-gray-400 gap-2">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded border-2 border-rose-500 bg-rose-500/10 inline-block" />
                    <span>Personal fehlt (Nicht raten)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded border border-amber-500 bg-amber-500/10 inline-block" />
                    <span>Handschrift / Wert unsicher</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold text-blue-500">Wartezeit Std:</span>
                    <span>(Bis - Von) × Personal</span>
                  </span>
                </div>

                <div>Gesamt: <strong className="text-gray-900 dark:text-white font-mono">{draftRows.length}</strong> Container</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: SAVED LISTS OVERVIEW ───────────────────────────────── */}
      {activeTab === "saved" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Liste nach Standort, Titel oder Datei suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={filterSite}
                onChange={(e) => setFilterSite(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-medium outline-none"
              >
                <option value="">Alle Standorte</option>
                {SUPPORTED_SITES.map((site) => (
                  <option key={site} value={site}>
                    {site}
                  </option>
                ))}
              </select>

              <button
                onClick={fetchSavedLists}
                className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 dark:text-gray-300"
                title="Aktualisieren"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Saved Lists Table */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
            {isLoadingSaved ? (
              <div className="p-12 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Lade gespeicherte Listen...</span>
              </div>
            ) : filteredLists.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400 space-y-2">
                <FileText className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                <p>Keine gespeicherten Container-Listen gefunden.</p>
                <button
                  onClick={() => setActiveTab("upload")}
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  Erste Liste jetzt hochladen
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 text-gray-400 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Standort</th>
                    <th className="py-3 px-4">Titel &amp; Datum</th>
                    <th className="py-3 px-4">Originaldatei</th>
                    <th className="py-3 px-4 text-center">Container-Anzahl</th>
                    <th className="py-3 px-4">Erfasst am</th>
                    <th className="py-3 px-4 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredLists.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        <span>{item.site}</span>
                      </td>

                      <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">
                        <div>{item.title || `Liste ${item.site}`}</div>
                        <div className="text-[11px] text-gray-400">
                          {item.date ? new Date(item.date).toLocaleDateString("de-DE") : "—"}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-gray-500">
                        {item.rawFileName || "—"}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                        {item._count?.rows ?? item.rows?.length ?? 0}
                      </td>

                      <td className="py-3 px-4 text-gray-400 text-[11px]">
                        {new Date(item.createdAt).toLocaleString("de-DE")}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            const token = getAuthToken();
                            const headers: Record<string, string> = {};
                            if (token) headers["Authorization"] = `Bearer ${token}`;
                            const res = await fetch(`${API_URL}/container-lists/${item.id}`, { headers });
                            if (res.ok) {
                              const full = await res.json();
                              setSelectedSavedList(full);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-xs inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ansehen</span>
                        </button>
                        <button
                          onClick={() => downloadExport(item.id, "xlsx", item.site)}
                          title="Als Excel exportieren"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 font-semibold text-xs inline-flex items-center gap-1"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>XLSX</span>
                        </button>
                        <button
                          onClick={() => downloadExport(item.id, "pdf", item.site)}
                          title="Als PDF exportieren"
                          className="px-2.5 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-700 dark:text-red-400 font-semibold text-xs inline-flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL: INSPECT SAVED LIST ─────────────────────────────────── */}
      {selectedSavedList && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span>{selectedSavedList.title}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-xs font-semibold">
                    {selectedSavedList.site}
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Erfasst am {new Date(selectedSavedList.createdAt).toLocaleString("de-DE")} • {selectedSavedList.rows?.length || 0} Container
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadExport(selectedSavedList.id, "xlsx", selectedSavedList.site)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Excel</span>
                </button>
                <button
                  onClick={() => downloadExport(selectedSavedList.id, "pdf", selectedSavedList.site)}
                  className="px-3 py-1.5 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-700 dark:text-red-400 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  onClick={() => setSelectedSavedList(null)}
                  className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold hover:bg-gray-200"
                >
                  Schließen
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-400 font-semibold">
                      <th className="py-2 px-2">#</th>
                      <th className="py-2 px-2">Datum</th>
                      <th className="py-2 px-2">Container-Nr.</th>
                      <th className="py-2 px-2">Fuß</th>
                      <th className="py-2 px-2">Artikel</th>
                      <th className="py-2 px-2">Kartons</th>
                      <th className="py-2 px-2">Start</th>
                      <th className="py-2 px-2">Ende</th>
                      <th className="py-2 px-2">Personal</th>
                      <th className="py-2 px-2">Wartezeit</th>
                      <th className="py-2 px-2 font-bold text-blue-600">Wartez. Std</th>
                      <th className="py-2 px-2">Bemerkung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {selectedSavedList.rows?.map((r, i) => (
                      <tr key={r.rowOrder || i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                        <td className="py-2 px-2 font-mono text-gray-400">{i + 1}</td>
                        <td className="py-2 px-2">{r.date || "—"}</td>
                        <td className="py-2 px-2 font-mono font-bold text-gray-900 dark:text-white">{r.containerNumber || "—"}</td>
                        <td className="py-2 px-2 font-mono">{r.fuss || "—"}</td>
                        <td className="py-2 px-2">{r.artikel || "—"}</td>
                        <td className="py-2 px-2 font-mono">{r.kartons ?? "—"}</td>
                        <td className="py-2 px-2 font-mono">{r.start || "—"}</td>
                        <td className="py-2 px-2 font-mono">{r.ende || "—"}</td>
                        <td className="py-2 px-2 font-mono font-semibold">{r.personal ?? "—"}</td>
                        <td className="py-2 px-2 font-mono text-gray-500">
                          {r.wartezeitVon && r.wartezeitBis ? `${r.wartezeitVon} - ${r.wartezeitBis}` : "—"}
                        </td>
                        <td className="py-2 px-2 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {r.wartezeitStd || "—"}
                        </td>
                        <td className="py-2 px-2 text-gray-500">{r.bemerkung || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
