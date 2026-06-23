"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Calendar,
  Warehouse as WHIcon,
  UserCheck,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  User,
  Printer,
  FileText,
  FileSpreadsheet,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Coffee,
  MapPin,
  X,
  PlusCircle,
} from "lucide-react";
import { API_URL } from "../../../config/api";

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhone: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number | null;
  breakMinutes: number;
  source: string;
  date: string;
  timesheetId: string | null;
  warehouseId: string;
  warehouseName: string;
  hallId: string;
  hallName: string;
}

interface WarehouseData {
  id: string;
  name: string;
  halls?: HallData[];
}

interface HallData {
  id: string;
  name: string;
  warehouseId: string;
}

interface EmployeeData {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export default function AttendancePage() {
  const router = useRouter();

  // Framework states
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [halls, setHalls] = useState<HallData[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);

  // Filter Mode
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("weekly");

  // Filter Values
  const [filterDate, setFilterDate] = useState("");
  const [filterWeek, setFilterWeek] = useState(25);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterEmployeeId, setFilterEmployeeId] = useState("ALL");

  // Selection states
  const [selectedCell, setSelectedCell] = useState<{ employeeId: string; date: string } | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  // Edit Panel states
  const [editStartTime, setEditStartTime] = useState("08:00");
  const [editEndTime, setEditEndTime] = useState("16:30");
  const [editBreakMinutes, setEditBreakMinutes] = useState(30);
  const [editTotalHours, setEditTotalHours] = useState(8);
  const [editWarehouseId, setEditWarehouseId] = useState("");
  const [editHallId, setEditHallId] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [downloadingTs, setDownloadingTs] = useState<{ id: string; fmt: string } | null>(null);

  const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}` };
  };

  // ─── UTILITIES ─────────────────────────────────────────────────────────────

  // ISO Weeks helper (Monday - Sunday Dates)
  const daysOfWeekList = useMemo(() => {
    const jan1 = new Date(Date.UTC(filterYear, 0, 1));
    const day = jan1.getUTCDay();
    const diff = day <= 4 ? 1 - day : 8 - day;
    const firstMonday = new Date(jan1);
    firstMonday.setUTCDate(jan1.getUTCDate() + diff);

    const start = new Date(firstMonday);
    start.setUTCDate(firstMonday.getUTCDate() + (filterWeek - 1) * 7);

    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      days.push(d.toISOString().split("T")[0]);
    }
    return days;
  }, [filterWeek, filterYear]);

  // Weeks of Month helper
  const weeksOfMonthList = useMemo(() => {
    const firstDay = new Date(Date.UTC(filterYear, filterMonth - 1, 1));
    const lastDay = new Date(Date.UTC(filterYear, filterMonth, 0));

    const getWeekNumber = (date: Date) => {
      const d = new Date(date);
      const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const diff = (d.getTime() - startOfYear.getTime()) / 86400000;
      return Math.ceil((diff + startOfYear.getUTCDay() + 1) / 7);
    };

    const startWeek = getWeekNumber(firstDay);
    const endWeek = getWeekNumber(lastDay);

    const weeks: number[] = [];
    for (let w = startWeek; w <= endWeek; w++) {
      weeks.push(w);
    }
    return weeks;
  }, [filterMonth, filterYear]);

  // Format Helper
  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  };

  const getGermanWeekdayLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekdaysDe = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    return weekdaysDe[d.getUTCDay()];
  };

  // ─── DATA LOADING ──────────────────────────────────────────────────────────

  const loadMetadata = async () => {
    try {
      const headers = getAuthHeaders();

      // Warehouses
      const whRes = await fetch(`${API_URL}/warehouses`, { headers });
      const whJson = whRes.ok ? await whRes.json() : null;
      const whData = whJson && Array.isArray(whJson.data) ? whJson.data : (Array.isArray(whJson) ? whJson : []);
      setWarehouses(whData);
      if (whData.length > 0) setEditWarehouseId(whData[0].id);

      // Halls
      const hallRes = await fetch(`${API_URL}/halls`, { headers });
      const hallJson = hallRes.ok ? await hallRes.json() : null;
      const hallData = hallJson && Array.isArray(hallJson.data) ? hallJson.data : (Array.isArray(hallJson) ? hallJson : []);
      setHalls(hallData);
      if (hallData.length > 0) setEditHallId(hallData[0].id);

      // Employees
      const empRes = await fetch(`${API_URL}/employees`, { headers });
      const empJson = empRes.ok ? await empRes.json() : null;
      const empData = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
      const nonAdmin = empData.filter((u: any) => u.role !== "ADMIN");
      setEmployees(nonAdmin);
    } catch (err) {
      console.error("Failed to load metadata", err);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const params = new URLSearchParams({
        timeframe,
        year: filterYear.toString(),
      });

      if (timeframe === "daily") {
        params.set("date", filterDate);
      } else if (timeframe === "weekly") {
        params.set("week", filterWeek.toString());
      } else if (timeframe === "monthly") {
        params.set("month", filterMonth.toString());
      }

      if (filterEmployeeId !== "ALL") {
        params.set("employeeId", filterEmployeeId);
      }

      const res = await fetch(`${API_URL}/attendance/report?${params}`, { headers });
      if (!res.ok) throw new Error("Fehler beim Laden des Berichts");

      const json = await res.json();
      const rawLogs = json.logs ?? [];

      setLogs(
        rawLogs.map((a: any) => ({
          id: a.id,
          employeeId: a.employeeId,
          employeeName: a.employee?.name || "Unknown Staff",
          employeePhone: a.employee?.phone || "",
          warehouseId: a.warehouseId,
          warehouseName: a.warehouse?.name || "Global Hub",
          hallId: a.hallId,
          hallName: a.hall?.name || "Main Staging",
          clockIn: a.clockIn,
          clockOut: a.clockOut,
          totalHours: a.totalHours,
          breakMinutes: a.breakMinutes ?? 0,
          source: a.source ?? "MANUAL",
          date: a.date ? a.date.split("T")[0] : "",
          timesheetId: a.timesheetId || null,
        }))
      );
    } catch (err) {
      console.error("Failed to load report logs", err);
      setMessage({ text: "Verbindung zum Server fehlgeschlagen. Zeige lokale Daten.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }
    loadMetadata();
    // Default date to today
    setFilterDate(new Date().toISOString().split("T")[0]);
  }, [router]);

  useEffect(() => {
    if (filterDate) {
      fetchLogs();
    }
  }, [timeframe, filterDate, filterWeek, filterMonth, filterYear, filterEmployeeId]);

  // Sync hall select based on warehouse select
  const filteredHallsForEdit = useMemo(() => {
    return halls.filter((h) => h.warehouseId === editWarehouseId);
  }, [editWarehouseId, halls]);

  useEffect(() => {
    if (filteredHallsForEdit.length > 0) {
      setEditHallId(filteredHallsForEdit[0].id);
    } else {
      setEditHallId("");
    }
  }, [editWarehouseId, filteredHallsForEdit]);

  // ─── ROW + DATE SELECTION LOGIC ───────────────────────────────────────────

  // Find exact log matching employee + date
  const getLogForCell = (empId: string, dateStr: string) => {
    return logs.find((l) => l.employeeId === empId && l.date === dateStr);
  };

  const handleCellSelect = (empId: string, dateStr: string) => {
    const record = getLogForCell(empId, dateStr);
    setSelectedCell({ employeeId: empId, date: dateStr });

    if (record) {
      // Load current record values into form
      setEditStartTime(formatTimeToHHMM(record.clockIn));
      setEditEndTime(record.clockOut ? formatTimeToHHMM(record.clockOut) : "");
      setEditBreakMinutes(record.breakMinutes);
      setEditTotalHours(record.totalHours || 0);
      setEditWarehouseId(record.warehouseId);
      setEditHallId(record.hallId);
    } else {
      // Clear/default form for creating new manual log
      setEditStartTime("08:00");
      setEditEndTime("16:30");
      setEditBreakMinutes(30);
      setEditTotalHours(8.0);
      if (warehouses.length > 0) setEditWarehouseId(warehouses[0].id);
    }
  };

  const formatTimeToHHMM = (isoStr: string): string => {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    const h = d.getUTCHours().toString().padStart(2, "0");
    const m = d.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  // Auto-calculate hours when editing start/end/break
  useEffect(() => {
    if (!editStartTime || !editEndTime) return;
    const [startH, startM] = editStartTime.split(":").map(Number);
    const [endH, endM] = editEndTime.split(":").map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return;

    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;
    if (endMin > startMin) {
      const netMin = endMin - startMin - editBreakMinutes;
      setEditTotalHours(Math.max(0, Math.round((netMin / 60) * 100) / 100));
    }
  }, [editStartTime, editEndTime, editBreakMinutes]);

  // ─── SAVE MANUALLY EDITED RECORD ──────────────────────────────────────────

  const handleSaveEntry = async () => {
    if (!selectedCell) return;
    setSubmitting(true);
    setMessage({ text: "", type: "" });

    const record = getLogForCell(selectedCell.employeeId, selectedCell.date);

    // Build clockIn and clockOut ISO strings (based on UTC to prevent offset issues)
    const [startH, startM] = editStartTime.split(":").map(Number);
    const clockIn = new Date(selectedCell.date);
    clockIn.setUTCHours(startH || 0, startM || 0, 0, 0);

    let clockOut = null;
    if (editEndTime) {
      const [endH, endM] = editEndTime.split(":").map(Number);
      clockOut = new Date(selectedCell.date);
      clockOut.setUTCHours(endH || 0, endM || 0, 0, 0);
    }

    const payload = {
      employeeId: selectedCell.employeeId,
      clockIn: clockIn.toISOString(),
      clockOut: clockOut ? clockOut.toISOString() : null,
      breakMinutes: editBreakMinutes,
      totalHours: editTotalHours,
      warehouseId: editWarehouseId,
      hallId: editHallId,
    };

    try {
      const headers = {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      };

      let res;
      if (record) {
        // Update existing entry
        res = await fetch(`${API_URL}/attendance/${record.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        // Create new manual entry
        res = await fetch(`${API_URL}/attendance/manual`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Speichern fehlgeschlagen.");

      setMessage({ text: "Zeiterfassungs-Eintrag erfolgreich gespeichert!", type: "success" });
      setSelectedCell(null);
      fetchLogs();
    } catch (err: any) {
      setMessage({ text: err.message || "Fehler beim Speichern.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── EXPORT FILES ──────────────────────────────────────────────────────────

  const downloadTsFile = async (id: string, format: "pdf" | "xlsx") => {
    setDownloadingTs({ id, fmt: format });
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/timesheets/export/${id}/${format}`, { headers });
      if (!res.ok) throw new Error("Download fehlgeschlagen");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stundenzettel-${id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      setMessage({ text: "Dokumenten-Download fehlgeschlagen", type: "error" });
    } finally {
      setDownloadingTs(null);
    }
  };

  // Grouped employees for weekly view
  const displayEmployees = useMemo(() => {
    return filterEmployeeId === "ALL"
      ? employees
      : employees.filter((e) => e.id === filterEmployeeId);
  }, [employees, filterEmployeeId]);

  return (
    <div className="space-y-stack-lg animate-fadeIn text-slate-100">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-headline-lg font-bold text-white">Zeiterfassung Register</h3>
          <p className="text-slate-400 font-body-sm">
            Zeigt alle Arbeitszeiten (gescannte Stundenzettel und manuelle Buchungen) in einer einheitlichen Tabelle.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer text-xs print:hidden"
        >
          <Printer className="w-4 h-4" /> Drucken
        </button>
      </div>

      {/* timeframe Toggle capsule */}
      <div className="flex justify-center sm:justify-start print:hidden">
        <div className="flex bg-white/5 border border-white/10 rounded-2xl p-1 w-full max-w-sm sm:w-auto">
          {(["daily", "weekly", "monthly"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setTimeframe(mode);
                setSelectedCell(null);
              }}
              className={`flex-1 sm:flex-initial text-center py-2 px-6 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                timeframe === mode
                  ? "bg-blue-600 text-white shadow-md scale-[1.02]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {mode === "daily" ? "Täglich" : mode === "weekly" ? "Wöchentlich" : "Monatlich"}
            </button>
          ))}
        </div>
      </div>

      {/* Filters card */}
      <div className="bg-white/5 border border-white/10 p-5 rounded-2xl shadow-sm space-y-4 print:hidden">
        <h5 className="font-semibold text-white flex items-center gap-2 text-sm">
          <Filter className="w-4 h-4 text-blue-400" /> Filteroptionen
        </h5>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
          {/* Dynamic Picker based on timeframe */}
          {timeframe === "daily" && (
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Datum</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/40 font-mono"
              />
            </div>
          )}

          {timeframe === "weekly" && (
            <>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kalenderwoche (KW)</label>
                <select
                  value={filterWeek}
                  onChange={(e) => setFilterWeek(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/40 outline-none"
                >
                  {Array.from({ length: 53 }).map((_, i) => (
                    <option key={i + 1} value={i + 1} className="bg-slate-900 text-white">
                      KW {i + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jahr</label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/40 outline-none"
                >
                  <option value={2026} className="bg-slate-900 text-white">2026</option>
                  <option value={2025} className="bg-slate-900 text-white">2025</option>
                </select>
              </div>
            </>
          )}

          {timeframe === "monthly" && (
            <>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Monat</label>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/40 outline-none"
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={i + 1} className="bg-slate-900 text-white">
                      {new Date(2000, i, 1).toLocaleDateString("de-DE", { month: "long" })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jahr</label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/40 outline-none"
                >
                  <option value={2026} className="bg-slate-900 text-white">2026</option>
                  <option value={2025} className="bg-slate-900 text-white">2025</option>
                </select>
              </div>
            </>
          )}

          {/* Employee selector */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mitarbeiter</label>
            <select
              value={filterEmployeeId}
              onChange={(e) => {
                setFilterEmployeeId(e.target.value);
                setSelectedCell(null);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/40 outline-none"
            >
              <option value="ALL" className="bg-slate-900 text-white">Alle Mitarbeiter</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id} className="bg-slate-900 text-white">
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-xl border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Search className="w-4 h-4 text-blue-400" />}
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-3" />
            <p className="text-slate-400 text-sm">Lade Zeiterfassungsdaten...</p>
          </div>
        ) : logs.length === 0 && timeframe === "daily" ? (
          <div className="text-center py-20 text-slate-400 font-medium">
            Keine Zeiterfassungs-Einträge für dieses Datum vorhanden.
          </div>
        ) : (
          <>
            {/* A) DAILY VIEW */}
            {timeframe === "daily" && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3.5">Mitarbeiter</th>
                    <th className="px-4 py-3.5">Datum</th>
                    <th className="px-4 py-3.5">Von - Bis</th>
                    <th className="px-4 py-3.5">Pause</th>
                    <th className="px-4 py-3.5">Gesamt</th>
                    <th className="px-4 py-3.5">Arbeitsort</th>
                    <th className="px-4 py-3.5">Quelle</th>
                    <th className="px-6 py-3.5 text-right print:hidden">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                  {logs.map((record) => {
                    const isSelected = selectedCell?.employeeId === record.employeeId && selectedCell?.date === record.date;
                    return (
                      <tr
                        key={record.id}
                        onClick={() => handleCellSelect(record.employeeId, record.date)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-blue-600/10 text-white outline outline-2 outline-blue-500/50"
                            : "hover:bg-white/3"
                        }`}
                      >
                        <td className="px-6 py-4 font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold text-[10px]">
                              {record.employeeName.split(" ").map((n) => n[0]).join("")}
                            </div>
                            {record.employeeName}
                          </div>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs">{formatDateLabel(record.date)}</td>
                        <td className="px-4 py-4 font-mono text-xs">
                          {formatTimeToHHMM(record.clockIn)} – {record.clockOut ? formatTimeToHHMM(record.clockOut) : "Aktiv"}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-slate-400">{record.breakMinutes} Min</td>
                        <td className="px-4 py-4 font-mono font-bold text-blue-400">
                          {record.totalHours !== null ? `${record.totalHours.toFixed(2)} h` : "—"}
                        </td>
                        <td className="px-4 py-4 font-sans text-xs text-slate-400">{record.warehouseName} ({record.hallName})</td>
                        <td className="px-4 py-4 text-xs font-mono">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              record.source === "SCAN"
                                ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            }`}
                          >
                            {record.source === "SCAN" ? "SCAN" : "MANUELL"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right print:hidden">
                          {record.timesheetId && (
                            <div className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => downloadTsFile(record.timesheetId!, "pdf")}
                                disabled={downloadingTs?.id === record.timesheetId}
                                className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                                title="Original PDF laden"
                              >
                                <FileText size={14} />
                              </button>
                              <button
                                onClick={() => downloadTsFile(record.timesheetId!, "xlsx")}
                                disabled={downloadingTs?.id === record.timesheetId}
                                className="p-1 text-slate-400 hover:text-emerald-400 transition-colors"
                                title="Original Excel laden"
                              >
                                <FileSpreadsheet size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* B) WEEKLY MATRIX VIEW */}
            {timeframe === "weekly" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-3.5">Mitarbeiter</th>
                      {daysOfWeekList.map((dayStr) => (
                        <th key={dayStr} className="px-4 py-3.5 text-center font-mono text-[11px] leading-tight">
                          <span className="block font-bold text-white">{getGermanWeekdayLabel(dayStr)}</span>
                          <span className="text-[10px] text-slate-400 font-normal">{formatDateLabel(dayStr)}</span>
                        </th>
                      ))}
                      <th className="px-4 py-3.5 text-center">Gesamt</th>
                      <th className="px-6 py-3.5 text-right print:hidden">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                    {displayEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-10 text-slate-400">
                          Keine Mitarbeiter im System vorhanden.
                        </td>
                      </tr>
                    ) : (
                      displayEmployees.map((emp) => {
                        let weeklySum = 0;
                        let linkedTsId: string | null = null;

                        return (
                          <tr key={emp.id} className="hover:bg-white/2 transition-colors">
                            <td className="px-6 py-4 font-semibold text-white">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold text-[10px]">
                                  {emp.name.split(" ").map((n) => n[0]).join("")}
                                </div>
                                <div>
                                  <span className="block">{emp.name}</span>
                                  <span className="text-[10px] text-slate-500 font-mono leading-none">{emp.phone}</span>
                                </div>
                              </div>
                            </td>

                            {daysOfWeekList.map((dayStr) => {
                              const cellRecord = getLogForCell(emp.id, dayStr);
                              const isSelected = selectedCell?.employeeId === emp.id && selectedCell?.date === dayStr;

                              if (cellRecord) {
                                weeklySum += cellRecord.totalHours || 0;
                                if (cellRecord.timesheetId) linkedTsId = cellRecord.timesheetId;
                              }

                              return (
                                <td
                                  key={dayStr}
                                  onClick={() => handleCellSelect(emp.id, dayStr)}
                                  className={`px-2 py-4 text-center font-mono text-xs cursor-pointer select-none transition-all ${
                                    isSelected
                                      ? "bg-blue-600/20 text-white font-bold ring-2 ring-blue-500 rounded-lg shadow-inner"
                                      : "hover:bg-white/5"
                                  }`}
                                >
                                  {cellRecord ? (
                                    <div className="flex flex-col items-center">
                                      <span className="font-semibold">{cellRecord.totalHours?.toFixed(1)} h</span>
                                      <span className="text-[9px] text-slate-500 font-sans tracking-wide leading-none">
                                        {cellRecord.source === "SCAN" ? "Scan" : "Man."}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-600 font-normal">—</span>
                                  )}
                                </td>
                              );
                            })}

                            <td className="px-4 py-4 text-center font-mono font-bold text-blue-400">
                              {weeklySum > 0 ? `${weeklySum.toFixed(1)} h` : "—"}
                            </td>

                            <td className="px-6 py-4 text-right print:hidden" onClick={(e) => e.stopPropagation()}>
                              {linkedTsId ? (
                                <div className="inline-flex gap-2">
                                  <button
                                    onClick={() => downloadTsFile(linkedTsId!, "pdf")}
                                    disabled={downloadingTs?.id === linkedTsId}
                                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                                    title="Stundenzettel PDF"
                                  >
                                    <FileText size={14} />
                                  </button>
                                  <button
                                    onClick={() => downloadTsFile(linkedTsId!, "xlsx")}
                                    disabled={downloadingTs?.id === linkedTsId}
                                    className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                                    title="Stundenzettel Excel"
                                  >
                                    <FileSpreadsheet size={14} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-mono">Manuelle Einträge</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* C) MONTHLY VIEW WITH COLLAPSIBLE WEEKS */}
            {timeframe === "monthly" && (
              <div className="divide-y divide-white/10">
                {weeksOfMonthList.map((weekNo) => {
                  const isExpanded = expandedWeek === weekNo;

                  // Compute dates of this week
                  const jan1 = new Date(Date.UTC(filterYear, 0, 1));
                  const day = jan1.getUTCDay();
                  const diff = day <= 4 ? 1 - day : 8 - day;
                  const firstMonday = new Date(jan1);
                  firstMonday.setUTCDate(jan1.getUTCDate() + diff);

                  const weekStart = new Date(firstMonday);
                  weekStart.setUTCDate(firstMonday.getUTCDate() + (weekNo - 1) * 7);
                  const weekEnd = new Date(weekStart);
                  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

                  // Calculate total hours logged in this week
                  const weekStartStr = weekStart.toISOString().split("T")[0];
                  const weekEndStr = weekEnd.toISOString().split("T")[0];

                  const weekLogs = logs.filter((l) => l.date >= weekStartStr && l.date <= weekEndStr);
                  const weekHoursSum = weekLogs.reduce((s, l) => s + (l.totalHours || 0), 0);

                  return (
                    <div key={weekNo} className="hover:bg-white/1 transition-colors">
                      {/* Week header row */}
                      <div
                        onClick={() => setExpandedWeek(isExpanded ? null : weekNo)}
                        className="flex items-center justify-between p-5 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg transition-transform ${isExpanded ? "bg-blue-600 text-white" : "bg-white/10 text-slate-300"}`}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                          <div>
                            <span className="font-bold text-white text-sm">Kalenderwoche {weekNo}</span>
                            <span className="text-xs text-slate-400 font-mono ml-3">
                              ({formatDateLabel(weekStartStr)} – {formatDateLabel(weekEndStr)})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-5">
                          <div className="text-right">
                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Stunden in Woche</span>
                            <span className="font-mono font-bold text-blue-400 text-sm">{weekHoursSum.toFixed(1)} h</span>
                          </div>
                        </div>
                      </div>

                      {/* Expandable weekly matrix inside month */}
                      {isExpanded && (
                        <div className="bg-slate-900/60 border-t border-white/5 p-4 animate-fadeIn overflow-x-auto">
                          <WeeklyMatrixTable
                            week={weekNo}
                            year={filterYear}
                            displayEmployees={displayEmployees}
                            logs={logs}
                            selectedCell={selectedCell}
                            onCellSelect={handleCellSelect}
                            downloadTsFile={downloadTsFile}
                            downloadingTs={downloadingTs}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Row + Date Edit Panel Card */}
      {selectedCell && (
        <div className="bg-slate-900 border border-blue-500/30 p-6 rounded-2xl shadow-xl space-y-4 animate-slideUp print:hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h5 className="font-bold text-white flex items-center gap-2 text-sm">
              <Clock className="w-5 h-5 text-blue-400" />
              Zeiterfassung bearbeiten
            </h5>
            <button
              onClick={() => setSelectedCell(null)}
              className="text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="text-xs text-slate-400 font-semibold font-mono space-y-1">
            <p>
              Mitarbeiter:{" "}
              <strong className="text-white">
                {employees.find((e) => e.id === selectedCell.employeeId)?.name || "Lade..."}
              </strong>
            </p>
            <p>
              Datum: <strong className="text-white">{formatDateLabel(selectedCell.date)} ({getGermanWeekdayLabel(selectedCell.date)})</strong>
            </p>
            <p>
              Status:{" "}
              <span
                className={`font-bold ${
                  getLogForCell(selectedCell.employeeId, selectedCell.date)
                    ? "text-emerald-400"
                    : "text-amber-500"
                }`}
              >
                {getLogForCell(selectedCell.employeeId, selectedCell.date)
                  ? "Eintrag vorhanden (Wird überschrieben)"
                  : "Kein Eintrag vorhanden (Wird neu angelegt)"}
              </span>
            </p>
          </div>

          {/* Form */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Startzeit</label>
              <input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Endzeit</label>
              <input
                type="time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pause (Min.)</label>
              <input
                type="number"
                min={0}
                value={editBreakMinutes}
                onChange={(e) => setEditBreakMinutes(Number(e.target.value) || 0)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Netto Stunden</label>
              <input
                type="number"
                step="0.05"
                min={0}
                value={editTotalHours}
                onChange={(e) => setEditTotalHours(parseFloat(e.target.value) || 0)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lager</label>
              <select
                value={editWarehouseId}
                onChange={(e) => setEditWarehouseId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40 outline-none"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id} className="bg-slate-900 text-white">
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Halle</label>
              <select
                value={editHallId}
                onChange={(e) => setEditHallId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40 outline-none"
              >
                {filteredHallsForEdit.map((h) => (
                  <option key={h.id} value={h.id} className="bg-slate-900 text-white">
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setSelectedCell(null)}
              className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveEntry}
              disabled={submitting || !editStartTime || !editEndTime}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold py-2.5 px-5 rounded-xl shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {submitting ? "Wird gespeichert..." : "Speichern & Übernehmen"}
            </button>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {message.text && (
        <div
          className={`p-4 rounded-xl flex items-start gap-2.5 text-xs shadow-md animate-slideUp max-w-xl ${
            message.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border border-red-500/30 text-red-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          )}
          <div>
            <p className="font-bold">{message.type === "success" ? "Erfolg" : "Fehler aufgetreten"}</p>
            <p className="opacity-90">{message.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

interface WeeklyMatrixTableProps {
  week: number;
  year: number;
  displayEmployees: EmployeeData[];
  logs: AttendanceRecord[];
  selectedCell: { employeeId: string; date: string } | null;
  onCellSelect: (empId: string, dateStr: string) => void;
  downloadTsFile: (id: string, format: "pdf" | "xlsx") => void;
  downloadingTs: { id: string; fmt: string } | null;
}

function WeeklyMatrixTable({
  week,
  year,
  displayEmployees,
  logs,
  selectedCell,
  onCellSelect,
  downloadTsFile,
  downloadingTs,
}: WeeklyMatrixTableProps) {
  // Generate dates of this week
  const daysOfWeekList = useMemo(() => {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const day = jan1.getUTCDay();
    const diff = day <= 4 ? 1 - day : 8 - day;
    const firstMonday = new Date(jan1);
    firstMonday.setUTCDate(jan1.getUTCDate() + diff);

    const start = new Date(firstMonday);
    start.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);

    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      days.push(d.toISOString().split("T")[0]);
    }
    return days;
  }, [week, year]);

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  };

  const getGermanWeekdayLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekdaysDe = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    return weekdaysDe[d.getUTCDay()];
  };

  const getLogForCell = (empId: string, dateStr: string) => {
    return logs.find((l) => l.employeeId === empId && l.date === dateStr);
  };

  return (
    <table className="w-full text-left border-collapse min-w-[700px] border border-white/5 rounded-xl overflow-hidden font-sans">
      <thead>
        <tr className="bg-white/10 border-b border-white/5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
          <th className="px-4 py-2">Mitarbeiter</th>
          {daysOfWeekList.map((dayStr) => (
            <th key={dayStr} className="px-2 py-2 text-center font-mono text-[10px] leading-tight">
              <span className="block text-white">{getGermanWeekdayLabel(dayStr)}</span>
              <span className="text-[9px] text-slate-500 font-normal">{formatDateLabel(dayStr)}</span>
            </th>
          ))}
          <th className="px-2 py-2 text-center">Gesamt</th>
          <th className="px-4 py-2 text-right">Aktionen</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5 text-xs text-slate-300">
        {displayEmployees.map((emp) => {
          let weeklySum = 0;
          let linkedTsId: string | null = null;

          return (
            <tr key={emp.id} className="hover:bg-white/5 transition-colors">
              <td className="px-4 py-2.5 font-semibold text-white">
                <span className="block">{emp.name}</span>
              </td>

              {daysOfWeekList.map((dayStr) => {
                const cellRecord = getLogForCell(emp.id, dayStr);
                const isSelected = selectedCell?.employeeId === emp.id && selectedCell?.date === dayStr;

                if (cellRecord) {
                  weeklySum += cellRecord.totalHours || 0;
                  if (cellRecord.timesheetId) linkedTsId = cellRecord.timesheetId;
                }

                return (
                  <td
                    key={dayStr}
                    onClick={() => onCellSelect(emp.id, dayStr)}
                    className={`px-1 py-2.5 text-center font-mono text-[11px] cursor-pointer transition-all ${
                      isSelected
                        ? "bg-blue-600/20 text-white font-bold ring-1 ring-blue-500 rounded"
                        : "hover:bg-white/10"
                    }`}
                  >
                    {cellRecord ? `${cellRecord.totalHours?.toFixed(1)} h` : <span className="text-slate-700">—</span>}
                  </td>
                );
              })}

              <td className="px-2 py-2.5 text-center font-mono font-bold text-blue-400">
                {weeklySum > 0 ? `${weeklySum.toFixed(1)} h` : "—"}
              </td>

              <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                {linkedTsId ? (
                  <div className="inline-flex gap-1.5">
                    <button
                      onClick={() => downloadTsFile(linkedTsId!, "pdf")}
                      disabled={downloadingTs?.id === linkedTsId}
                      className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                      title="Stundenzettel PDF"
                    >
                      <FileText size={12} />
                    </button>
                    <button
                      onClick={() => downloadTsFile(linkedTsId!, "xlsx")}
                      disabled={downloadingTs?.id === linkedTsId}
                      className="p-1 text-slate-400 hover:text-emerald-400 transition-colors"
                      title="Stundenzettel Excel"
                    >
                      <FileSpreadsheet size={12} />
                    </button>
                  </div>
                ) : (
                  <span className="text-[9px] text-slate-500 font-mono">Manuell</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
