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
  Building2,
  Search,
  FileSpreadsheet,
  Download,
  Pencil,
  X,
} from "lucide-react";
import { API_URL } from "@/config/api";
import { getAuthToken } from "@/app/utils/auth";

interface FieldWarning {
  field: string;
  message: string;
  severity: "warning" | "error" | "info";
}

interface OtherWorkEntry {
  personal?: number;
  von?: string;
  bis?: string;
  bemerkung?: string;
}

interface CustomerMatchResult {
  detectedCustomerRaw: string | null;
  matchedSite: string | null;
  matchType: "exact" | "ambiguous" | "unknown" | "none";
  candidates: string[];
  requiresConfirmation: boolean;
  warning?: string;
}

interface ContainerRow {
  id?: string;
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
  anderweitigeArbeiten?: OtherWorkEntry[];
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
  "LOXX",
];

function parseClockMinutes(val?: string | null): number | null {
  if (!val) return null;
  const s = val.trim();
  const m = s.match(/^(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  if (h < 0 || h >= 24 || mins < 0 || mins >= 60) return null;
  return h * 60 + mins;
}

function formatGermanDecimalHours(hours: number): string {
  if (!hours || isNaN(hours) || Math.abs(hours) < 1e-6) return "0";
  const rounded = Math.round(hours * 100) / 100;
  return rounded
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}

function computeDauerClock(start?: string, ende?: string): string {
  const s = parseClockMinutes(start);
  const e = parseClockMinutes(ende);
  if (s === null || e === null || e < s) return "—";
  const diff = e - s;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function computeRowWaitingDetails(row: ContainerRow): {
  baseHours: number;
  deductionHours: number;
  netHours: number;
  formattedDecimal: string;
} {
  const personal = Number(row.personal) || 0;
  const v = parseClockMinutes(row.wartezeitVon);
  const b = parseClockMinutes(row.wartezeitBis);
  if (v === null || b === null || b <= v || personal <= 0) {
    return { baseHours: 0, deductionHours: 0, netHours: 0, formattedDecimal: "" };
  }
  const baseHours = ((b - v) / 60) * personal;
  let deductionHours = 0;

  for (const entry of row.anderweitigeArbeiten || []) {
    const ew = Math.min(Math.max(0, Number(entry.personal) || 0), personal);
    const ev = parseClockMinutes(entry.von);
    const eb = parseClockMinutes(entry.bis);
    if (ew > 0 && ev !== null && eb !== null && eb > ev) {
      const overlapStart = Math.max(v, ev);
      const overlapEnd = Math.min(b, eb);
      if (overlapEnd > overlapStart) {
        deductionHours += ((overlapEnd - overlapStart) / 60) * ew;
      }
    }
  }

  const netHours = Math.max(0, baseHours - deductionHours);
  return {
    baseHours,
    deductionHours,
    netHours,
    formattedDecimal: formatGermanDecimalHours(netHours),
  };
}

function computeRowWorkHoursWithoutWaiting(row: ContainerRow): number {
  const personal = Number(row.personal) || 0;
  const s = parseClockMinutes(row.start);
  const e = parseClockMinutes(row.ende);
  if (s === null || e === null || e <= s || personal <= 0) return 0;
  return ((e - s) / 60) * personal;
}

function sanitizeRowForPayload(r: ContainerRow, idx: number): ContainerRow {
  const calc = computeRowWaitingDetails(r);
  const wartezeitStd =
    calc.netHours > 0
      ? calc.formattedDecimal
      : r.wartezeitStd
        ? String(r.wartezeitStd)
        : undefined;

  return {
    rowOrder: idx + 1,
    date: r.date ?? undefined,
    containerNumber: r.containerNumber ?? undefined,
    fuss: r.fuss ? String(r.fuss) : undefined,
    artikel: r.artikel !== undefined && r.artikel !== null ? String(r.artikel) : undefined,
    kartons:
      r.kartons !== undefined && r.kartons !== null && !isNaN(Number(r.kartons))
        ? Math.round(Number(r.kartons))
        : undefined,
    termin: r.termin ?? undefined,
    ankunft: r.ankunft ?? undefined,
    start: r.start ?? undefined,
    ende: r.ende ?? undefined,
    personal:
      r.personal !== undefined && r.personal !== null && !isNaN(Number(r.personal))
        ? Math.round(Number(r.personal))
        : undefined,
    wartezeitVon: r.wartezeitVon ?? undefined,
    wartezeitBis: r.wartezeitBis ?? undefined,
    wartezeitStd,
    wickel: r.wickel !== undefined && r.wickel !== null ? String(r.wickel) : undefined,
    preis:
      r.preis !== undefined && r.preis !== null && !isNaN(Number(r.preis))
        ? Number(r.preis)
        : undefined,
    ps: r.ps ?? undefined,
    extraTeam: r.extraTeam ?? undefined,
    bemerkung: r.bemerkung ?? undefined,
    anderweitigeArbeiten: (r.anderweitigeArbeiten || []).map((entry) => ({
      personal: Number(entry.personal) || 0,
      von: entry.von || "",
      bis: entry.bis || "",
      bemerkung: entry.bemerkung || "",
    })),
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
    uncertainFields: Array.isArray(r.uncertainFields) ? r.uncertainFields : [],
  };
}

function applyRowFieldUpdate(
  rows: ContainerRow[],
  index: number,
  field: keyof ContainerRow,
  value: any,
): ContainerRow[] {
  const updated = [...rows];
  const target: ContainerRow = { ...updated[index], [field]: value };

  // Auto-split if user pasted combined "09:00 bis 09:50" or "08:00-09:30" into wartezeitVon
  if (field === "wartezeitVon" && typeof value === "string") {
    const m = value
      .trim()
      .match(/^(\d{1,2}[:.]\d{2})\s*(?:bis|-|–)\s*(\d{1,2}[:.]\d{2})$/i);
    if (m) {
      target.wartezeitVon = m[1].replace(".", ":");
      target.wartezeitBis = m[2].replace(".", ":");
    }
  }

  if (
    field === "wartezeitVon" ||
    field === "wartezeitBis" ||
    field === "personal" ||
    field === "anderweitigeArbeiten"
  ) {
    const calc = computeRowWaitingDetails(target);
    target.wartezeitStd = calc.formattedDecimal;
  }

  if (field === "personal" && Number(value) > 0) {
    target.uncertainFields = (target.uncertainFields || []).filter(
      (f) => f !== "personal",
    );
    target.warnings = (target.warnings || []).filter((w) => w.field !== "personal");
  }

  updated[index] = target;
  return updated;
}

export default function ContainerListsPage() {
  const [activeTab, setActiveTab] = useState<"upload" | "saved">("upload");

  // Extraction & Customer Detection State
  // Empty string = Automatische Kundenerkennung aus Dokument (kein stiller Standardwert!)
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [isManualSiteOverride, setIsManualSiteOverride] = useState<boolean>(false);
  const [isSiteConfirmed, setIsSiteConfirmed] = useState<boolean>(false);
  const [customerDetection, setCustomerDetection] = useState<CustomerMatchResult | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [draftDate, setDraftDate] = useState<string>("");
  const [draftRows, setDraftRows] = useState<ContainerRow[]>([]);
  const [globalWarnings, setGlobalWarnings] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSimulatedDraft, setIsSimulatedDraft] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedOtherWorkRow, setExpandedOtherWorkRow] = useState<number | null>(null);

  // Saved Lists & Modal Edit State
  const [savedLists, setSavedLists] = useState<SavedContainerList[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterSite, setFilterSite] = useState<string>("");
  const [selectedSavedList, setSelectedSavedList] = useState<SavedContainerList | null>(null);
  const [isEditingModal, setIsEditingModal] = useState<boolean>(false);
  const [modalEditSite, setModalEditSite] = useState<string>("");
  const [modalEditTitle, setModalEditTitle] = useState<string>("");
  const [modalEditDate, setModalEditDate] = useState<string>("");
  const [modalEditRows, setModalEditRows] = useState<ContainerRow[]>([]);
  const [modalExpandedOtherWorkRow, setModalExpandedOtherWorkRow] = useState<number | null>(null);
  const [isSavingModal, setIsSavingModal] = useState<boolean>(false);

  const isSchwalbe = selectedSite === "Schwalbe";
  const isGant = selectedSite === "Gant";

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

  const openSavedListDetail = async (id: string, startInEditMode = false) => {
    setErrorMessage(null);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/container-lists/${id}`, { headers });
      if (!res.ok) {
        throw new Error("Gespeicherte Liste konnte nicht geladen werden.");
      }
      const full: SavedContainerList = await res.json();
      setSelectedSavedList(full);
      setModalEditSite(full.site || "Gant");
      setModalEditTitle(full.title || `Entladeliste ${full.site}`);
      setModalEditDate(
        full.date ? new Date(full.date).toISOString().slice(0, 10) : "",
      );
      setModalEditRows(
        (full.rows || []).map((r) => ({
          ...r,
          anderweitigeArbeiten: r.anderweitigeArbeiten || [],
        })),
      );
      setModalExpandedOtherWorkRow(null);
      setIsEditingModal(startInEditMode);
    } catch (err: any) {
      setErrorMessage(err.message || "Fehler beim Öffnen der Liste");
    }
  };

  const loadSavedListIntoMainEditor = (list: SavedContainerList) => {
    setEditingListId(list.id);
    setSelectedSite(list.site);
    setIsManualSiteOverride(true);
    setIsSiteConfirmed(true);
    setCustomerDetection(null);
    setDraftTitle(list.title || `Entladeliste ${list.site}`);
    setDraftDate(
      list.date ? new Date(list.date).toISOString().slice(0, 10) : "",
    );
    setDraftRows(
      (list.rows || []).map((r) => ({
        ...r,
        anderweitigeArbeiten: r.anderweitigeArbeiten || [],
      })),
    );
    setGlobalWarnings([]);
    setIsSimulatedDraft(false);
    setSelectedSavedList(null);
    setIsEditingModal(false);
    setActiveTab("upload");
    setSuccessMessage(
      `Gespeicherte Liste „${list.title || list.site}“ zur Bearbeitung geladen.`,
    );
  };

  const cancelMainEditorEdit = () => {
    setEditingListId(null);
    setDraftTitle("");
    setDraftDate("");
    setDraftRows([]);
    setSelectedSite("");
    setIsManualSiteOverride(false);
    setIsSiteConfirmed(false);
    setCustomerDetection(null);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleSaveModalChanges = async () => {
    if (!selectedSavedList) return;
    if (modalEditRows.length === 0) {
      setErrorMessage("Die Containerliste muss mindestens eine Zeile enthalten.");
      return;
    }

    setIsSavingModal(true);
    setErrorMessage(null);

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const payload = {
        site: modalEditSite,
        title: modalEditTitle || `Entladeliste ${modalEditSite}`,
        date: modalEditDate || undefined,
        status: "SAVED",
        rows: modalEditRows.map((r, idx) => sanitizeRowForPayload(r, idx)),
      };

      const res = await fetch(`${API_URL}/container-lists/${selectedSavedList.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Fehler beim Aktualisieren der Containerliste");
      }

      const updated: SavedContainerList = await res.json();
      setSelectedSavedList(updated);
      setModalEditSite(updated.site);
      setModalEditTitle(updated.title || "");
      setModalEditDate(
        updated.date ? new Date(updated.date).toISOString().slice(0, 10) : "",
      );
      setModalEditRows(
        (updated.rows || []).map((r) => ({
          ...r,
          anderweitigeArbeiten: r.anderweitigeArbeiten || [],
        })),
      );
      setIsEditingModal(false);
      setSuccessMessage("Änderungen an der Containerliste erfolgreich gespeichert!");
      fetchSavedLists();
    } catch (err: any) {
      setErrorMessage(`Aktualisierung fehlgeschlagen: ${err.message}`);
    } finally {
      setIsSavingModal(false);
    }
  };

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  };

  const handleSiteSelectorChange = (value: string) => {
    if (!value) {
      setSelectedSite("");
      setIsManualSiteOverride(false);
      setIsSiteConfirmed(false);
    } else {
      setSelectedSite(value);
      setIsManualSiteOverride(true);
      setIsSiteConfirmed(true);
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) {
      setErrorMessage("Bitte wählen Sie zuerst eine Datei (Foto, PDF oder CSV) aus.");
      return;
    }

    setIsExtracting(true);
    setEditingListId(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSimulatedDraft(false);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("site", isManualSiteOverride && selectedSite ? selectedSite : "AUTO");

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
      const detection: CustomerMatchResult | null = draft.customerDetection || null;
      setCustomerDetection(detection);

      let resolvedSite = selectedSite;
      if (isManualSiteOverride && selectedSite) {
        // Never overwrite an explicit manual choice silently
        resolvedSite = selectedSite;
        setIsSiteConfirmed(true);
      } else if (detection?.matchType === "exact" && detection.matchedSite) {
        resolvedSite = detection.matchedSite;
        setSelectedSite(detection.matchedSite);
        setIsSiteConfirmed(true);
      } else if (detection?.matchType === "ambiguous") {
        resolvedSite = detection.matchedSite || "";
        setSelectedSite(resolvedSite);
        setIsSiteConfirmed(false);
      } else {
        // Unknown or none: do not treat any default as detected
        resolvedSite = "";
        setSelectedSite("");
        setIsSiteConfirmed(false);
      }

      setDraftTitle(
        `Entladeliste ${resolvedSite || "Kunde wählen"} - ${draft.date || ""}`,
      );
      setDraftDate(draft.date || new Date().toISOString().slice(0, 10));
      setDraftRows(
        (draft.rows || []).map((r: ContainerRow) => ({
          ...r,
          anderweitigeArbeiten: r.anderweitigeArbeiten || [],
        })),
      );
      setGlobalWarnings(draft.globalWarnings || []);
      const simulated = !!draft.simulated;
      setIsSimulatedDraft(simulated);
      if (simulated) {
        setSuccessMessage(null);
      } else {
        setSuccessMessage(
          `Erfolgreich extrahiert: ${draft.rows?.length || 0} Container-Zeilen gefunden.`,
        );
      }
    } catch (err: any) {
      setErrorMessage(`Fehler bei der Extraktion: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const updateRowField = (index: number, field: keyof ContainerRow, value: any) => {
    setDraftRows((prev) => applyRowFieldUpdate(prev, index, field, value));
  };

  const addOtherWorkEntry = (rowIndex: number) => {
    const row = draftRows[rowIndex];
    const nextEntries: OtherWorkEntry[] = [
      ...(row.anderweitigeArbeiten || []),
      {
        personal: 1,
        von: row.wartezeitVon || "",
        bis: row.wartezeitBis || "",
        bemerkung: "",
      },
    ];
    updateRowField(rowIndex, "anderweitigeArbeiten", nextEntries);
    setExpandedOtherWorkRow(rowIndex);
  };

  const updateOtherWorkEntry = (
    rowIndex: number,
    entryIndex: number,
    field: keyof OtherWorkEntry,
    value: any,
  ) => {
    const row = draftRows[rowIndex];
    const entries = [...(row.anderweitigeArbeiten || [])];
    entries[entryIndex] = { ...entries[entryIndex], [field]: value };
    updateRowField(rowIndex, "anderweitigeArbeiten", entries);
  };

  const removeOtherWorkEntry = (rowIndex: number, entryIndex: number) => {
    const row = draftRows[rowIndex];
    const entries = (row.anderweitigeArbeiten || []).filter((_, i) => i !== entryIndex);
    updateRowField(rowIndex, "anderweitigeArbeiten", entries);
  };

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
        anderweitigeArbeiten: [],
        warnings: [],
        uncertainFields: [],
      },
    ]);
  };

  const removeRow = (index: number) => {
    const updated = draftRows.filter((_, i) => i !== index);
    setDraftRows(updated);
  };

  // Modal row helpers
  const updateModalRowField = (
    index: number,
    field: keyof ContainerRow,
    value: any,
  ) => {
    setModalEditRows((prev) => applyRowFieldUpdate(prev, index, field, value));
  };

  const addModalRow = () => {
    setModalEditRows((prev) => [
      ...prev,
      {
        rowOrder: prev.length + 1,
        date: modalEditDate || "",
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
        anderweitigeArbeiten: [],
        warnings: [],
        uncertainFields: [],
      },
    ]);
  };

  const removeModalRow = (index: number) => {
    setModalEditRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addModalOtherWorkEntry = (rowIndex: number) => {
    const row = modalEditRows[rowIndex];
    const nextEntries: OtherWorkEntry[] = [
      ...(row.anderweitigeArbeiten || []),
      {
        personal: 1,
        von: row.wartezeitVon || "",
        bis: row.wartezeitBis || "",
        bemerkung: "",
      },
    ];
    updateModalRowField(rowIndex, "anderweitigeArbeiten", nextEntries);
    setModalExpandedOtherWorkRow(rowIndex);
  };

  const updateModalOtherWorkEntry = (
    rowIndex: number,
    entryIndex: number,
    field: keyof OtherWorkEntry,
    value: any,
  ) => {
    const row = modalEditRows[rowIndex];
    const entries = [...(row.anderweitigeArbeiten || [])];
    entries[entryIndex] = { ...entries[entryIndex], [field]: value };
    updateModalRowField(rowIndex, "anderweitigeArbeiten", entries);
  };

  const removeModalOtherWorkEntry = (rowIndex: number, entryIndex: number) => {
    const row = modalEditRows[rowIndex];
    const entries = (row.anderweitigeArbeiten || []).filter(
      (_, i) => i !== entryIndex,
    );
    updateModalRowField(rowIndex, "anderweitigeArbeiten", entries);
  };

  // Totals across draft rows
  const summaryStats = useMemo(() => {
    let totalWartezeitHours = 0;
    let totalWorkHoursOhneWartezeit = 0;
    for (const r of draftRows) {
      totalWartezeitHours += computeRowWaitingDetails(r).netHours;
      totalWorkHoursOhneWartezeit += computeRowWorkHoursWithoutWaiting(r);
    }
    return {
      totalWartezeitFormatted: `${formatGermanDecimalHours(totalWartezeitHours)} Std.`,
      totalWorkHoursOhneWartezeitFormatted: `${formatGermanDecimalHours(
        totalWorkHoursOhneWartezeit,
      )} Std.`,
    };
  }, [draftRows]);

  // Totals across modal rows
  const modalSummaryStats = useMemo(() => {
    const sourceRows = isEditingModal
      ? modalEditRows
      : selectedSavedList?.rows || [];
    let totalWartezeitHours = 0;
    let totalWorkHoursOhneWartezeit = 0;
    for (const r of sourceRows) {
      totalWartezeitHours += computeRowWaitingDetails(r).netHours;
      totalWorkHoursOhneWartezeit += computeRowWorkHoursWithoutWaiting(r);
    }
    return {
      totalWartezeitFormatted: `${formatGermanDecimalHours(totalWartezeitHours)} Std.`,
      totalWorkHoursOhneWartezeitFormatted: `${formatGermanDecimalHours(
        totalWorkHoursOhneWartezeit,
      )} Std.`,
    };
  }, [isEditingModal, modalEditRows, selectedSavedList]);

  const handleSaveToDatabase = async () => {
    if (draftRows.length === 0) {
      setErrorMessage("Keine Zeilen zum Speichern vorhanden.");
      return;
    }
    if (!selectedSite || !isSiteConfirmed) {
      setErrorMessage(
        "Bitte wählen und bestätigen Sie zuerst den Kunden-Standort (Vorlage), bevor Sie die Liste speichern.",
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const sanitizedRows = draftRows.map((r, idx) => sanitizeRowForPayload(r, idx));

      if (editingListId) {
        const updatePayload = {
          site: selectedSite,
          title: draftTitle || `Containerliste ${selectedSite}`,
          date: draftDate || undefined,
          status: "SAVED",
          rows: sanitizedRows,
        };

        const res = await fetch(`${API_URL}/container-lists/${editingListId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(updatePayload),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || "Fehler beim Aktualisieren");
        }

        setSuccessMessage("Gespeicherte Containerliste erfolgreich aktualisiert!");
        setEditingListId(null);
      } else {
        const createPayload = {
          site: selectedSite,
          title: draftTitle || `Containerliste ${selectedSite}`,
          date: draftDate || new Date().toISOString().slice(0, 10),
          rawFileName: selectedFile?.name,
          status: "SAVED",
          rows: sanitizedRows,
        };

        const res = await fetch(`${API_URL}/container-lists`, {
          method: "POST",
          headers,
          body: JSON.stringify(createPayload),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || "Fehler beim Speichern");
        }

        setSuccessMessage("Containerliste erfolgreich in der Datenbank gespeichert!");
      }

      setSelectedFile(null);
      setDraftRows([]);
      setCustomerDetection(null);
      setActiveTab("saved");
    } catch (err: any) {
      setErrorMessage(`Speichern fehlgeschlagen: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredLists = useMemo(() => {
    return savedLists.filter((item) => {
      const matchSearch =
        searchQuery === "" ||
        item.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.rawFileName &&
          item.rawFileName.toLowerCase().includes(searchQuery.toLowerCase()));
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
              Container-Listen
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            KI-gestützte Erfassung, Prüfung, Nachbearbeitung und originalgetreuer Vorlagen-Export der Kundenstandorte.
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
            {editingListId ? "Liste bearbeiten" : "Neue Liste erfassen"}
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
      {isSimulatedDraft && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-sm font-semibold">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>
            Simulierte Vorschau (KI-Mock-Modus): Es wurden KEINE echten Daten
            extrahiert. Alle Werte unten sind Platzhalter und müssen manuell
            geprüft oder ersetzt werden.
          </span>
        </div>
      )}

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
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-600" />
                <span>
                  {editingListId
                    ? "Gespeicherte Containerliste bearbeiten"
                    : "1. Original-Containerliste hochladen (Foto, PDF oder CSV)"}
                </span>
              </h2>
              {editingListId && (
                <button
                  type="button"
                  onClick={cancelMainEditorEdit}
                  className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Bearbeitung abbrechen (Neue Liste)</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Site selector with Auto-Detection & Manual Override */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Kunde / Standort (Vorlage)
                  </label>
                  {isManualSiteOverride && !editingListId && (
                    <button
                      type="button"
                      onClick={() => handleSiteSelectorChange("")}
                      className="text-[11px] text-blue-600 hover:underline font-medium"
                    >
                      Auf Auto-Erkennung zurücksetzen
                    </button>
                  )}
                </div>
                <select
                  value={selectedSite}
                  onChange={(e) => handleSiteSelectorChange(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border font-medium focus:ring-2 focus:ring-blue-500 outline-none ${
                    selectedSite && isSiteConfirmed
                      ? "border-emerald-500/60 bg-emerald-500/5 text-gray-900 dark:text-white"
                      : "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                  }`}
                >
                  <option value="">
                    — Automatisch aus Dokument erkennen —
                  </option>
                  {SUPPORTED_SITES.map((site) => (
                    <option key={site} value={site}>
                      {site}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1.5">
                  {isManualSiteOverride
                    ? `Manuelle Auswahl aktiv (${selectedSite}). Wird durch Upload nicht stillschweigend überschrieben.`
                    : "Kunde wird beim Hochladen automatisch aus dem Dokument gelesen."}
                </p>
              </div>

              {/* File Dropzone or Title/Date Metadata when editing */}
              <div className="md:col-span-2">
                {editingListId ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                        Titel der Liste
                      </label>
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                        Listen-Datum
                      </label>
                      <input
                        type="date"
                        value={draftDate}
                        onChange={(e) => setDraftDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                      Datei auswählen
                    </label>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <input
                        type="file"
                        accept="image/*,application/pdf,text/csv,.csv"
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
                  </>
                )}
              </div>
            </div>

            {/* Customer Detection Status Banner */}
            {customerDetection && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  customerDetection.matchType === "exact" && isSiteConfirmed
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                    : customerDetection.matchType === "ambiguous"
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
                }`}
              >
                {customerDetection.matchType === "exact" && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>
                        Kunde exakt erkannt:{" "}
                        <strong>{customerDetection.matchedSite}</strong>{" "}
                        (Dokumenttext: „{customerDetection.detectedCustomerRaw}“)
                      </span>
                    </span>
                    {isManualSiteOverride &&
                      selectedSite &&
                      customerDetection.matchedSite &&
                      selectedSite !== customerDetection.matchedSite && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSite(customerDetection.matchedSite!);
                            setIsManualSiteOverride(false);
                            setIsSiteConfirmed(true);
                          }}
                          className="px-3 py-1 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700"
                        >
                          Zu erkanntem Kunden „{customerDetection.matchedSite}“ wechseln
                        </button>
                      )}
                  </div>
                )}

                {customerDetection.matchType === "ambiguous" && (
                  <div className="space-y-2">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>
                        Teil- oder mehrdeutige Kundenangabe erkannt („
                        {customerDetection.detectedCustomerRaw}“). Bitte Kunden
                        ausdrücklich bestätigen:
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {customerDetection.candidates.map((cand) => (
                        <button
                          key={cand}
                          type="button"
                          onClick={() => {
                            setSelectedSite(cand);
                            setIsManualSiteOverride(true);
                            setIsSiteConfirmed(true);
                          }}
                          className={`px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                            selectedSite === cand && isSiteConfirmed
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white dark:bg-gray-900 border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
                          }`}
                        >
                          Kunde „{cand}“ bestätigen
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(customerDetection.matchType === "unknown" ||
                  customerDetection.matchType === "none") && (
                  <div className="space-y-2">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {customerDetection.matchType === "unknown"
                          ? `Unbekannter Kunde im Dokument: „${customerDetection.detectedCustomerRaw}“. Es wurde kein Standardwert gesetzt. Bitte wählen und bestätigen Sie den Kunden manuell:`
                          : "Kein Kunde im Dokument erkannt. Bitte wählen und bestätigen Sie den Kunden manuell:"}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {SUPPORTED_SITES.map((site) => (
                        <button
                          key={site}
                          type="button"
                          onClick={() => {
                            setSelectedSite(site);
                            setIsManualSiteOverride(true);
                            setIsSiteConfirmed(true);
                          }}
                          className={`px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                            selectedSite === site && isSiteConfirmed
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white dark:bg-gray-900 border-rose-300 text-gray-800 dark:text-gray-200 hover:bg-rose-500/10"
                          }`}
                        >
                          {site}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Global Extraction Warnings */}
            {globalWarnings.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs space-y-1">
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
                    <span>
                      {editingListId
                        ? `Gespeicherte Liste bearbeiten (${draftRows.length} Container)`
                        : `2. Entwurf prüfen & korrigieren (${draftRows.length} Container)`}
                    </span>
                    {selectedSite && isSiteConfirmed ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                        Vorlage: {selectedSite}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                        Kunde noch nicht bestätigt!
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Dauer (Ende − Start) bleibt als Formel erhalten. Wartezeit Von–Bis wird als eine kombinierte Textzelle exportiert.
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
                    disabled={isSaving || !selectedSite || !isSiteConfirmed}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-500/20"
                  >
                    {isSaving ? (
                      <RotateCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>
                      {editingListId
                        ? "Änderungen speichern"
                        : "In Datenbank speichern"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-2 w-10">#</th>
                      <th className="py-2.5 px-2 min-w-[105px]">Datum</th>
                      <th className="py-2.5 px-2 min-w-[135px]">Container-Nr.</th>
                      <th className="py-2.5 px-2 min-w-[65px]">Fuß</th>
                      <th className="py-2.5 px-2 min-w-[115px]">Artikel</th>
                      <th className="py-2.5 px-2 min-w-[75px]">Kartons</th>
                      <th className="py-2.5 px-2 min-w-[70px]">Termin</th>
                      <th className="py-2.5 px-2 min-w-[70px]">Ankunft</th>
                      <th className="py-2.5 px-2 min-w-[70px]">Start</th>
                      <th className="py-2.5 px-2 min-w-[70px]">Ende</th>
                      <th className="py-2.5 px-2 min-w-[68px]">Dauer</th>
                      <th className="py-2.5 px-2 min-w-[95px] bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        {isSchwalbe ? "Personal Anzahl *" : "Personal *"}
                      </th>
                      <th className="py-2.5 px-2 min-w-[145px]">
                        {isGant ? "Wartezeit (Von–Bis)" : "Wartezeit Von–Bis"}
                      </th>
                      <th className="py-2.5 px-2 min-w-[110px]">
                        Anderw. Arbeit
                      </th>
                      <th className="py-2.5 px-2 min-w-[90px] text-blue-600 dark:text-blue-400 font-bold">
                        Wartezeit Std.
                      </th>
                      <th className="py-2.5 px-2 min-w-[75px]">Wickel</th>
                      <th className="py-2.5 px-2 min-w-[115px]">Bemerkung</th>
                      <th className="py-2.5 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                    {draftRows.map((row, idx) => {
                      const isPersonalMissing =
                        row.personal === undefined ||
                        row.personal === null ||
                        row.personal <= 0;
                      const isContainerUncertain =
                        row.uncertainFields?.includes("containerNumber");
                      const waitingInfo = computeRowWaitingDetails(row);
                      const otherWorkCount = row.anderweitigeArbeiten?.length || 0;

                      return (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="py-2 px-2 text-gray-400 font-mono text-[11px]">
                              {idx + 1}.
                            </td>

                            {/* Datum */}
                            <td className="py-2 px-1">
                              <input
                                type="text"
                                value={row.date || ""}
                                onChange={(e) =>
                                  updateRowField(idx, "date", e.target.value)
                                }
                                className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                            </td>

                            {/* Container Number */}
                            <td className="py-2 px-1">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={row.containerNumber || ""}
                                  onChange={(e) =>
                                    updateRowField(
                                      idx,
                                      "containerNumber",
                                      e.target.value,
                                    )
                                  }
                                  className={`w-full px-2 py-1 rounded bg-transparent border font-mono font-bold text-xs outline-none ${
                                    isContainerUncertain
                                      ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                      : "border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                                  }`}
                                />
                                {isContainerUncertain && (
                                  <span
                                    className="absolute right-1 top-1.5 w-2 h-2 rounded-full bg-amber-500"
                                    title="Handschrift unsicher"
                                  />
                                )}
                              </div>
                            </td>

                            {/* Fuß */}
                            <td className="py-2 px-1">
                              <select
                                value={row.fuss || "40"}
                                onChange={(e) =>
                                  updateRowField(idx, "fuss", e.target.value)
                                }
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
                                onChange={(e) =>
                                  updateRowField(idx, "artikel", e.target.value)
                                }
                                className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs outline-none"
                              />
                            </td>

                            {/* Kartons */}
                            <td className="py-2 px-1">
                              <input
                                type="number"
                                value={row.kartons ?? ""}
                                onChange={(e) =>
                                  updateRowField(
                                    idx,
                                    "kartons",
                                    parseInt(e.target.value, 10) || 0,
                                  )
                                }
                                className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none text-right"
                              />
                            </td>

                            {/* Termin */}
                            <td className="py-2 px-1">
                              <input
                                type="text"
                                value={row.termin || ""}
                                placeholder="08:00"
                                onChange={(e) =>
                                  updateRowField(idx, "termin", e.target.value)
                                }
                                className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                              />
                            </td>

                            {/* Ankunft */}
                            <td className="py-2 px-1">
                              <input
                                type="text"
                                value={row.ankunft || ""}
                                placeholder="07:45"
                                onChange={(e) =>
                                  updateRowField(idx, "ankunft", e.target.value)
                                }
                                className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                              />
                            </td>

                            {/* Start */}
                            <td className="py-2 px-1">
                              <input
                                type="text"
                                value={row.start || ""}
                                placeholder="08:15"
                                onChange={(e) =>
                                  updateRowField(idx, "start", e.target.value)
                                }
                                className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                              />
                            </td>

                            {/* Ende */}
                            <td className="py-2 px-1">
                              <input
                                type="text"
                                value={row.ende || ""}
                                placeholder="11:30"
                                onChange={(e) =>
                                  updateRowField(idx, "ende", e.target.value)
                                }
                                className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                              />
                            </td>

                            {/* Dauer (Formula Ende - Start, read-only) */}
                            <td
                              className="py-2 px-2 font-mono text-gray-600 dark:text-gray-300 text-xs"
                              title="Excel-Formel: Ende minus Start (h:mm)"
                            >
                              {computeDauerClock(row.start, row.ende)}
                            </td>

                            {/* Personal */}
                            <td className="py-2 px-1 bg-amber-500/5 dark:bg-amber-500/10">
                              <input
                                type="number"
                                min={1}
                                max={30}
                                value={row.personal ?? ""}
                                placeholder="Fehlt!"
                                onChange={(e) =>
                                  updateRowField(
                                    idx,
                                    "personal",
                                    parseInt(e.target.value, 10) || undefined,
                                  )
                                }
                                className={`w-full px-2 py-1 rounded font-mono font-bold text-xs outline-none ${
                                  isPersonalMissing
                                    ? "border-2 border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                    : "border border-amber-300 dark:border-amber-700 text-gray-900 dark:text-white"
                                }`}
                              />
                            </td>

                            {/* Wartezeit Von–Bis (Exported as ONE combined cell) */}
                            <td className="py-2 px-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={row.wartezeitVon || ""}
                                  placeholder="09:00"
                                  onChange={(e) =>
                                    updateRowField(
                                      idx,
                                      "wartezeitVon",
                                      e.target.value,
                                    )
                                  }
                                  className="w-16 px-1.5 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                                />
                                <span className="text-[10px] text-gray-400">
                                  bis
                                </span>
                                <input
                                  type="text"
                                  value={row.wartezeitBis || ""}
                                  placeholder="09:50"
                                  onChange={(e) =>
                                    updateRowField(
                                      idx,
                                      "wartezeitBis",
                                      e.target.value,
                                    )
                                  }
                                  className="w-16 px-1.5 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-xs outline-none"
                                />
                              </div>
                            </td>

                            {/* Anderweitige Arbeit während Wartezeit (Deduction Mechanism) */}
                            <td className="py-2 px-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedOtherWorkRow(
                                    expandedOtherWorkRow === idx ? null : idx,
                                  )
                                }
                                className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
                                  otherWorkCount > 0
                                    ? "bg-purple-500/10 border-purple-500/40 text-purple-700 dark:text-purple-300"
                                    : "border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800"
                                }`}
                              >
                                {otherWorkCount > 0
                                  ? `${otherWorkCount} Abzug (-${formatGermanDecimalHours(
                                      waitingInfo.deductionHours,
                                    )} Std.)`
                                  : "+ Abzug"}
                              </button>
                            </td>

                            {/* Wartezeit Std (Net worker-hours in German decimal notation) */}
                            <td className="py-2 px-2 font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">
                              {waitingInfo.netHours > 0
                                ? `${waitingInfo.formattedDecimal} Std.`
                                : row.wartezeitStd
                                  ? `${row.wartezeitStd} Std.`
                                  : "0 Std."}
                            </td>

                            {/* Wickel */}
                            <td className="py-2 px-1">
                              <input
                                type="text"
                                value={row.wickel || ""}
                                placeholder="z. B. 12 Pal."
                                onChange={(e) =>
                                  updateRowField(idx, "wickel", e.target.value)
                                }
                                className="w-full px-2 py-1 rounded bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs outline-none"
                              />
                            </td>

                            {/* Bemerkung */}
                            <td className="py-2 px-1">
                              <input
                                type="text"
                                value={row.bemerkung || ""}
                                placeholder="z. B. Verspätung"
                                onChange={(e) =>
                                  updateRowField(idx, "bemerkung", e.target.value)
                                }
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

                          {/* Expandable sub-panel for repeatable "Anderweitige Arbeit während Wartezeit" */}
                          {expandedOtherWorkRow === idx && (
                            <tr className="bg-purple-500/5 dark:bg-purple-950/20">
                              <td colSpan={18} className="p-3">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-purple-800 dark:text-purple-300">
                                      Anderweitige Arbeit während der Wartezeit (Zeile{" "}
                                      {idx + 1}: {row.containerNumber || "Container"}) —
                                      wird von den Wartezeit-Personalstunden abgezogen:
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => addOtherWorkEntry(idx)}
                                      className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 inline-flex items-center gap-1"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>Eintrag hinzufügen</span>
                                    </button>
                                  </div>

                                  {(row.anderweitigeArbeiten || []).length === 0 ? (
                                    <p className="text-xs text-gray-500">
                                      Keine Abzüge eingetragen. Klicken Sie auf „Eintrag
                                      hinzufügen“, wenn Mitarbeiter während der Wartezeit an
                                      einem anderen Container gearbeitet haben.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {(row.anderweitigeArbeiten || []).map(
                                        (entry, eIdx) => (
                                          <div
                                            key={eIdx}
                                            className="flex flex-wrap items-center gap-2 text-xs"
                                          >
                                            <label className="flex items-center gap-1">
                                              <span className="text-gray-500">
                                                Personal:
                                              </span>
                                              <input
                                                type="number"
                                                min={1}
                                                max={row.personal || 20}
                                                value={entry.personal ?? ""}
                                                onChange={(e) =>
                                                  updateOtherWorkEntry(
                                                    idx,
                                                    eIdx,
                                                    "personal",
                                                    parseInt(e.target.value, 10) ||
                                                      0,
                                                  )
                                                }
                                                className="w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-mono"
                                              />
                                            </label>
                                            <label className="flex items-center gap-1">
                                              <span className="text-gray-500">
                                                Von:
                                              </span>
                                              <input
                                                type="text"
                                                placeholder="09:15"
                                                value={entry.von || ""}
                                                onChange={(e) =>
                                                  updateOtherWorkEntry(
                                                    idx,
                                                    eIdx,
                                                    "von",
                                                    e.target.value,
                                                  )
                                                }
                                                className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-mono"
                                              />
                                            </label>
                                            <label className="flex items-center gap-1">
                                              <span className="text-gray-500">
                                                Bis:
                                              </span>
                                              <input
                                                type="text"
                                                placeholder="09:45"
                                                value={entry.bis || ""}
                                                onChange={(e) =>
                                                  updateOtherWorkEntry(
                                                    idx,
                                                    eIdx,
                                                    "bis",
                                                    e.target.value,
                                                  )
                                                }
                                                className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-mono"
                                              />
                                            </label>
                                            <input
                                              type="text"
                                              placeholder="Notiz (optional)"
                                              value={entry.bemerkung || ""}
                                              onChange={(e) =>
                                                updateOtherWorkEntry(
                                                  idx,
                                                  eIdx,
                                                  "bemerkung",
                                                  e.target.value,
                                                )
                                              }
                                              className="w-44 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                                            />
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removeOtherWorkEntry(idx, eIdx)
                                              }
                                              className="text-rose-500 hover:text-rose-700 px-2 py-1 font-semibold"
                                            >
                                              Entfernen
                                            </button>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Warnings Legend & Weekly/Daily Summary Rows */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded border-2 border-rose-500 bg-rose-500/10 inline-block" />
                    <span>Personal fehlt (Nicht raten)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded border border-amber-500 bg-amber-500/10 inline-block" />
                    <span>Handschrift / Wert unsicher</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold text-blue-600">Wartezeit:</span>
                    <span>(Bis − Von) × Personal − anderw. Arbeit</span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    {isSchwalbe ? "Gesamt Wartezeit:" : "Wartezeit Summe:"}{" "}
                    <strong className="text-blue-600 dark:text-blue-400 font-mono">
                      {summaryStats.totalWartezeitFormatted}
                    </strong>
                  </div>
                  {isSchwalbe && (
                    <div>
                      Gesamt Personal Std. ohne Wartezeit:{" "}
                      <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                        {summaryStats.totalWorkHoursOhneWartezeitFormatted}
                      </strong>
                    </div>
                  )}
                  <div>
                    Container:{" "}
                    <strong className="text-gray-900 dark:text-white font-mono">
                      {draftRows.length}
                    </strong>
                  </div>
                </div>
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
                          {item.date
                            ? new Date(item.date).toLocaleDateString("de-DE")
                            : "—"}
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
                            onClick={() => openSavedListDetail(item.id, false)}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-xs inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ansehen</span>
                          </button>
                          <button
                            onClick={() => openSavedListDetail(item.id, true)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 dark:text-blue-400 font-semibold text-xs inline-flex items-center gap-1"
                            title="Gespeicherte Containerliste bearbeiten"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Bearbeiten</span>
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

      {/* ─── MODAL: INSPECT & EDIT SAVED LIST ──────────────────────────── */}
      {selectedSavedList && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span>
                    {isEditingModal
                      ? `Containerliste bearbeiten: ${modalEditTitle || selectedSavedList.title}`
                      : selectedSavedList.title}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-xs font-semibold">
                    {isEditingModal ? modalEditSite : selectedSavedList.site}
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Erfasst am{" "}
                  {new Date(selectedSavedList.createdAt).toLocaleString("de-DE")} •{" "}
                  {isEditingModal
                    ? modalEditRows.length
                    : selectedSavedList.rows?.length || 0}{" "}
                  Container
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!isEditingModal ? (
                  <>
                    <button
                      onClick={() => setIsEditingModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Bearbeiten</span>
                    </button>
                    <button
                      onClick={() => loadSavedListIntoMainEditor(selectedSavedList)}
                      className="px-3 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 dark:text-blue-400 text-xs font-semibold inline-flex items-center gap-1"
                      title="Im großen Haupteditor öffnen"
                    >
                      <span>Im Haupteditor öffnen</span>
                    </button>
                    <button
                      onClick={() =>
                        downloadExport(
                          selectedSavedList.id,
                          "xlsx",
                          selectedSavedList.site,
                        )
                      }
                      className="px-3 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={() =>
                        downloadExport(
                          selectedSavedList.id,
                          "pdf",
                          selectedSavedList.site,
                        )
                      }
                      className="px-3 py-1.5 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-700 dark:text-red-400 text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={addModalRow}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Zeile hinzufügen</span>
                    </button>
                    <button
                      onClick={handleSaveModalChanges}
                      disabled={isSavingModal}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
                    >
                      {isSavingModal ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span>Änderungen speichern</span>
                    </button>
                    <button
                      onClick={() => {
                        // Reset modal edits from selectedSavedList
                        setModalEditSite(selectedSavedList.site);
                        setModalEditTitle(selectedSavedList.title || "");
                        setModalEditDate(
                          selectedSavedList.date
                            ? new Date(selectedSavedList.date)
                                .toISOString()
                                .slice(0, 10)
                            : "",
                        );
                        setModalEditRows(
                          (selectedSavedList.rows || []).map((r) => ({
                            ...r,
                            anderweitigeArbeiten: r.anderweitigeArbeiten || [],
                          })),
                        );
                        setIsEditingModal(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold hover:bg-gray-200"
                    >
                      Abbrechen
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    setSelectedSavedList(null);
                    setIsEditingModal(false);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold hover:bg-gray-200"
                >
                  Schließen
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Metadata editor when in modal edit mode */}
              {isEditingModal && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                      Standort / Kunde (Vorlage)
                    </label>
                    <select
                      value={modalEditSite}
                      onChange={(e) => setModalEditSite(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-semibold text-gray-900 dark:text-white outline-none"
                    >
                      {SUPPORTED_SITES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                      Titel der Liste
                    </label>
                    <input
                      type="text"
                      value={modalEditTitle}
                      onChange={(e) => setModalEditTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-900 dark:text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                      Datum
                    </label>
                    <input
                      type="date"
                      value={modalEditDate}
                      onChange={(e) => setModalEditDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-900 dark:text-white outline-none"
                    />
                  </div>
                </div>
              )}

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
                      {isEditingModal && (
                        <>
                          <th className="py-2 px-2">Termin</th>
                          <th className="py-2 px-2">Ankunft</th>
                        </>
                      )}
                      <th className="py-2 px-2">Start</th>
                      <th className="py-2 px-2">Ende</th>
                      <th className="py-2 px-2">Dauer</th>
                      <th className="py-2 px-2">
                        {(isEditingModal ? modalEditSite : selectedSavedList.site) ===
                        "Schwalbe"
                          ? "Personal Anzahl"
                          : "Personal"}
                      </th>
                      <th className="py-2 px-2">
                        {(isEditingModal ? modalEditSite : selectedSavedList.site) ===
                        "Gant"
                          ? "Wartezeit"
                          : "Wartezeit Von–Bis"}
                      </th>
                      {isEditingModal && <th className="py-2 px-2">Anderw. Arbeit</th>}
                      <th className="py-2 px-2 font-bold text-blue-600">
                        Wartezeit Std.
                      </th>
                      {isEditingModal && <th className="py-2 px-2">Wickel</th>}
                      <th className="py-2 px-2">Bemerkung</th>
                      {isEditingModal && <th className="py-2 px-2 w-8"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {!isEditingModal
                      ? selectedSavedList.rows?.map((r, i) => (
                          <tr
                            key={r.rowOrder || i}
                            className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
                          >
                            <td className="py-2 px-2 font-mono text-gray-400">
                              {i + 1}
                            </td>
                            <td className="py-2 px-2">{r.date || "—"}</td>
                            <td className="py-2 px-2 font-mono font-bold text-gray-900 dark:text-white">
                              {r.containerNumber || "—"}
                            </td>
                            <td className="py-2 px-2 font-mono">{r.fuss || "—"}</td>
                            <td className="py-2 px-2">{r.artikel || "—"}</td>
                            <td className="py-2 px-2 font-mono">{r.kartons ?? "—"}</td>
                            <td className="py-2 px-2 font-mono">{r.start || "—"}</td>
                            <td className="py-2 px-2 font-mono">{r.ende || "—"}</td>
                            <td className="py-2 px-2 font-mono">
                              {computeDauerClock(r.start, r.ende)}
                            </td>
                            <td className="py-2 px-2 font-mono font-semibold">
                              {r.personal ?? "—"}
                            </td>
                            <td className="py-2 px-2 font-mono text-gray-500">
                              {r.wartezeitVon && r.wartezeitBis
                                ? `${r.wartezeitVon} bis ${r.wartezeitBis}`
                                : r.wartezeitVon || "—"}
                            </td>
                            <td className="py-2 px-2 font-mono font-bold text-blue-600 dark:text-blue-400">
                              {r.wartezeitStd ? `${r.wartezeitStd} Std.` : "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-500">
                              {r.bemerkung || "—"}
                            </td>
                          </tr>
                        ))
                      : modalEditRows.map((row, idx) => {
                          const waitingInfo = computeRowWaitingDetails(row);
                          const otherWorkCount =
                            row.anderweitigeArbeiten?.length || 0;
                          return (
                            <React.Fragment key={idx}>
                              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                                <td className="py-1.5 px-2 font-mono text-gray-400">
                                  {idx + 1}
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="text"
                                    value={row.date || ""}
                                    onChange={(e) =>
                                      updateModalRowField(idx, "date", e.target.value)
                                    }
                                    className="w-24 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="text"
                                    value={row.containerNumber || ""}
                                    onChange={(e) =>
                                      updateModalRowField(
                                        idx,
                                        "containerNumber",
                                        e.target.value,
                                      )
                                    }
                                    className="w-32 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono font-bold text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <select
                                    value={row.fuss || "40"}
                                    onChange={(e) =>
                                      updateModalRowField(idx, "fuss", e.target.value)
                                    }
                                    className="w-16 px-1 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono text-xs"
                                  >
                                    <option value="20">20</option>
                                    <option value="40">40</option>
                                    <option value="45">45</option>
                                  </select>
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="text"
                                    value={row.artikel || ""}
                                    onChange={(e) =>
                                      updateModalRowField(
                                        idx,
                                        "artikel",
                                        e.target.value,
                                      )
                                    }
                                    className="w-24 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="number"
                                    value={row.kartons ?? ""}
                                    onChange={(e) =>
                                      updateModalRowField(
                                        idx,
                                        "kartons",
                                        parseInt(e.target.value, 10) || 0,
                                      )
                                    }
                                    className="w-20 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono text-xs text-right"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="text"
                                    value={row.termin || ""}
                                    onChange={(e) =>
                                      updateModalRowField(
                                        idx,
                                        "termin",
                                        e.target.value,
                                      )
                                    }
                                    className="w-16 px-1.5 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="text"
                                    value={row.ankunft || ""}
                                    onChange={(e) =>
                                      updateModalRowField(
                                        idx,
                                        "ankunft",
                                        e.target.value,
                                      )
                                    }
                                    className="w-16 px-1.5 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="text"
                                    value={row.start || ""}
                                    onChange={(e) =>
                                      updateModalRowField(idx, "start", e.target.value)
                                    }
                                    className="w-16 px-1.5 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="text"
                                    value={row.ende || ""}
                                    onChange={(e) =>
                                      updateModalRowField(idx, "ende", e.target.value)
                                    }
                                    className="w-16 px-1.5 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-2 font-mono text-gray-500">
                                  {computeDauerClock(row.start, row.ende)}
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="number"
                                    min={1}
                                    max={30}
                                    value={row.personal ?? ""}
                                    onChange={(e) =>
                                      updateModalRowField(
                                        idx,
                                        "personal",
                                        parseInt(e.target.value, 10) || undefined,
                                      )
                                    }
                                    className="w-16 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-transparent font-mono font-bold text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={row.wartezeitVon || ""}
                                      placeholder="09:00"
                                      onChange={(e) =>
                                        updateModalRowField(
                                          idx,
                                          "wartezeitVon",
                                          e.target.value,
                                        )
                                      }
                                      className="w-14 px-1 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono text-xs"
                                    />
                                    <span className="text-[10px] text-gray-400">
                                      bis
                                    </span>
                                    <input
                                      type="text"
                                      value={row.wartezeitBis || ""}
                                      placeholder="09:50"
                                      onChange={(e) =>
                                        updateModalRowField(
                                          idx,
                                          "wartezeitBis",
                                          e.target.value,
                                        )
                                      }
                                      className="w-14 px-1 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent font-mono text-xs"
                                    />
                                  </div>
                                </td>
                                <td className="py-1.5 px-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setModalExpandedOtherWorkRow(
                                        modalExpandedOtherWorkRow === idx
                                          ? null
                                          : idx,
                                      )
                                    }
                                    className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                                      otherWorkCount > 0
                                        ? "bg-purple-500/10 border-purple-500/40 text-purple-700 dark:text-purple-300"
                                        : "border-gray-200 dark:border-gray-700 text-gray-500"
                                    }`}
                                  >
                                    {otherWorkCount > 0
                                      ? `${otherWorkCount} Abzug`
                                      : "+ Abzug"}
                                  </button>
                                </td>
                                <td className="py-1.5 px-2 font-mono font-bold text-blue-600 dark:text-blue-400">
                                  {waitingInfo.netHours > 0
                                    ? `${waitingInfo.formattedDecimal} Std.`
                                    : row.wartezeitStd
                                      ? `${row.wartezeitStd} Std.`
                                      : "0 Std."}
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="text"
                                    value={row.wickel || ""}
                                    onChange={(e) =>
                                      updateModalRowField(
                                        idx,
                                        "wickel",
                                        e.target.value,
                                      )
                                    }
                                    className="w-16 px-1.5 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <input
                                    type="text"
                                    value={row.bemerkung || ""}
                                    onChange={(e) =>
                                      updateModalRowField(
                                        idx,
                                        "bemerkung",
                                        e.target.value,
                                      )
                                    }
                                    className="w-28 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent text-xs"
                                  />
                                </td>
                                <td className="py-1.5 px-1 text-center">
                                  <button
                                    type="button"
                                    onClick={() => removeModalRow(idx)}
                                    className="text-gray-400 hover:text-rose-500 p-1"
                                    title="Zeile entfernen"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>

                              {modalExpandedOtherWorkRow === idx && (
                                <tr className="bg-purple-500/5 dark:bg-purple-950/20">
                                  <td colSpan={18} className="p-3">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-purple-800 dark:text-purple-300">
                                          Anderweitige Arbeit während der Wartezeit
                                          (Zeile {idx + 1}):
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => addModalOtherWorkEntry(idx)}
                                          className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 inline-flex items-center gap-1"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                          <span>Eintrag hinzufügen</span>
                                        </button>
                                      </div>
                                      {(row.anderweitigeArbeiten || []).map(
                                        (entry, eIdx) => (
                                          <div
                                            key={eIdx}
                                            className="flex flex-wrap items-center gap-2 text-xs"
                                          >
                                            <label className="flex items-center gap-1">
                                              <span>Personal:</span>
                                              <input
                                                type="number"
                                                min={1}
                                                value={entry.personal ?? ""}
                                                onChange={(e) =>
                                                  updateModalOtherWorkEntry(
                                                    idx,
                                                    eIdx,
                                                    "personal",
                                                    parseInt(e.target.value, 10) ||
                                                      0,
                                                  )
                                                }
                                                className="w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-mono"
                                              />
                                            </label>
                                            <label className="flex items-center gap-1">
                                              <span>Von:</span>
                                              <input
                                                type="text"
                                                value={entry.von || ""}
                                                onChange={(e) =>
                                                  updateModalOtherWorkEntry(
                                                    idx,
                                                    eIdx,
                                                    "von",
                                                    e.target.value,
                                                  )
                                                }
                                                className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-mono"
                                              />
                                            </label>
                                            <label className="flex items-center gap-1">
                                              <span>Bis:</span>
                                              <input
                                                type="text"
                                                value={entry.bis || ""}
                                                onChange={(e) =>
                                                  updateModalOtherWorkEntry(
                                                    idx,
                                                    eIdx,
                                                    "bis",
                                                    e.target.value,
                                                  )
                                                }
                                                className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 font-mono"
                                              />
                                            </label>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removeModalOtherWorkEntry(idx, eIdx)
                                              }
                                              className="text-rose-500 hover:text-rose-700 px-2 py-1 font-semibold"
                                            >
                                              Entfernen
                                            </button>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                  </tbody>
                </table>
              </div>

              {/* Modal Summary Footer */}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-4">
                <div>
                  Standort-Vorlage:{" "}
                  <strong className="text-gray-900 dark:text-white">
                    {isEditingModal ? modalEditSite : selectedSavedList.site}
                  </strong>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    {(isEditingModal ? modalEditSite : selectedSavedList.site) ===
                    "Schwalbe"
                      ? "Gesamt Wartezeit:"
                      : "Wartezeit Summe:"}{" "}
                    <strong className="text-blue-600 dark:text-blue-400 font-mono">
                      {modalSummaryStats.totalWartezeitFormatted}
                    </strong>
                  </div>
                  {(isEditingModal ? modalEditSite : selectedSavedList.site) ===
                    "Schwalbe" && (
                    <div>
                      Gesamt Personal Std. ohne Wartezeit:{" "}
                      <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                        {modalSummaryStats.totalWorkHoursOhneWartezeitFormatted}
                      </strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
