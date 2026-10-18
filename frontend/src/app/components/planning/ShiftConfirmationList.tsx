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

  // Filters
  const [selectedDate, setSelectedDate] = useState<string>(
    initialDate || new Date().toISOString().split("T")[0]
  );
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("ALL");

  // Data
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [records, setRecords] = useState<ConfirmationRecord[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);

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
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        const queryParams = new URLSearchParams({
          date: selectedDate,
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
          headers: { Authorization: `Bearer ${token}` },
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
        console.error("Error loading confirmations:", err);
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

  // Quick date pickers
  const setDateRelative = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col">
      {/* Header Bar */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-2xl shadow-inner">
            📋
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight">Schicht-Rückmeldungen & Anwesenheitsliste</h2>
              <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                WhatsApp Live Sync
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Wer kommt (🟢), wer ist krank / abwesend (🔴) und Rückmeldungsgrund in der letzten Spalte.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchConfirmations(true)}
            disabled={refreshing}
            className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
            <span>Aktualisieren</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
              title="Schließen"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
        <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Gesamt Eingeteilt</span>
            <span className="text-base">👥</span>
          </div>
          <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{stats.total}</div>
        </div>

        <div className="bg-emerald-50/70 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Ich bin da (🟢)
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-300">{stats.confirmedCount}</div>
        </div>

        <div className="bg-red-50/70 dark:bg-red-950/20 p-3 rounded-xl border border-red-200 dark:border-red-800/40 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-800 dark:text-red-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Ich bin krank (🔴)
            </span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-1 text-2xl font-black text-red-700 dark:text-red-300">{stats.sickCount}</div>
        </div>

        <div className="bg-amber-50/70 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200 dark:border-amber-800/40 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Ausstehend (🟡)
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-300">{stats.pendingCount}</div>
        </div>

        <div className="bg-blue-50/70 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-200 dark:border-blue-800/40 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Custom Nachricht
            </span>
            <MessageSquare className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-1 text-2xl font-black text-blue-700 dark:text-blue-300">{stats.customCount}</div>
        </div>
      </div>

      {/* Control & Filter Strip */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Date Selector & Shortcuts */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-xs font-bold text-slate-800 dark:text-white focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDateRelative(0)}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Heute
            </button>
            <button
              type="button"
              onClick={() => setDateRelative(1)}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Morgen
            </button>
          </div>
        </div>

        {/* Status & Warehouse Filter & Search */}
        <div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
          {/* Warehouse Dropdown */}
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white"
          >
            <option value="ALL">🏢 Alle Lager</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Status Tabs */}
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
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
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                  statusFilter === tab.id
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Name, Grund..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
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
          <div className="py-20 text-center flex flex-col items-center justify-center p-6">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-3xl mb-3">
              📭
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Keine Schichteinteilungen für diesen Tag gefunden
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Für das ausgewählte Datum ({selectedDate}) liegen keine aktiven Schichtzuweisungen oder passende Filterergebnisse vor.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-4 w-12 text-center">Icon</th>
                <th className="py-3 px-4">Mitarbeiter</th>
                <th className="py-3 px-4">Datum & Schicht</th>
                <th className="py-3 px-4">Einsatzort & Halle</th>
                <th className="py-3 px-4">Treffpunkt & Zeit</th>
                <th className="py-3 px-4">Kanal / Zeit</th>
                <th className="py-3 px-4 font-black text-slate-900 dark:text-white bg-slate-200/50 dark:bg-slate-700/50 border-l border-slate-300 dark:border-slate-700">
                  Grund / Rückmeldung (Letzte Spalte)
                </th>
                <th className="py-3 px-4 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {records.map((rec) => {
                const isConfirmed = rec.status === "CONFIRMED";
                const isSick = rec.status === "SICK";
                const isCustom = rec.status === "CUSTOM_RESPONSE";
                const isPending = rec.status === "PENDING";

                return (
                  <tr
                    key={`${rec.planId}_${rec.employeeId}`}
                    className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                      isSick ? "bg-red-50/30 dark:bg-red-950/10" : isConfirmed ? "bg-emerald-50/20 dark:bg-emerald-950/10" : ""
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
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-xs shrink-0 overflow-hidden">
                          {rec.employeePhoto ? (
                            <img src={rec.employeePhoto} alt={rec.employeeName} className="w-full h-full object-cover" />
                          ) : (
                            rec.employeeName.substring(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900 dark:text-white leading-tight">
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
                      <div className="font-bold text-slate-900 dark:text-slate-100">{rec.formattedDate}</div>
                      <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{rec.shiftTime}</span>
                      </div>
                    </td>

                    {/* 4. Warehouse & Hall Column */}
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{rec.warehouseName}</span>
                      </div>
                      <div className="mt-1">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md border text-slate-800 dark:text-slate-200"
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
                      <div className="text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>{rec.treffpunkt}</span>
                      </div>
                      <div className="text-[11px] font-mono font-bold text-amber-900 dark:text-amber-400 mt-0.5">
                        {rec.treffpunktTime && rec.treffpunktTime !== "-" ? `Treff: ${rec.treffpunktTime} Uhr` : "Keine Treffzeit"}
                      </div>
                    </td>

                    {/* 6. Channel / Timestamp */}
                    <td className="py-3 px-4">
                      {rec.respondedAt ? (
                        <div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
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
                    <td className="py-3 px-4 bg-slate-50/60 dark:bg-slate-800/40 border-l border-slate-200 dark:border-slate-700">
                      {isSick ? (
                        <div className="p-2 bg-red-100/90 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 rounded-lg text-xs font-bold flex items-start gap-1.5 shadow-2xs">
                          <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-extrabold text-red-950 dark:text-red-100">
                              {rec.reason || "Krank gemeldet"}
                            </div>
                            <div className="text-[10px] text-red-700 dark:text-red-300 font-normal">
                              Einsatz entfällt • Im Abwesenheitsregister erfasst
                            </div>
                          </div>
                        </div>
                      ) : isConfirmed ? (
                        <div className="p-2 bg-emerald-100/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{rec.reason || "Schicht zugesagt („Ich bin da“)"}</span>
                        </div>
                      ) : isCustom ? (
                        <div className="p-2 bg-blue-100/80 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 text-blue-950 dark:text-blue-200 rounded-lg text-xs flex items-start gap-1.5 shadow-2xs">
                          <MessageSquare className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-extrabold text-blue-900 dark:text-blue-200">Mitarbeiter-Nachricht:</div>
                            <div className="italic mt-0.5 text-blue-950 dark:text-white">„{rec.reason}“</div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-lg text-xs italic flex items-center gap-1.5">
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
                          className="p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition"
                          title="Status manuell anpassen"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* WhatsApp Send Button */}
                        <button
                          type="button"
                          disabled={sendingWaId === `${rec.planId}_${rec.employeeId}`}
                          onClick={() => handleResendWhatsApp(rec)}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs disabled:opacity-50"
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
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                          title="In WhatsApp Web öffnen"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Status manuell anpassen</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <div className="font-extrabold text-slate-900 dark:text-white">{editingRecord.employeeName}</div>
                <div className="text-slate-500">
                  {editingRecord.warehouseName} ({editingRecord.hallName}) • {editingRecord.formattedDate}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Neuer Schicht-Status:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditStatus("CONFIRMED");
                      setEditReason("Zugesagt („Ich bin da“)");
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      editStatus === "CONFIRMED"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
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
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      editStatus === "SICK"
                        ? "bg-red-600 text-white border-red-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
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
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      editStatus === "CUSTOM_RESPONSE"
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
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
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      editStatus === "PENDING"
                        ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <span>🟡 Offen (Reset)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Grund / Bemerkung (Erscheint in der letzten Spalte):
                </label>
                <textarea
                  rows={3}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="z. B. Krankmeldung telefonisch, Arzttermin, oder Verspätung..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={handleSaveManualStatus}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
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
