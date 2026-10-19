"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Search,
  Filter,
  RefreshCw,
  Send,
  Calendar,
  Building2,
  Warehouse as WHIcon,
  MapPin,
  User,
  Phone,
  AlertTriangle,
  ChevronRight,
  Edit3,
  ExternalLink,
  Check,
  X,
  UserCheck,
  UserX,
  HelpCircle,
  Shield,
} from "lucide-react";
import { API_URL } from "../../../config/api";
import { useDialog } from "../DialogProvider";

export interface ConfirmationRecord {
  planId: string;
  employeeId: string;
  employeeName: string;
  employeePhone: string;
  employeePhoto?: string | null;
  date: string;
  formattedDate: string;
  shiftTime: string;
  warehouseId?: string | null;
  warehouseName: string;
  hallId?: string | null;
  hallName: string;
  hallColor?: string | null;
  treffpunkt: string;
  treffpunktTime: string;
  status: "CONFIRMED" | "SICK" | "CUSTOM_RESPONSE" | "PENDING";
  reason?: string | null;
  respondedAt?: string | null;
  responseChannel?: string | null;
}

interface ShiftConfirmationListProps {
  initialDate?: string;
  onClose?: () => void;
}

export default function ShiftConfirmationList({
  initialDate,
  onClose,
}: ShiftConfirmationListProps) {
  const { alert: showAlert } = useDialog();

  // Filters - use local date formatting to prevent timezone shift
  const [selectedDate, setSelectedDate] = useState<string>(
    () => initialDate || new Date().toLocaleDateString("en-CA")
  );
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("ALL");

  // Keep selectedDate in sync whenever initialDate prop updates
  useEffect(() => {
    if (initialDate && initialDate.trim()) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  // Data
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [records, setRecords] = useState<ConfirmationRecord[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);

  // Webhook Help Info Banner Visibility
  const [showWebhookGuide, setShowWebhookGuide] = useState<boolean>(false);
  const [autoSync, setAutoSync] = useState<boolean>(true);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    confirmedCount: 0,
    sickCount: 0,
    pendingCount: 0,
    customCount: 0,
  });

  // Modal for manual override
  const [editingRecord, setEditingRecord] = useState<ConfirmationRecord | null>(null);
  const [editStatus, setEditStatus] = useState<"CONFIRMED" | "SICK" | "CUSTOM_RESPONSE" | "PENDING">("CONFIRMED");
  const [editReason, setEditReason] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Sending state per employee
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);
  const [simulatingPhone, setSimulatingPhone] = useState<string | null>(null);

  // Fetch warehouses
  useEffect(() => {
    const fetchWarehouses = async () => {
      const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/warehouse`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setWarehouses(data);
        }
      } catch (err) {}
    };
    fetchWarehouses();
  }, []);

  // Fetch confirmations
  const fetchConfirmations = useCallback(
    async (isManualRefresh = false, isBackgroundPoll = false) => {
      if (isManualRefresh) setRefreshing(true);
      else if (!isBackgroundPoll) setLoading(true);

      const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        const queryParams = new URLSearchParams({
          date: selectedDate,
          _t: Date.now().toString(),
        });
        if (selectedWarehouseId !== "ALL") {
          queryParams.append("warehouseId", selectedWarehouseId);
        }
        if (statusFilter !== "ALL") {
          queryParams.append("status", statusFilter);
        }
        if (searchTerm.trim()) {
          queryParams.append("search", searchTerm.trim());
        }

        const res = await fetch(`${API_URL}/planning/confirmations?${queryParams.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache",
          },
          cache: "no-store",
        });

        if (res.ok) {
          const json = await res.json();
          setRecords(json.data || []);
          setStats({
            total: json.total || 0,
            confirmedCount: json.confirmedCount || 0,
            sickCount: json.sickCount || 0,
            pendingCount: json.pendingCount || 0,
            customCount: json.customCount || 0,
          });
        }
      } catch (err) {
        if (!isBackgroundPoll) {
          console.error("Error loading confirmations:", err);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedDate, selectedWarehouseId, statusFilter, searchTerm]
  );

  useEffect(() => {
    fetchConfirmations();
  }, [fetchConfirmations]);

  // Real-time WhatsApp Live Sync: poll every 4 seconds so responses appear instantly without clicking
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      fetchConfirmations(false, true);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoSync, fetchConfirmations]);

  // Handle manual status update
  const handleSaveManualStatus = async () => {
    if (!editingRecord) return;
    const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (!token) return;

    setSavingEdit(true);
    try {
      const res = await fetch(
        `${API_URL}/planning/confirmations/${editingRecord.planId}/employee/${editingRecord.employeeId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: editStatus,
            reason: editReason.trim() || undefined,
          }),
        }
      );

      if (res.ok) {
        showAlert({
          title: "Status aktualisiert",
          message: `Der Rückmeldungsstatus für ${editingRecord.employeeName} wurde auf "${editStatus}" gesetzt.`,
          type: "success",
        });
        setEditingRecord(null);
        fetchConfirmations(true);
      } else {
        const errData = await res.json();
        showAlert({
          title: "Fehler",
          message: errData.message || "Status konnte nicht geändert werden.",
          type: "error",
        });
      }
    } catch (err: any) {
      showAlert({
        title: "Netzwerkfehler",
        message: err.message,
        type: "error",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // Resend WhatsApp to single employee
  const handleResendWhatsApp = async (rec: ConfirmationRecord) => {
    const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (!token) return;

    const opKey = `${rec.planId}_${rec.employeeId}`;
    setSendingWaId(opKey);

    try {
      const res = await fetch(
        `${API_URL}/planning/confirmations/${rec.planId}/employee/${rec.employeeId}/send-whatsapp`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json();
      if (res.ok && data.success) {
        showAlert({
          title: "WhatsApp versendet",
          message: `Schichtbenachrichtigung mit den 3 Optionen wurde erfolgreich an ${rec.employeeName} (${rec.employeePhone}) gesendet.`,
          type: "success",
        });
        fetchConfirmations(true);
      } else {
        showAlert({
          title: "WhatsApp Hinweis",
          message: data.error || (data.waLink ? "Kein Meta API Key aktiv. Fallback Link wurde bereitgestellt." : "Nachricht konnte nicht zugestellt werden."),
          type: "info",
        });
        if (data.waLink) {
          window.open(data.waLink, "_blank");
        }
      }
    } catch (err: any) {
      showAlert({
        title: "Fehler beim WhatsApp-Versand",
        message: err.message,
        type: "error",
      });
    } finally {
      setSendingWaId(null);
    }
  };

  // Open direct wa.me fallback link
  const openDirectWhatsApp = (rec: ConfirmationRecord) => {
    const tpStr = rec.treffpunktTime && rec.treffpunktTime !== "-"
      ? `${rec.treffpunkt} um ${rec.treffpunktTime} Uhr`
      : rec.treffpunkt;
    const msg = `Hallo ${rec.employeeName}\nIhr Einsatzort : ${rec.warehouseName}\nHalle : ${rec.hallName}\nTreffpunkt & Treffzeit: ${tpStr}\n\nBitte geben Sie eine Rückmeldung:\n1. Ich bin da\n2. Ich bin krank\n3. Nachricht`;
    const cleanPhone = (rec.employeePhone || "").replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("0") ? "49" + cleanPhone.substring(1) : cleanPhone;
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // Quick date pickers using local calendar dates
  const setDateRelative = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setSelectedDate(d.toLocaleDateString("en-CA"));
  };

  // Simulate an incoming WhatsApp answer from an employee
  const handleSimulateWebhook = async (phone: string, simulatedMessage: string) => {
    if (!phone) {
      showAlert({
        title: "Fehlende Rufnummer",
        message: "Dieser Mitarbeiter hat keine Telefonnummer hinterlegt.",
        type: "error",
      });
      return;
    }

    setSimulatingPhone(phone);
    const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/messaging/webhook/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone, message: simulatedMessage }),
      });
      const data = await res.json();
      if (res.ok) {
        showAlert({
          title: "WhatsApp Live-Sync Erfolg",
          message: data.message || `Antwort "${simulatedMessage}" erfolgreich simuliert und erfasst!`,
          type: "success",
        });
        fetchConfirmations(true);
      } else {
        showAlert({
          title: "Simulation fehlgeschlagen",
          message: data.message || "Fehler beim Verarbeiten der Antwort.",
          type: "error",
        });
      }
    } catch (err: any) {
      showAlert({
        title: "Fehler beim Aufruf",
        message: err.message,
        type: "error",
      });
    } finally {
      setSimulatingPhone(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
      {/* Header Bar */}
      <div className="p-5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-2xl shadow-2xs">
            📋
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Schicht-Rückmeldungen &amp; Anwesenheitsliste
              </h2>
              <button
                type="button"
                onClick={() => setAutoSync(!autoSync)}
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 transition cursor-pointer ${
                  autoSync
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                }`}
                title={
                  autoSync
                    ? "Live-Sync aktiv: Prüft alle 4 Sekunden automatisch auf WhatsApp-Antworten. Klicken zum Pausieren."
                    : "Live-Sync pausiert. Klicken zum Aktivieren."
                }
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    autoSync ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                  }`}
                />
                <span>{autoSync ? "Live-Sync aktiv (4s)" : "Sync pausiert"}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Wer kommt (🟢), wer ist krank / abwesend (🔴) und Rückmeldungsgrund in der letzten Spalte.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowWebhookGuide(!showWebhookGuide)}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Meta Webhook Konfigurations-Anleitung"
          >
            <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
            <span>Webhook Info</span>
          </button>
          <button
            type="button"
            onClick={() => fetchConfirmations(true)}
            disabled={refreshing}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs disabled:opacity-50"
            title="Aktualisieren"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-600 ${refreshing ? "animate-spin text-emerald-600" : ""}`}
            />
            <span>Aktualisieren</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
              title="Schließen"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable Meta Webhook Setup Guide */}
      {showWebhookGuide && (
        <div className="bg-gradient-to-r from-indigo-50/70 via-blue-50/50 to-slate-50 text-slate-800 p-5 border-b border-indigo-100 shadow-inner animate-fade-in text-xs space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-sm text-indigo-900">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>Meta WhatsApp Cloud API — Webhook Live-Sync Konfiguration</span>
              </div>
              <p className="text-slate-600 leading-relaxed max-w-3xl">
                Damit Antworten von Mitarbeitern (z. B. 1, 2, 3 oder individuelle Texte wie „5“) in Echtzeit hier in der Anwesenheitsliste ankommen, muss der Webhook in Meta für Entwickler abonniert sein:
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowWebhookGuide(false)}
              className="text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="bg-white p-3.5 rounded-xl border border-indigo-200/80 font-mono text-[11px] space-y-1.5 shadow-2xs">
              <div className="text-slate-500 font-bold uppercase text-[10px]">Callback URL (in Meta eintragen):</div>
              <div className="text-emerald-700 select-all font-semibold">https://warehause-test.onrender.com/messaging/webhook</div>
              <div className="text-slate-500 font-bold uppercase text-[10px] mt-2">Verifizierungs-Token (Verify Token):</div>
              <div className="text-amber-800 select-all font-semibold">logiflow_whatsapp_verify_2026</div>
            </div>

            <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1.5 shadow-2xs">
              <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Wichtigster Schritt: Webhook-Feld „messages“ abonnieren</span>
              </div>
              <p className="leading-relaxed text-[11px] text-amber-800">
                In der Meta Console unter <strong>WhatsApp &gt; Konfiguration &gt; Webhook-Felder</strong> auf <strong>„Verwalten“</strong> klicken und die Checkbox bei <strong>„messages“</strong> aktivieren! Ohne dieses Feld leitet Meta keine eingehenden Antworten weiter.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-slate-50/60 border-b border-slate-200">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Gesamt Eingeteilt</span>
            <span className="text-base">👥</span>
          </div>
          <div className="mt-1 text-2xl font-black text-slate-900">{stats.total}</div>
        </div>

        <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 text-emerald-900 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Ich bin da (🟢)
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-700">{stats.confirmedCount}</div>
        </div>

        <div className="bg-red-50/70 p-3.5 rounded-xl border border-red-200 text-red-900 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Ich bin krank (🔴)
            </span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-1 text-2xl font-black text-red-700">{stats.sickCount}</div>
        </div>

        <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 text-amber-900 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Ausstehend (🟡)
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-1 text-2xl font-black text-amber-700">{stats.pendingCount}</div>
        </div>

        <div className="bg-blue-50/70 p-3.5 rounded-xl border border-blue-200 text-blue-900 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Custom Nachricht
            </span>
            <MessageSquare className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-1 text-2xl font-black text-blue-700">{stats.customCount}</div>
        </div>
      </div>

      {/* Control & Filter Strip */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        {/* Date Selector & Shortcuts */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-xs font-bold text-slate-800 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDateRelative(0)}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition shadow-2xs cursor-pointer"
            >
              Heute
            </button>
            <button
              type="button"
              onClick={() => setDateRelative(1)}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition shadow-2xs cursor-pointer"
            >
              Morgen
            </button>
          </div>
        </div>

        {/* Status & Warehouse Filter & Search */}
        <div className="flex items-center gap-2.5 flex-wrap flex-1 justify-end">
          {/* Warehouse Dropdown */}
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500 transition shadow-2xs"
          >
            <option value="ALL">🏢 Alle Lager</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Status Tabs */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
            {[
              { id: "ALL", label: "Alle" },
              { id: "CONFIRMED", label: "🟢 Da" },
              { id: "SICK", label: "🔴 Krank" },
              { id: "PENDING", label: "🟡 Offen" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  statusFilter === tab.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Name, Grund..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto flex-1">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-500">Lade Rückmeldungen für {selectedDate}...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center p-6 bg-white">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-3xl mb-3 shadow-2xs">
              📭
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              Keine Schichteinteilungen für diesen Tag gefunden
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Für das ausgewählte Datum ({selectedDate}) liegen keine aktiven Schichtzuweisungen oder passende Filterergebnisse vor.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/90 text-slate-600 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-4 w-12 text-center">Status</th>
                <th className="py-3 px-4">Mitarbeiter</th>
                <th className="py-3 px-4">Datum &amp; Schicht</th>
                <th className="py-3 px-4">Einsatzort &amp; Halle</th>
                <th className="py-3 px-4">Treffpunkt &amp; Zeit</th>
                <th className="py-3 px-4">Kanal / Zeit</th>
                <th className="py-3 px-4 font-black text-slate-900 bg-slate-100/70 border-l border-slate-200">
                  Grund / Rückmeldung (Letzte Spalte)
                </th>
                <th className="py-3 px-4 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {records.map((rec) => {
                const isConfirmed = rec.status === "CONFIRMED";
                const isSick = rec.status === "SICK";
                const isCustom = rec.status === "CUSTOM_RESPONSE";
                const isPending = rec.status === "PENDING";

                return (
                  <tr
                    key={`${rec.planId}_${rec.employeeId}`}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      isSick ? "bg-red-50/30" : isConfirmed ? "bg-emerald-50/20" : ""
                    }`}
                  >
                    {/* 1. Status Icon Column */}
                    <td className="py-3 px-4 text-center">
                      {isConfirmed && (
                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 shadow-2xs" title="Bestätigt (Ich bin da)">
                          <span className="text-base leading-none">🟢</span>
                        </div>
                      )}
                      {isSick && (
                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 border border-red-300 shadow-2xs" title="Krank / Abwesend (Ich bin krank)">
                          <span className="text-base leading-none">🔴</span>
                        </div>
                      )}
                      {isCustom && (
                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 border border-blue-300 shadow-2xs" title="Eigene Rückmeldung">
                          <span className="text-base leading-none">💬</span>
                        </div>
                      )}
                      {isPending && (
                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 border border-amber-300 shadow-2xs" title="Ausstehend / Noch keine Rückmeldung">
                          <span className="text-base leading-none">🟡</span>
                        </div>
                      )}
                    </td>

                    {/* 2. Employee Column */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0 overflow-hidden">
                          {rec.employeePhoto ? (
                            <img src={rec.employeePhoto} alt={rec.employeeName} className="w-full h-full object-cover" />
                          ) : (
                            rec.employeeName.substring(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900 leading-tight">
                            {rec.employeeName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{rec.employeePhone || "Keine Nummer"}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 3. Date & Shift Column */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{rec.formattedDate}</div>
                      <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{rec.shiftTime}</span>
                      </div>
                    </td>

                    {/* 4. Warehouse & Hall Column */}
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{rec.warehouseName}</span>
                      </div>
                      <div className="mt-1">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md border text-slate-800"
                          style={{
                            borderColor: rec.hallColor || "#cbd5e1",
                            backgroundColor: (rec.hallColor || "#64748b") + "15",
                          }}
                        >
                          {rec.hallName}
                        </span>
                      </div>
                    </td>

                    {/* 5. Treffpunkt & Treffzeit Column */}
                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-semibold flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>{rec.treffpunkt}</span>
                      </div>
                      <div className="text-[11px] font-mono font-bold text-amber-800 mt-0.5">
                        {rec.treffpunktTime && rec.treffpunktTime !== "-" ? `Treff: ${rec.treffpunktTime} Uhr` : "Keine Treffzeit"}
                      </div>
                    </td>

                    {/* 6. Channel / Timestamp */}
                    <td className="py-3 px-4">
                      {rec.respondedAt ? (
                        <div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                            {rec.responseChannel === "WHATSAPP_BUTTON"
                              ? "💬 WhatsApp Button"
                              : rec.responseChannel === "WHATSAPP_TEXT"
                              ? "💬 WhatsApp Text"
                              : "👤 Manuell"}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1 font-mono">
                            {new Date(rec.respondedAt).toLocaleTimeString("de-DE", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            Uhr
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Noch ausstehend</span>
                      )}
                    </td>

                    {/* 7. REASON / FEEDBACK (LETZTE SPALTE) */}
                    <td className="py-3 px-4 bg-slate-50/50 border-l border-slate-200">
                      {isSick ? (
                        <div className="p-2.5 bg-red-50 border border-red-200 text-red-900 rounded-xl text-xs font-bold flex items-start gap-2 shadow-2xs">
                          <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-extrabold text-red-950">
                              {rec.reason || "Krank gemeldet"}
                            </div>
                            <div className="text-[10px] text-red-700 font-normal mt-0.5">
                              Einsatz entfällt • Im Abwesenheitsregister erfasst
                            </div>
                          </div>
                        </div>
                      ) : isConfirmed ? (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{rec.reason || "Schicht zugesagt („Ich bin da“)"}</span>
                        </div>
                      ) : isCustom ? (
                        <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs flex items-start gap-2 shadow-2xs">
                          <MessageSquare className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-extrabold text-blue-900">Mitarbeiter-Nachricht:</div>
                            <div className="italic mt-0.5 text-blue-950 font-medium">„{rec.reason}“</div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-xl text-xs italic flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>Wartet auf Rückmeldung des Mitarbeiters</span>
                        </div>
                      )}
                    </td>

                    {/* 8. Action Buttons Column */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Status Edit Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRecord(rec);
                            setEditStatus(rec.status);
                            setEditReason(rec.reason || "");
                          }}
                          className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition cursor-pointer"
                          title="Status manuell anpassen"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* WhatsApp Send Button */}
                        <button
                          type="button"
                          disabled={sendingWaId === `${rec.planId}_${rec.employeeId}`}
                          onClick={() => handleResendWhatsApp(rec)}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs disabled:opacity-50 cursor-pointer"
                          title="WhatsApp Benachrichtigung mit 3 Optionen senden"
                        >
                          {sendingWaId === `${rec.planId}_${rec.employeeId}` ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>WhatsApp</span>
                        </button>

                        {/* wa.me direct open fallback */}
                        <button
                          type="button"
                          onClick={() => openDirectWhatsApp(rec)}
                          className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 rounded-xl transition cursor-pointer"
                          title="In WhatsApp Web öffnen"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        {/* Simulate reply for test / verification */}
                        <div className="relative group">
                          <button
                            type="button"
                            disabled={simulatingPhone === rec.employeePhone}
                            className="px-2 py-1.5 bg-white hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-xl text-[11px] font-bold border border-slate-200 transition flex items-center gap-1 cursor-pointer shadow-2xs disabled:opacity-50"
                            title="WhatsApp-Antwort für diesen Mitarbeiter testen/simulieren"
                          >
                            {simulatingPhone === rec.employeePhone ? (
                              <div className="w-3 h-3 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" />
                            ) : (
                              <span>⚡ Test-Antwort</span>
                            )}
                          </button>
                          <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-30 min-w-[160px]">
                            <button
                              type="button"
                              onClick={() => handleSimulateWebhook(rec.employeePhone, "1")}
                              className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>🟢 1 (Ich bin da)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSimulateWebhook(rec.employeePhone, "2")}
                              className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>🔴 2 (Krank)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSimulateWebhook(rec.employeePhone, "5")}
                              className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>💬 5 (Custom Text)</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual Status Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base text-slate-900">Status manuell anpassen</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div className="font-extrabold text-slate-900">{editingRecord.employeeName}</div>
                <div className="text-slate-500 mt-0.5">
                  {editingRecord.warehouseName} ({editingRecord.hallName}) • {editingRecord.formattedDate}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Neuer Schicht-Status:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditStatus("CONFIRMED");
                      setEditReason("Zugesagt („Ich bin da“)");
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      editStatus === "CONFIRMED"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>🟢 Ich bin da</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditStatus("SICK");
                      setEditReason("Krankmeldung („Ich bin krank“)");
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      editStatus === "SICK"
                        ? "bg-red-600 text-white border-red-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>🔴 Ich bin krank</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditStatus("CUSTOM_RESPONSE");
                      setEditReason("Individuelle Rückmeldung");
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      editStatus === "CUSTOM_RESPONSE"
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>💬 Custom Nachricht</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditStatus("PENDING");
                      setEditReason("");
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      editStatus === "PENDING"
                        ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>🟡 Offen (Reset)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Grund / Bemerkung (Erscheint in der letzten Spalte):
                </label>
                <textarea
                  rows={3}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="z. B. Krankmeldung telefonisch, Arzttermin, oder Verspätung..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={handleSaveManualStatus}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? "Speichert..." : "Status speichern"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
