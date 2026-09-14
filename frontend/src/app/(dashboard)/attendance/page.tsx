"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
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
  Users,
  Printer,
  FileText,
  FileSpreadsheet,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Coffee,
  MapPin,
  X,
  PlusCircle,
  Trash2,
  RotateCcw,
  Building2,
  TrendingUp,
  BarChart3,
  CheckSquare,
  Square,
  Sparkles,
  Info,
} from "lucide-react";
import { API_URL } from "../../../config/api";
import { useDialog } from "../../components/DialogProvider";
import WorkHoursVisibilityToggle from "../../components/WorkHoursVisibilityToggle";

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
  color?: string | null;
}

interface EmployeeData {
  id: string;
  name: string;
  phone: string;
  role: string;
  hallId?: string | null;
  warehouseId?: string | null;
}

interface AbsenceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhone?: string;
  date: string;
  status: "NICHT_GEARBEITET" | "KRANK" | "ABWESEND_GRUND";
  reason?: string | null;
  notes?: string | null;
}

export default function AttendancePage() {
  const router = useRouter();

  // Framework states
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [halls, setHalls] = useState<HallData[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);

  // Filter Mode
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("weekly");

  // Filter Values
  const [filterDate, setFilterDate] = useState("");
  const [filterWeek, setFilterWeek] = useState(25);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [selectedHallIds, setSelectedHallIds] = useState<string[]>([]); // [] means ALL halls
  const [filterEmployeeId, setFilterEmployeeId] = useState("ALL");
  const [searchEmployee, setSearchEmployee] = useState("");

  // Dropdown UI states & outside click refs
  const [isHallDropdownOpen, setIsHallDropdownOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const hallDropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Selection states
  const [selectedCell, setSelectedCell] = useState<{ employeeId: string; date: string } | null>(null);

  // Edit Panel states
  const [editDate, setEditDate] = useState("");
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

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (hallDropdownRef.current && !hallDropdownRef.current.contains(event.target as Node)) {
        setIsHallDropdownOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
      const whRes = await fetch(`${API_URL}/warehouses?limit=1000`, { headers });
      const whJson = whRes.ok ? await whRes.json() : null;
      const whData = whJson && Array.isArray(whJson.data) ? whJson.data : (Array.isArray(whJson) ? whJson : []);
      setWarehouses(whData);

      const hallRes = await fetch(`${API_URL}/halls?limit=1000`, { headers });
      const hallJson = hallRes.ok ? await hallRes.json() : null;
      const hallData = hallJson && Array.isArray(hallJson.data) ? hallJson.data : (Array.isArray(hallJson) ? hallJson : []);
      setHalls(hallData);

      const empRes = await fetch(`${API_URL}/employees?limit=1000`, { headers });
      const empJson = empRes.ok ? await empRes.json() : null;
      const empData = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
      const nonAdmin = empData
        .filter((u: any) => u.role !== "ADMIN")
        .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" }));
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
      const rawAbsences = json.absences ?? [];

      const parsedLogs = rawLogs.map((a: any) => ({
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
      }));

      const parsedAbsences = rawAbsences.map((a: any) => ({
        id: a.id,
        employeeId: a.employeeId,
        employeeName: a.employee?.name || "Unknown Staff",
        employeePhone: a.employee?.phone || "",
        date: a.date ? a.date.split("T")[0] : "",
        status: a.status,
        reason: a.reason,
        notes: a.notes,
      }));

      parsedLogs.sort((a: any, b: any) =>
        (a.employeeName || "").localeCompare(b.employeeName || "", "de", { sensitivity: "base" })
      );

      setLogs(parsedLogs);
      setAbsences(parsedAbsences);
    } catch (err) {
      console.error("Failed to load report logs", err);
      setMessage({ text: "Verbindung zum Server fehlgeschlagen.", type: "error" });
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
    setFilterDate(new Date().toISOString().split("T")[0]);
  }, [router]);

  useEffect(() => {
    if (filterDate || timeframe) {
      fetchLogs();
    }
  }, [timeframe, filterDate, filterWeek, filterMonth, filterYear, filterEmployeeId]);

  const filteredHallsForEdit = useMemo(() => {
    return halls.filter((h) => h.warehouseId === editWarehouseId);
  }, [editWarehouseId, halls]);

  useEffect(() => {
    if (filteredHallsForEdit.length > 0) {
      if (!filteredHallsForEdit.some((h) => h.id === editHallId)) {
        setEditHallId(filteredHallsForEdit[0].id);
      }
    } else {
      setEditHallId("");
    }
  }, [filteredHallsForEdit, editHallId]);

  // ─── ACTIONS & HANDLERS ───────────────────────────────────────────────────

  const toggleHallSelection = (hallId: string) => {
    setSelectedHallIds((prev) => {
      if (prev.includes(hallId)) {
        return prev.filter((id) => id !== hallId);
      } else {
        return [...prev, hallId];
      }
    });
    setSelectedCell(null);
  };

  const selectAllHalls = () => {
    setSelectedHallIds([]);
    setSelectedCell(null);
  };

  const resetAllFilters = () => {
    setSelectedHallIds([]);
    setSearchEmployee("");
    setFilterEmployeeId("ALL");
    setFilterMonth(new Date().getMonth() + 1);
    setFilterYear(new Date().getFullYear());
    setFilterDate(new Date().toISOString().split("T")[0]);
    setSelectedCell(null);
    setExpandedEmployeeId(null);
  };

  const hasActiveFilters =
    selectedHallIds.length > 0 ||
    Boolean(searchEmployee.trim()) ||
    filterEmployeeId !== "ALL";

  const getLogForCell = (empId: string, dateStr: string) => {
    return displayLogs.find((l) => l.employeeId === empId && l.date === dateStr);
  };

  const handleCellSelect = (empId: string, dateStr: string) => {
    setSelectedCell({ employeeId: empId, date: dateStr });
    setEditDate(dateStr);

    const existing = getLogForCell(empId, dateStr);
    if (existing) {
      const pad = (num: number) => num.toString().padStart(2, "0");
      const cIn = new Date(existing.clockIn);
      setEditStartTime(`${pad(cIn.getUTCHours())}:${pad(cIn.getUTCMinutes())}`);
      if (existing.clockOut) {
        const cOut = new Date(existing.clockOut);
        setEditEndTime(`${pad(cOut.getUTCHours())}:${pad(cOut.getUTCMinutes())}`);
      } else {
        setEditEndTime("16:30");
      }
      setEditBreakMinutes(existing.breakMinutes ?? 30);
      setEditTotalHours(existing.totalHours ?? 8);
      if (existing.warehouseId) setEditWarehouseId(existing.warehouseId);
      if (existing.hallId) setEditHallId(existing.hallId);
    } else {
      setEditStartTime("08:00");
      setEditEndTime("16:30");
      setEditBreakMinutes(30);
      setEditTotalHours(8);
      const emp = employees.find((e) => e.id === empId);
      if (emp && emp.warehouseId) setEditWarehouseId(emp.warehouseId);
      if (emp && emp.hallId) setEditHallId(emp.hallId);
    }
  };

  const handleEditTimeChange = (startStr: string, endStr: string, brkMin: number) => {
    setEditStartTime(startStr);
    setEditEndTime(endStr);
    setEditBreakMinutes(brkMin);

    const [sh, sm] = startStr.split(":").map(Number);
    const [eh, em] = endStr.split(":").map(Number);

    if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
      const sMin = sh * 60 + sm;
      const eMin = eh * 60 + em;
      let diff = eMin - sMin - brkMin;
      if (diff < 0) diff = 0;
      setEditTotalHours(Math.round((diff / 60) * 100) / 100);
    }
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell) return;
    setSubmitting(true);
    setMessage({ text: "", type: "" });

    try {
      const existing = getLogForCell(selectedCell.employeeId, selectedCell.date);

      const [sh, sm] = editStartTime.split(":").map(Number);
      const [eh, em] = editEndTime.split(":").map(Number);

      const [y, m, d] = selectedCell.date.split("-").map(Number);
      const clockIn = new Date(Date.UTC(y, m - 1, d, sh, sm));
      const clockOut = new Date(Date.UTC(y, m - 1, d, eh, em));

      const payload = {
        employeeId: selectedCell.employeeId,
        date: selectedCell.date,
        clockIn: clockIn.toISOString(),
        clockOut: clockOut.toISOString(),
        breakMinutes: editBreakMinutes,
        totalHours: editTotalHours,
        warehouseId: editWarehouseId || null,
        hallId: editHallId || null,
      };

      let res;
      if (existing) {
        res = await fetch(`${API_URL}/attendance/${existing.id}`, {
          method: "PATCH",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_URL}/attendance/manual`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Speichern fehlgeschlagen.");

      setMessage({ text: "Zeiterfassung erfolgreich gespeichert!", type: "success" });
      setSelectedCell(null);
      fetchLogs();
    } catch (err: any) {
      setMessage({ text: err.message || "Fehler beim Speichern.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!window.confirm("Sind Sie sicher, dass Sie diesen Zeiterfassungs-Eintrag löschen möchten?")) return;
    setSubmitting(true);
    setMessage({ text: "", type: "" });
    try {
      const res = await fetch(`${API_URL}/attendance/${recordId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Löschen fehlgeschlagen.");
      setMessage({ text: "Erfolgreich gelöscht!", type: "success" });
      setSelectedCell(null);
      fetchLogs();
    } catch (err: any) {
      setMessage({ text: err.message || "Fehler beim Löschen.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

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

  // ─── FILTER PIPELINE & MULTI-LEVEL CALCULATIONS ────────────────────────────

  const searchMatchingEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (selectedHallIds.length > 0) {
        if (!emp.hallId || !selectedHallIds.includes(emp.hallId)) return false;
      }
      if (searchEmployee.trim() && (filterEmployeeId === "ALL" || emp.name !== searchEmployee)) {
        const terms = searchEmployee.trim().toLowerCase().split(/\s+/);
        const name = (emp.name || "").toLowerCase();
        return terms.every((t) => name.includes(t));
      }
      return true;
    });
  }, [employees, selectedHallIds, searchEmployee, filterEmployeeId]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (filterEmployeeId !== "ALL") {
        if (emp.id !== filterEmployeeId) return false;
      }
      if (selectedHallIds.length > 0) {
        if (!emp.hallId || !selectedHallIds.includes(emp.hallId)) return false;
      }
      if (filterEmployeeId === "ALL" && searchEmployee.trim()) {
        const terms = searchEmployee.trim().toLowerCase().split(/\s+/);
        const empName = (emp.name || "").toLowerCase();
        if (!terms.every((t) => empName.includes(t))) return false;
      }
      return true;
    });
  }, [employees, filterEmployeeId, selectedHallIds, searchEmployee]);

  const displayEmployees = useMemo(() => {
    return [...filteredEmployees].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" })
    );
  }, [filteredEmployees]);

  const displayLogs = useMemo(() => {
    return logs.filter((record) => {
      if (filterEmployeeId !== "ALL" && record.employeeId !== filterEmployeeId) {
        return false;
      }
      if (selectedHallIds.length > 0) {
        const emp = employees.find((e) => e.id === record.employeeId);
        const matchesRecord = record.hallId && selectedHallIds.includes(record.hallId);
        const matchesEmp = emp?.hallId && selectedHallIds.includes(emp.hallId);
        if (!matchesRecord && !matchesEmp) return false;
      }
      if (filterEmployeeId === "ALL" && searchEmployee.trim()) {
        const searchTerms = searchEmployee.trim().toLowerCase().split(/\s+/);
        const name = (record.employeeName || "").toLowerCase();
        if (!searchTerms.every((term) => name.includes(term))) return false;
      }
      return true;
    });
  }, [logs, employees, filterEmployeeId, selectedHallIds, searchEmployee]);

  const displayAbsences = useMemo(() => {
    return absences.filter((abs) => {
      if (filterEmployeeId !== "ALL" && abs.employeeId !== filterEmployeeId) {
        return false;
      }
      if (selectedHallIds.length > 0) {
        const emp = employees.find((e) => e.id === abs.employeeId);
        if (!emp?.hallId || !selectedHallIds.includes(emp.hallId)) return false;
      }
      if (filterEmployeeId === "ALL" && searchEmployee.trim()) {
        const searchTerms = searchEmployee.trim().toLowerCase().split(/\s+/);
        const name = (abs.employeeName || "").toLowerCase();
        if (!searchTerms.every((term) => name.includes(term))) return false;
      }
      return true;
    });
  }, [absences, employees, filterEmployeeId, selectedHallIds, searchEmployee]);

  const monthlyOverallStats = useMemo(() => {
    const totalHours = displayLogs.reduce((sum, l) => sum + (l.totalHours || 0), 0);
    const uniqueEmployeeIds = new Set(displayLogs.map((l) => l.employeeId));
    const uniqueDates = new Set(displayLogs.map((l) => l.date));
    const activeEmployeesCount = uniqueEmployeeIds.size;
    const activeDaysCount = uniqueDates.size;
    const avgHoursPerDay = activeDaysCount > 0 ? totalHours / activeDaysCount : 0;

    return {
      totalHours,
      activeEmployeesCount,
      activeDaysCount,
      avgHoursPerDay,
    };
  }, [displayLogs]);

  const monthlyHalleBreakdown = useMemo(() => {
    const totalHours = monthlyOverallStats.totalHours;
    const activeHalls = selectedHallIds.length > 0
      ? halls.filter((h) => selectedHallIds.includes(h.id))
      : halls;

    return activeHalls.map((hall) => {
      const hallLogs = displayLogs.filter((l) => {
        const emp = employees.find((e) => e.id === l.employeeId);
        return l.hallId === hall.id || emp?.hallId === hall.id;
      });
      const hours = hallLogs.reduce((sum, l) => sum + (l.totalHours || 0), 0);
      const percentage = totalHours > 0 ? (hours / totalHours) * 100 : 0;
      const empCount = new Set(hallLogs.map((l) => l.employeeId)).size;

      return {
        id: hall.id,
        name: hall.name,
        color: hall.color || "#1d4ed8",
        hours,
        percentage,
        empCount,
      };
    }).filter((h) => selectedHallIds.length > 0 || h.hours > 0);
  }, [halls, selectedHallIds, displayLogs, employees, monthlyOverallStats.totalHours]);

  const monthlyEmployeeBreakdown = useMemo(() => {
    const totalHours = monthlyOverallStats.totalHours;

    return displayEmployees.map((emp) => {
      const empLogs = displayLogs.filter((l) => l.employeeId === emp.id);
      const empAbs = displayAbsences.filter((a) => a.employeeId === emp.id);
      const empHours = empLogs.reduce((sum, l) => sum + (l.totalHours || 0), 0);
      const percentage = totalHours > 0 ? (empHours / totalHours) * 100 : 0;
      const hall = halls.find((h) => h.id === emp.hallId);
      const dailyRecords = [...empLogs].sort((a, b) => a.date.localeCompare(b.date));

      return {
        employee: emp,
        hallName: hall?.name || "Keine Halle",
        hallColor: hall?.color || "#64748b",
        totalHours: empHours,
        percentage,
        logsCount: empLogs.length,
        absencesCount: empAbs.length,
        dailyRecords,
        absences: empAbs,
      };
    });
  }, [displayEmployees, displayLogs, displayAbsences, halls, monthlyOverallStats.totalHours]);

  return (
    <div className="space-y-stack-lg animate-fadeIn text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-headline-lg font-bold text-slate-900">Zeiterfassung Register</h3>
          <p className="text-slate-500 font-body-sm">
            Zeigt alle Arbeitszeiten (gescannte Stundenzettel und manuelle Buchungen) in einer einheitlichen Tabelle.
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <WorkHoursVisibilityToggle />
          <button
            onClick={() => window.print()}
            className="bg-secondary hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer text-xs print:hidden"
          >
            <Printer className="w-4 h-4" /> Drucken
          </button>
        </div>
      </div>

      <div className="flex justify-center sm:justify-start print:hidden">
        <div className="flex bg-white border border-outline-variant rounded-2xl p-1 w-full max-w-sm sm:w-auto">
          {(["daily", "weekly", "monthly"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setTimeframe(mode);
                setSelectedCell(null);
                setExpandedEmployeeId(null);
              }}
              className={`flex-1 sm:flex-initial text-center py-2 px-6 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                timeframe === mode
                  ? "bg-secondary text-white shadow-md scale-[1.02]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {mode === "daily" ? "Täglich" : mode === "weekly" ? "Wöchentlich" : "Monatlich"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-outline-variant p-5 rounded-2xl shadow-sm space-y-4 print:hidden">
        <div className="flex items-center justify-between">
          <h5 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4 text-secondary" /> Filteroptionen
          </h5>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-semibold text-secondary hover:text-blue-700 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Filter zurücksetzen
            </button>
          )}
        </div>

        <div
          className={`grid gap-4 items-end ${
            timeframe === "daily"
              ? "grid-cols-1 sm:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          }`}
        >
          {timeframe === "daily" && (
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-gray-800 uppercase tracking-wider">Datum</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-white border border-outline-variant rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-secondary font-mono"
              />
            </div>
          )}

          {timeframe === "weekly" && (
            <>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-800 uppercase tracking-wider">Kalenderwoche (KW)</label>
                <select
                  value={filterWeek}
                  onChange={(e) => setFilterWeek(Number(e.target.value))}
                  className="w-full bg-white border border-outline-variant rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-secondary outline-none cursor-pointer"
                >
                  {Array.from({ length: 53 }).map((_, i) => (
                    <option key={i + 1} value={i + 1} className="bg-white text-slate-800">
                      KW {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {timeframe === "monthly" && (
            <>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-800 uppercase tracking-wider">Monat</label>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(Number(e.target.value))}
                  className="w-full bg-white border border-outline-variant rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-secondary outline-none cursor-pointer"
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={i + 1} className="bg-white text-slate-800">
                      {new Date(2000, i, 1).toLocaleDateString("de-DE", { month: "long" })}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="space-y-1 relative" ref={hallDropdownRef}>
            <label className="block text-[11px] font-bold text-gray-800 uppercase tracking-wider">Halle</label>
            <button
              type="button"
              onClick={() => setIsHallDropdownOpen((prev) => !prev)}
              className="w-full bg-white border border-outline-variant rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-secondary outline-none cursor-pointer flex items-center justify-between text-left shadow-2xs"
            >
              <span className="truncate">
                {selectedHallIds.length === 0
                  ? "Alle Hallen"
                  : selectedHallIds.length === 1
                  ? halls.find((h) => h.id === selectedHallIds[0])?.name || "1 Halle ausgewählt"
                  : `${selectedHallIds.length} Hallen ausgewählt`}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isHallDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isHallDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-outline-variant rounded-xl shadow-xl p-2 space-y-1 max-h-64 overflow-y-auto animate-fadeIn">
                <button
                  type="button"
                  onClick={selectAllHalls}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                    selectedHallIds.length === 0 ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {selectedHallIds.length === 0 ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                    Alle Hallen
                  </span>
                </button>
                <div className="border-t border-slate-100 my-1" />
                {halls.map((hall) => {
                  const isChecked = selectedHallIds.includes(hall.id);
                  const hallEmpCount = employees.filter((e) => e.hallId === hall.id).length;
                  return (
                    <button
                      key={hall.id}
                      type="button"
                      onClick={() => toggleHallSelection(hall.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        isChecked ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isChecked ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" /> : <Square className="w-4 h-4 text-slate-400 shrink-0" />}
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: hall.color || "#1d4ed8" }}
                        />
                        <span className="truncate">{hall.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
                        {hallEmpCount} MA
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1 relative" ref={searchContainerRef}>
            <label className="block text-[11px] font-bold text-gray-800 uppercase tracking-wider">Mitarbeiter</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Mitarbeiter suchen..."
                value={searchEmployee}
                onFocus={() => setIsSearchOpen(true)}
                onChange={(e) => {
                  setSearchEmployee(e.target.value);
                  if (filterEmployeeId !== "ALL") setFilterEmployeeId("ALL");
                  setIsSearchOpen(true);
                }}
                className="w-full bg-white border border-outline-variant rounded-xl pl-9 pr-7 py-2 text-sm text-slate-800 focus:outline-none focus:border-secondary outline-none placeholder:text-slate-400"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {(searchEmployee || filterEmployeeId !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchEmployee("");
                    setFilterEmployeeId("ALL");
                    setIsSearchOpen(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {isSearchOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-outline-variant rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    setFilterEmployeeId("ALL");
                    setSearchEmployee("");
                    setIsSearchOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    filterEmployeeId === "ALL" && !searchEmployee ? "bg-blue-50/80 text-blue-700 font-bold" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    Alle Mitarbeiter
                  </span>
                </button>
                {searchMatchingEmployees.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-slate-500 text-center font-medium">
                    Keine Mitarbeiter gefunden
                  </div>
                ) : (
                  searchMatchingEmployees.map((emp) => {
                    const isSelected = filterEmployeeId === emp.id;
                    const hall = halls.find((h) => h.id === emp.hallId);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          setFilterEmployeeId(emp.id);
                          setSearchEmployee(emp.name);
                          setIsSearchOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[9px] shrink-0">
                            {emp.name.split(" ").map((n) => n[0]).join("")}
                          </div>
                          <div className="truncate">
                            <span className="block truncate font-medium">{emp.name}</span>
                            {hall && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hall.color || "#1d4ed8" }} />
                                {hall.name}
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && <CheckCircle className="w-3.5 h-3.5 text-blue-600 shrink-0 ml-2" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-secondary mb-3" />
            <p className="text-slate-500 text-sm">Lade Zeiterfassungsdaten aus der Datenbank...</p>
          </div>
        ) : (
          <>
            {timeframe === "daily" && (
              <>
                {displayLogs.length === 0 && displayAbsences.length === 0 ? (
                  <div className="text-center py-20 text-slate-500 font-medium">
                    Keine Zeiterfassungsdaten für die ausgewählten Filter gefunden.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-outline-variant text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-6 py-3.5">Mitarbeiter</th>
                        <th className="px-4 py-3.5">Datum</th>
                        <th className="px-4 py-3.5">Von - Bis</th>
                        <th className="px-4 py-3.5">Pause</th>
                        <th className="px-4 py-3.5">Gesamt</th>
                        <th className="px-4 py-3.5">Einsatzort</th>
                        <th className="px-4 py-3.5">Quelle</th>
                        <th className="px-6 py-3.5 text-right print:hidden">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y border-t border-outline-variant text-sm text-slate-700">
                      {displayLogs.map((record) => {
                        const isSelected = selectedCell?.employeeId === record.employeeId && selectedCell?.date === record.date;
                        return (
                          <tr
                            key={record.id}
                            onClick={() => handleCellSelect(record.employeeId, record.date)}
                            className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                              isSelected ? "bg-blue-50/70" : ""
                            }`}
                          >
                            <td className="px-6 py-4 font-semibold text-slate-900">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-blue-50 text-secondary flex items-center justify-center font-bold text-xs">
                                  {record.employeeName.split(" ").map((n) => n[0]).join("")}
                                </div>
                                <div>
                                  <span className="block font-bold">{record.employeeName}</span>
                                  <span className="text-xs text-slate-400 font-mono">{record.employeePhone}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 font-mono text-xs text-slate-600">
                              {formatDateLabel(record.date)} ({getGermanWeekdayLabel(record.date)})
                            </td>
                            <td className="px-4 py-4 font-mono text-xs">
                              {record.clockIn.slice(11, 16)} – {record.clockOut ? record.clockOut.slice(11, 16) : "Offen"}
                            </td>
                            <td className="px-4 py-4 font-mono text-xs text-slate-500">{record.breakMinutes} Min.</td>
                            <td className="px-4 py-4 font-mono font-bold text-secondary">
                              {record.totalHours !== null ? `${record.totalHours.toFixed(2)} h` : "—"}
                            </td>
                            <td className="px-4 py-4 font-sans text-xs text-slate-500">{record.warehouseName} ({record.hallName})</td>
                            <td className="px-4 py-4 text-xs font-mono">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  record.source === "SCAN"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}
                              >
                                {record.source === "SCAN" ? "SCAN" : "MANUELL"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right print:hidden">
                              <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {record.timesheetId && (
                                  <>
                                    <button
                                      onClick={() => downloadTsFile(record.timesheetId!, "pdf")}
                                      disabled={downloadingTs?.id === record.timesheetId}
                                      className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                      title="Original PDF laden"
                                    >
                                      <FileText size={14} />
                                    </button>
                                    <button
                                      onClick={() => downloadTsFile(record.timesheetId!, "xlsx")}
                                      disabled={downloadingTs?.id === record.timesheetId}
                                      className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"
                                      title="Original Excel laden"
                                    >
                                      <FileSpreadsheet size={14} />
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => handleDeleteRecord(record.id)}
                                  className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                  title="Eintrag löschen"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {displayAbsences.map((abs) => (
                        <tr key={`abs-${abs.id}`} className="bg-slate-50/60 opacity-85">
                          <td className="px-6 py-3.5 font-semibold text-slate-700">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                                {abs.employeeName.split(" ").map((n) => n[0]).join("")}
                              </div>
                              {abs.employeeName}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs">{formatDateLabel(abs.date)}</td>
                          <td className="px-4 py-3.5" colSpan={2}>
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                abs.status === "KRANK"
                                  ? "bg-amber-50 text-amber-900 border-amber-300"
                                  : abs.status === "NICHT_GEARBEITET"
                                  ? "bg-red-50 text-red-900 border-red-300"
                                  : "bg-blue-50 text-blue-900 border-blue-300"
                              }`}
                            >
                              {abs.status === "KRANK"
                                ? "🟡 Krank"
                                : abs.status === "NICHT_GEARBEITET"
                                ? "🔴 Nicht gearbeitet"
                                : `🔵 Abwesend (${abs.reason || "Grund"})`}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono font-bold text-slate-400">0.00 h</td>
                          <td className="px-4 py-3.5 text-xs text-slate-400 italic" colSpan={3}>
                            Abwesend (0 Std. Arbeitszeit)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {timeframe === "weekly" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-outline-variant text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3.5">Mitarbeiter</th>
                      {daysOfWeekList.map((dayStr) => (
                        <th key={dayStr} className="px-4 py-3.5 text-center font-mono text-[11px] leading-tight">
                          <span className="block font-bold text-slate-800">{getGermanWeekdayLabel(dayStr)}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{formatDateLabel(dayStr)}</span>
                        </th>
                      ))}
                      <th className="px-4 py-3.5 text-center">Gesamt</th>
                      <th className="px-6 py-3.5 text-right print:hidden">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-sm text-slate-700">
                    {displayEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-10 text-slate-500 font-medium">
                          Keine Zeiterfassungsdaten für die ausgewählten Filter gefunden.
                        </td>
                      </tr>
                    ) : (
                      displayEmployees.map((emp) => {
                        let weeklySum = 0;
                        let linkedTsId: string | null = null;
                        return (
                          <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-semibold text-slate-800">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-blue-50 text-secondary flex items-center justify-center font-bold text-[10px]">
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
                              const absRecord = absences.find((a) => a.employeeId === emp.id && a.date === dayStr);
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
                                      ? "bg-blue-50 text-slate-900 font-bold ring-2 ring-secondary rounded-lg shadow-inner"
                                      : "hover:bg-slate-50"
                                  }`}
                                >
                                  {cellRecord ? (
                                    <div className="flex flex-col items-center">
                                      <span className="font-semibold">{cellRecord.totalHours?.toFixed(1)} h</span>
                                      <span className="text-[9px] text-slate-500 font-sans tracking-wide leading-none">
                                        {cellRecord.source === "SCAN" ? "Scan" : "Man."}
                                      </span>
                                    </div>
                                  ) : absRecord ? (
                                    <span
                                      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                        absRecord.status === "KRANK"
                                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                                          : absRecord.status === "NICHT_GEARBEITET"
                                          ? "bg-red-100 text-red-900 border border-red-300"
                                          : "bg-blue-100 text-blue-900 border border-blue-300"
                                      }`}
                                    >
                                      {absRecord.status === "KRANK" ? "🟡 Krank" : absRecord.status === "NICHT_GEARBEITET" ? "🔴 Nicht g." : "🔵 Abwesend"}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-normal">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-4 text-center font-mono font-bold text-secondary">
                              {weeklySum > 0 ? `${weeklySum.toFixed(1)} h` : "—"}
                            </td>
                            <td className="px-6 py-4 text-right print:hidden" onClick={(e) => e.stopPropagation()}>
                              {linkedTsId ? (
                                <div className="inline-flex gap-2">
                                  <button
                                    onClick={() => downloadTsFile(linkedTsId!, "pdf")}
                                    className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                                  >
                                    <FileText size={14} />
                                  </button>
                                  <button
                                    onClick={() => downloadTsFile(linkedTsId!, "xlsx")}
                                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
                                  >
                                    <FileSpreadsheet size={14} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono">Manuell</span>
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

            {timeframe === "monthly" && (
              <div className="space-y-6 p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-50 border border-outline-variant p-4 rounded-xl flex items-center gap-3.5 shadow-2xs">
                    <div className="p-3 bg-blue-50 text-secondary rounded-xl border border-blue-100">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Gesamtstunden Monat</span>
                      <span className="text-xl font-bold font-mono text-slate-900">{monthlyOverallStats.totalHours.toFixed(1)} h</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-outline-variant p-4 rounded-xl flex items-center gap-3.5 shadow-2xs">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Aktive Mitarbeiter</span>
                      <span className="text-xl font-bold font-mono text-slate-900">{monthlyOverallStats.activeEmployeesCount}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-outline-variant p-4 rounded-xl flex items-center gap-3.5 shadow-2xs">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Arbeitstage im Monat</span>
                      <span className="text-xl font-bold font-mono text-slate-900">{monthlyOverallStats.activeDaysCount} Tage</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-outline-variant p-4 rounded-xl flex items-center gap-3.5 shadow-2xs">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Durchschnitt / Tag</span>
                      <span className="text-xl font-bold font-mono text-slate-900">{monthlyOverallStats.avgHoursPerDay.toFixed(1)} h</span>
                    </div>
                  </div>
                </div>

                {monthlyHalleBreakdown.length > 0 && (
                  <div className="bg-slate-50/50 border border-outline-variant rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-secondary" /> Hallen-Übersicht ({monthlyHalleBreakdown.length})
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        Summe: <strong className="text-slate-800">{monthlyOverallStats.totalHours.toFixed(1)} h</strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {monthlyHalleBreakdown.map((hall) => (
                        <div key={hall.id} className="bg-white border border-outline-variant p-3 rounded-xl shadow-2xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hall.color }} />
                              <span className="font-bold text-xs text-slate-800 truncate">{hall.name}</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-secondary shrink-0">
                              {hall.hours.toFixed(1)} h
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(hall.percentage, 100)}%`, backgroundColor: hall.color }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                              <span>{hall.empCount} MA aktiv</span>
                              <span className="font-bold">{hall.percentage.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border border-outline-variant rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-outline-variant flex items-center justify-between">
                    <div>
                      <h6 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-secondary" /> Mitarbeiter-Arbeitszeiten & Anteile
                      </h6>
                      <p className="text-[11px] text-slate-500">Berechnet aus den aktiven Filterkriterien</p>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      {monthlyEmployeeBreakdown.length} Mitarbeiter
                    </span>
                  </div>
                  {monthlyEmployeeBreakdown.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 font-medium text-xs">
                      Keine Zeiterfassungsdaten gefunden.
                    </div>
                  ) : (
                    <div className="divide-y divide-outline-variant">
                      {monthlyEmployeeBreakdown.map((row) => {
                        const isExpanded = expandedEmployeeId === row.employee.id;
                        return (
                          <div key={row.employee.id} className="transition-colors hover:bg-slate-50/40">
                            <div
                              onClick={() => setExpandedEmployeeId(isExpanded ? null : row.employee.id)}
                              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none"
                            >
                              <div className="flex items-center gap-3 min-w-[240px]">
                                <div className="w-8 h-8 rounded-full bg-blue-50 text-secondary flex items-center justify-center font-bold text-xs shrink-0">
                                  {row.employee.name.split(" ").map((n) => n[0]).join("")}
                                </div>
                                <div className="truncate">
                                  <span className="font-bold text-slate-900 text-sm block truncate">{row.employee.name}</span>
                                  <span className="text-xs text-slate-400 font-mono block truncate">{row.employee.phone}</span>
                                </div>
                              </div>
                              <div className="w-32 shrink-0">
                                <span
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
                                  style={{
                                    backgroundColor: `${row.hallColor}15`,
                                    borderColor: `${row.hallColor}40`,
                                    color: row.hallColor,
                                  }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: row.hallColor }} />
                                  {row.hallName}
                                </span>
                              </div>
                              <div className="flex-1 max-w-xs space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-mono font-bold text-slate-900 text-sm">{row.totalHours.toFixed(1)} h</span>
                                  <span className="font-mono text-secondary font-bold text-xs">{row.percentage.toFixed(1)} % Anteil</span>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                  <div
                                    className="bg-secondary h-full rounded-full transition-all duration-300"
                                    style={{ width: `${Math.min(row.percentage, 100)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                                  {row.logsCount} Einträge
                                  {row.absencesCount > 0 && <span className="text-amber-600">({row.absencesCount} Abwesenheiten)</span>}
                                </span>
                                <div className={`p-1 rounded-lg transition-transform ${isExpanded ? "bg-secondary text-white" : "bg-slate-100 text-slate-600"}`}>
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </div>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="bg-slate-50 border-t border-outline-variant p-4 space-y-3 animate-fadeIn">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-secondary" /> Tägliche Zeiteinträge
                                  </span>
                                </div>
                                {row.dailyRecords.length === 0 && row.absences.length === 0 ? (
                                  <div className="text-xs text-slate-400 py-3 italic">Keine Daten.</div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                                    {row.dailyRecords.map((rec) => (
                                      <div
                                        key={rec.id}
                                        onClick={(e) => { e.stopPropagation(); handleCellSelect(rec.employeeId, rec.date); }}
                                        className="bg-white border border-outline-variant p-3 rounded-xl hover:border-secondary transition-all cursor-pointer shadow-2xs space-y-1.5"
                                      >
                                        <div className="flex items-center justify-between text-xs">
                                          <strong className="font-mono text-slate-900">{formatDateLabel(rec.date)}</strong>
                                          <span className="font-mono font-bold text-secondary">{rec.totalHours?.toFixed(1)} h</span>
                                        </div>
                                      </div>
                                    ))}
                                    {row.absences.map((abs) => (
                                      <div key={`abs-${abs.id}`} className="bg-amber-50/50 border border-amber-200 p-3 rounded-xl space-y-1 shadow-2xs">
                                        <div className="flex items-center justify-between text-xs">
                                          <strong className="font-mono text-amber-950">{formatDateLabel(abs.date)}</strong>
                                        </div>
                                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold border border-amber-300 bg-amber-100 text-amber-900">
                                          Abwesend
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border border-outline-variant rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-outline-variant flex items-center justify-between">
                    <h6 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-secondary" /> Kalenderwochen im Detail
                    </h6>
                  </div>
                  <div className="divide-y divide-outline-variant">
                    {weeksOfMonthList.map((weekNo) => {
                      const isExpanded = expandedWeek === weekNo;
                      return (
                        <div key={weekNo}>
                          <div
                            onClick={() => setExpandedWeek(isExpanded ? null : weekNo)}
                            className="flex items-center justify-between p-4 cursor-pointer"
                          >
                            <span className="text-sm font-bold text-slate-800">Kalenderwoche {weekNo}</span>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                          {isExpanded && (
                            <div className="bg-slate-50 border-t border-outline-variant p-4">
                              <WeeklyMatrixTable
                                week={weekNo}
                                year={filterYear}
                                displayEmployees={displayEmployees}
                                logs={displayLogs}
                                absences={displayAbsences}
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
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedCell && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedCell(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <h4 className="font-bold text-slate-900">Zeiterfassung bearbeiten</h4>
              <button onClick={() => setSelectedCell(null)}><X size={18} /></button>
            </div>
            <div className="p-6">
              <form onSubmit={handleSaveAttendance} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input type="time" required value={editStartTime} onChange={(e) => handleEditTimeChange(e.target.value, editEndTime, editBreakMinutes)} className="w-full border rounded-xl p-2" />
                  <input type="time" required value={editEndTime} onChange={(e) => handleEditTimeChange(editStartTime, e.target.value, editBreakMinutes)} className="w-full border rounded-xl p-2" />
                </div>
                <button type="submit" className="w-full bg-secondary text-white py-2 rounded-xl">Speichern</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {message.text && (
        <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-xl border ${message.type === "success" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

function WeeklyMatrixTable({
  week,
  year,
  displayEmployees,
  logs,
  absences = [],
  selectedCell,
  onCellSelect,
  downloadTsFile,
  downloadingTs,
}: any) {
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

  const getLogForCell = (empId: string, dateStr: string) => logs.find((l: any) => l.employeeId === empId && l.date === dateStr);

  return (
    <table className="w-full text-left border-collapse border rounded-xl overflow-hidden">
      <thead className="bg-slate-100 text-[9px] uppercase">
        <tr>
          <th className="px-4 py-2">Mitarbeiter</th>
          {daysOfWeekList.map((d) => <th key={d} className="px-2 py-2 text-center">{d.slice(5)}</th>)}
          <th className="px-2 py-2">Gesamt</th>
        </tr>
      </thead>
      <tbody className="divide-y text-xs">
        {displayEmployees.length === 0 ? (
          <tr>
            <td colSpan={daysOfWeekList.length + 2} className="text-center py-6 text-slate-400 font-medium">
              Keine Mitarbeiter für diesen Filter gefunden.
            </td>
          </tr>
        ) : (
          displayEmployees.map((emp: any) => {
            let weeklySum = 0;
            return (
              <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2.5 font-semibold text-slate-800">{emp.name}</td>
                {daysOfWeekList.map((dayStr) => {
                  const cellRecord = getLogForCell(emp.id, dayStr);
                  const absRecord = absences.find((a: any) => a.employeeId === emp.id && a.date === dayStr);
                  const isSelected = selectedCell?.employeeId === emp.id && selectedCell?.date === dayStr;
                  if (cellRecord) weeklySum += cellRecord.totalHours || 0;
                  return (
                    <td
                      key={dayStr}
                      onClick={() => onCellSelect(emp.id, dayStr)}
                      className={`px-1 py-2.5 text-center font-mono text-[11px] cursor-pointer transition-all ${
                        isSelected
                          ? "bg-blue-100 text-slate-900 font-bold ring-1 ring-blue-500 rounded"
                          : "hover:bg-slate-100"
                      }`}
                    >
                      {cellRecord ? (
                        `${cellRecord.totalHours?.toFixed(1)} h`
                      ) : absRecord ? (
                        <span
                          className={`inline-block px-1 py-0.5 rounded text-[8px] font-bold ${
                            absRecord.status === "KRANK"
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : absRecord.status === "NICHT_GEARBEITET"
                              ? "bg-red-100 text-red-900 border border-red-300"
                              : "bg-blue-100 text-blue-900 border border-blue-300"
                          }`}
                        >
                          {absRecord.status === "KRANK"
                            ? "Krank"
                            : absRecord.status === "NICHT_GEARBEITET"
                            ? "Nicht g."
                            : "Abwesend"}
                        </span>
                      ) : (
                        <span className="text-slate-350">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-2.5 text-center font-mono font-bold text-slate-900 bg-slate-50/50">
                  {weeklySum > 0 ? `${weeklySum.toFixed(1)} h` : "—"}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
