"use client";

import React, { useState, useEffect } from "react";
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
  Plus,
  Printer,
  FileText,
  FileSpreadsheet,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Coffee,
  MapPin,
} from "lucide-react";

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhone: string;
  warehouseId: string;
  warehouseName: string;
  hallId: string;
  hallName: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number | null;
  date: string;
}

interface WarehouseData {
  id: string;
  name: string;
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
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [halls, setHalls] = useState<HallData[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);

  // Filter states
  const [filterDate, setFilterDate] = useState("");
  const [filterWarehouseId, setFilterWarehouseId] = useState("ALL");

  // Form states
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [actionWarehouseId, setActionWarehouseId] = useState("");
  const [actionHallId, setActionHallId] = useState("");

  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"shifts" | "timesheets">("shifts");
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [timesheetsLoading, setTimesheetsLoading] = useState(false);
  const [expandedTimesheetId, setExpandedTimesheetId] = useState<string | null>(null);
  const [timesheetDetails, setTimesheetDetails] = useState<Record<string, any>>({});
  const [tsFilterEmployeeId, setTsFilterEmployeeId] = useState("ALL");
  const [tsFilterTimeframe, setTsFilterTimeframe] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [tsFilterDate, setTsFilterDate] = useState("");
  const [tsFilterMonth, setTsFilterMonth] = useState(new Date().getMonth() + 1);
  const [tsFilterYear, setTsFilterYear] = useState(new Date().getFullYear());
  const [downloadingTs, setDownloadingTs] = useState<{ id: string; fmt: string } | null>(null);

  const loadData = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch warehouses
      const whRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, { headers });
      const whJson = whRes.ok ? await whRes.json() : null;
      const whData = whJson && Array.isArray(whJson.data) ? whJson.data : (Array.isArray(whJson) ? whJson : []);
      setWarehouses(whData);
      if (whData.length > 0) setActionWarehouseId(whData[0].id);

      // Fetch halls
      const hallRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, { headers });
      const hallJson = hallRes.ok ? await hallRes.json() : null;
      const hallData = hallJson && Array.isArray(hallJson.data) ? hallJson.data : (Array.isArray(hallJson) ? hallJson : []);
      setHalls(hallData);

      // Fetch employees
      const empRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees`, { headers });
      const empJson = empRes.ok ? await empRes.json() : null;
      const empData = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
      const nonAdmin = empData.filter((u: any) => u.role !== "ADMIN");
      setEmployees(nonAdmin);
      if (nonAdmin.length > 0) {
        setSelectedEmployeeId(nonAdmin[0].id);
      }

      // Fetch attendance
      const dateQuery = filterDate ? `?date=${filterDate}` : "";
      const whQuery = filterWarehouseId !== "ALL" ? `&warehouseId=${filterWarehouseId}` : "";
      const attRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/daily${dateQuery}${whQuery}`, {
        headers,
      });
      const attData = attRes.ok ? await attRes.json() : [];

      setAttendance(
        attData.map((a: any) => ({
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
          date: a.date,
        }))
      );

      setIsOffline(false);
    } catch (err) {
      setIsOffline(true);
      // Fallback Mock data
      const mockWH = [
        { id: "wh-1", name: "Duisburg Port Hub" },
        { id: "wh-2", name: "Rhein-Ruhr Logistics" },
      ];
      const mockHalls = [
        { id: "hall-a", name: "Hall A - Cold Storage", warehouseId: "wh-1" },
        { id: "hall-b", name: "Hall B - General Cargo", warehouseId: "wh-1" },
      ];
      const mockEmployees = [
        { id: "emp-1", name: "Johannes Müller", phone: "+491704444444", role: "EMPLOYEE" },
        { id: "emp-2", name: "Dieter Schmidt", phone: "+491705555555", role: "EMPLOYEE" },
      ];
      const mockAttendance: AttendanceRecord[] = [
        {
          id: "att-1",
          employeeId: "emp-1",
          employeeName: "Johannes Müller",
          employeePhone: "+491704444444",
          warehouseId: "wh-1",
          warehouseName: "Duisburg Port Hub",
          hallId: "hall-a",
          hallName: "Hall A - Cold Storage",
          clockIn: new Date(new Date().setHours(8, 0, 0)).toISOString(),
          clockOut: new Date(new Date().setHours(16, 30, 0)).toISOString(),
          totalHours: 8.5,
          date: new Date().toLocaleDateString('en-CA'),
        },
        {
          id: "att-2",
          employeeId: "emp-2",
          employeeName: "Dieter Schmidt",
          employeePhone: "+491705555555",
          warehouseId: "wh-1",
          warehouseName: "Duisburg Port Hub",
          hallId: "hall-b",
          hallName: "Hall B - General Cargo",
          clockIn: new Date(new Date().setHours(7, 45, 0)).toISOString(),
          clockOut: null,
          totalHours: null,
          date: new Date().toLocaleDateString('en-CA'),
        },
      ];

      setWarehouses(mockWH);
      setActionWarehouseId(mockWH[0].id);
      setHalls(mockHalls);
      setEmployees(mockEmployees);
      setSelectedEmployeeId(mockEmployees[0].id);
      setAttendance(mockAttendance);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!filterDate) {
      setFilterDate(new Date().toLocaleDateString('en-CA'));
      return;
    }
    loadData();
  }, [router, filterDate, filterWarehouseId]);

  // Set default hall when action warehouse changes
  useEffect(() => {
    const filtered = halls.filter((h) => h.warehouseId === actionWarehouseId);
    if (filtered.length > 0) {
      setActionHallId(filtered[0].id);
    } else {
      setActionHallId("");
    }
  }, [actionWarehouseId, halls]);

  // Load timesheets data
  const loadTimesheets = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setTimesheetsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams({ status: 'CONFIRMED', limit: '100' });
      if (tsFilterEmployeeId !== 'ALL') {
        params.set('employeeId', tsFilterEmployeeId);
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/timesheets?${params}`, { headers });
      const json = await res.json();
      const list = json.data ?? [];

      // Filter in frontend based on timeframe
      let filtered = [...list];

      if (tsFilterTimeframe === 'daily' && tsFilterDate) {
        const targetDate = new Date(tsFilterDate);
        targetDate.setHours(0, 0, 0, 0);

        // Fetch detailed entries for matched timesheets to find the matching day
        const matched: any[] = [];
        for (const ts of list) {
          const start = new Date(ts.weekStartDate);
          const end = new Date(start);
          end.setDate(start.getDate() + 6);
          end.setHours(23, 59, 59, 999);

          if (targetDate >= start && targetDate <= end) {
            // Load full details if not already in cache
            let details = timesheetDetails[ts.id];
            if (!details) {
              const detailsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/timesheets/${ts.id}`, { headers });
              details = detailsRes.ok ? await detailsRes.json() : null;
              if (details) {
                setTimesheetDetails(prev => ({ ...prev, [ts.id]: details }));
              }
            }

            if (details && details.entries) {
              const dayEntry = details.entries.find((e: any) => {
                const ed = new Date(e.date);
                return ed.getUTCDate() === targetDate.getUTCDate() &&
                       ed.getUTCMonth() === targetDate.getUTCMonth() &&
                       ed.getUTCFullYear() === targetDate.getUTCFullYear();
              });

              if (dayEntry && (dayEntry.startTime || dayEntry.endTime)) {
                matched.push({
                  ...ts,
                  dayEntry,
                });
              }
            }
          }
        }
        filtered = matched;
      } else if (tsFilterTimeframe === 'weekly' && tsFilterDate) {
        const targetDate = new Date(tsFilterDate);
        const day = targetDate.getDay();
        const distToMonday = day === 0 ? 6 : day - 1;
        const monday = new Date(targetDate);
        monday.setDate(targetDate.getDate() - distToMonday);
        monday.setHours(0, 0, 0, 0);

        filtered = list.filter((ts: any) => {
          const wsd = new Date(ts.weekStartDate);
          wsd.setHours(0, 0, 0, 0);
          return wsd.getTime() === monday.getTime();
        });
      } else if (tsFilterTimeframe === 'monthly') {
        filtered = list.filter((ts: any) => {
          const wsd = new Date(ts.weekStartDate);
          return (wsd.getMonth() + 1) === tsFilterMonth && wsd.getFullYear() === tsFilterYear;
        });
      }

      setTimesheets(filtered);
    } catch (err) {
      console.error('Failed to load confirmed timesheets', err);
    } finally {
      setTimesheetsLoading(false);
    }
  };

  const downloadTsFile = async (id: string, format: 'pdf' | 'xlsx') => {
    setDownloadingTs({ id, fmt: format });
    try {
      const token = localStorage.getItem("accessToken");
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/timesheets/export/${id}/${format}`, {
        headers,
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stundenzettel-${id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingTs(null);
    }
  };

  const toggleExpandTimesheet = async (id: string) => {
    if (expandedTimesheetId === id) {
      setExpandedTimesheetId(null);
      return;
    }

    setExpandedTimesheetId(id);

    if (!timesheetDetails[id]) {
      try {
        const token = localStorage.getItem("accessToken");
        const headers = { Authorization: `Bearer ${token}` };
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/timesheets/${id}`, { headers });
        if (res.ok) {
          const json = await res.json();
          setTimesheetDetails(prev => ({ ...prev, [id]: json }));
        }
      } catch (err) {
        console.error('Failed to load timesheet details', err);
      }
    }
  };

  useEffect(() => {
    if (!tsFilterDate) {
      setTsFilterDate(new Date().toLocaleDateString('en-CA'));
    }
  }, []);

  useEffect(() => {
    if (activeTab === "timesheets") {
      loadTimesheets();
    }
  }, [activeTab, tsFilterEmployeeId, tsFilterTimeframe, tsFilterDate, tsFilterMonth, tsFilterYear]);

  const handleClockIn = async () => {
    if (!selectedEmployeeId || !actionWarehouseId || !actionHallId) return;

    setSubmitting(true);
    setMessage({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      // Offline mock insert
      const emp = employees.find((e) => e.id === selectedEmployeeId);
      const newAtt: AttendanceRecord = {
        id: "att-mock-" + Date.now(),
        employeeId: selectedEmployeeId,
        employeeName: emp ? emp.name : "Staff Member",
        employeePhone: emp ? emp.phone : "",
        warehouseId: actionWarehouseId,
        warehouseName: warehouses.find((w) => w.id === actionWarehouseId)?.name || "Local WH",
        hallId: actionHallId,
        hallName: halls.find((h) => h.id === actionHallId)?.name || "Local Hall",
        clockIn: new Date().toISOString(),
        clockOut: null,
        totalHours: null,
        date: new Date().toLocaleDateString('en-CA'),
      };

      setAttendance((prev) => [newAtt, ...prev]);
      setMessage({ text: "Employee clocked in successfully (Offline mock).", type: "success" });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/clock-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          warehouseId: actionWarehouseId,
          hallId: actionHallId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Clock in action failed.");
      }

      setMessage({ text: "Clock in registered successfully!", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to clock in.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClockOut = async (employeeId: string) => {
    setSubmitting(true);
    setMessage({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      setAttendance((prev) =>
        prev.map((a) => {
          if (a.employeeId === employeeId && !a.clockOut) {
            const clockInDate = new Date(a.clockIn);
            const clockOutDate = new Date();
            const hrs = (clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60 * 60);
            return {
              ...a,
              clockOut: clockOutDate.toISOString(),
              totalHours: parseFloat(hrs.toFixed(2)),
            };
          }
          return a;
        })
      );
      setMessage({ text: "Employee clocked out successfully (Offline mock).", type: "success" });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/clock-out`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          employeeId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Clock out action failed.");
      }

      setMessage({ text: "Clock out registered successfully!", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to clock out.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHalls = halls.filter((h) => h.warehouseId === actionWarehouseId);

  return (
    <div className="space-y-stack-lg animate-fadeIn">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-headline-lg font-bold text-on-surface">Attendance Register / Zeiterfassung</h3>
          <p className="text-on-surface-variant font-body-sm">
            Track employee work shifts, clock-in hours, and manage active shifts or view confirmed timesheets.
          </p>
        </div>
        {activeTab === "timesheets" && (
          <button
            onClick={() => window.print()}
            className="bg-secondary hover:bg-secondary/90 text-white font-bold px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer text-xs print:hidden"
          >
            <Printer className="w-4 h-4" /> Drucken
          </button>
        )}
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-outline-variant print:hidden">
        <button
          onClick={() => setActiveTab("shifts")}
          className={`px-5 py-3 font-semibold text-xs border-b-2 uppercase tracking-wider font-bold transition-colors ${
            activeTab === "shifts"
              ? "border-secondary text-secondary"
              : "border-transparent text-outline hover:text-on-surface"
          }`}
        >
          Schichten (Check-In/Out)
        </button>
        <button
          onClick={() => setActiveTab("timesheets")}
          className={`px-5 py-3 font-semibold text-xs border-b-2 uppercase tracking-wider font-bold transition-colors ${
            activeTab === "timesheets"
              ? "border-secondary text-secondary"
              : "border-transparent text-outline hover:text-on-surface"
          }`}
        >
          Stundenzettel (Scans)
        </button>
      </div>

      {activeTab === "shifts" && (
        <>

      {isOffline && (
        <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-2.5 rounded-lg flex items-center gap-2 text-label-md">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline mode active. Shift logs updates will be local only.</span>
        </div>
      )}

      {/* Manual clock in panel */}
      <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm space-y-4">
        <h5 className="font-bold text-body-lg flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-secondary" /> Manual Attendance Action
        </h5>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-stack-md items-end">
          {/* Employee */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
              Employee
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Warehouse */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
              Warehouse
            </label>
            <select
              value={actionWarehouseId}
              onChange={(e) => setActionWarehouseId(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
            >
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
          </div>

          {/* Hall */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
              Hall Zone
            </label>
            <select
              value={actionHallId}
              onChange={(e) => setActionHallId(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
            >
              {filteredHalls.length === 0 ? (
                <option value="">No halls available</option>
              ) : (
                filteredHalls.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Submit */}
          <button
            onClick={handleClockIn}
            disabled={submitting || !actionHallId}
            className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-5 h-5" /> Manual Clock In
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm flex flex-col md:flex-row gap-stack-md items-center justify-between">
        
        {/* Date Selector */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Calendar className="w-4 h-4 text-outline" />
          <span className="text-label-md text-outline font-bold uppercase tracking-wider text-[10px]">
            Shift Date:
          </span>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5 text-body-sm outline-none"
          />
        </div>

        {/* Warehouse Filters */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Filter className="w-4 h-4 text-outline" />
          <span className="text-label-md text-outline font-bold uppercase tracking-wider text-[10px]">
            Filter Warehouse:
          </span>
          <select
            value={filterWarehouseId}
            onChange={(e) => setFilterWarehouseId(e.target.value)}
            className="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5 text-label-md outline-none"
          >
            <option value="ALL">All Warehouses</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>
                {wh.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Attendance Register Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider">
              <th className="px-container-margin py-3">Staff Employee</th>
              <th className="px-4 py-3">Location Space</th>
              <th className="px-4 py-3">Clock In</th>
              <th className="px-4 py-3">Clock Out</th>
              <th className="px-4 py-3">Work Hours</th>
              <th className="px-container-margin py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
            {attendance.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-outline font-medium">
                  No shift attendance records registered for this date slot.
                </td>
              </tr>
            ) : (
              attendance.map((record) => (
                <tr key={record.id} className="hover:bg-surface-bright transition-colors">
                  <td className="px-container-margin py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary/10 text-secondary flex items-center justify-center font-bold text-sm">
                        {record.employeeName.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <span className="font-semibold block text-on-surface">{record.employeeName}</span>
                        <span className="text-[11px] text-outline font-mono">{record.employeePhone}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col">
                      <span className="font-semibold text-on-surface">{record.warehouseName}</span>
                      <span className="text-[12px] text-outline">{record.hallName}</span>
                    </div>
                  </td>
                  <td suppressHydrationWarning className="px-4 py-3.5 font-mono text-[12px] text-on-surface"> {new Date(record.clockIn).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td suppressHydrationWarning className="px-4 py-3.5 font-mono text-[12px]">
                    {record.clockOut ? (
                      new Date(record.clockOut).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    ) : (
                      <span className="text-amber-600 font-semibold uppercase tracking-wider text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Active Shift
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 font-mono font-bold text-secondary">
                    {record.totalHours !== null ? `${record.totalHours} hrs` : "-"}
                  </td>
                  <td className="px-container-margin py-3.5 text-right">
                    {!record.clockOut ? (
                      <button
                        onClick={() => handleClockOut(record.employeeId)}
                        disabled={submitting}
                        className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow transition-all cursor-pointer"
                      >
                        Clock Out
                      </button>
                    ) : (
                      <span className="text-emerald-700 text-xs font-bold flex items-center justify-end gap-1 font-mono">
                        <CheckCircle className="w-4 h-4 text-emerald-600" /> CLOSED
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </>
      )}

      {/* TAB 2: Stundenzettel */}
      {activeTab === "timesheets" && (
        <div className="space-y-stack-lg animate-fadeIn">
          {/* Filters card */}
          <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm space-y-4 print:hidden">
            <h5 className="font-bold text-body-lg flex items-center gap-2">
              <Filter className="w-5 h-5 text-secondary" /> Stundenzettel filtern
            </h5>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-stack-md items-end">
              {/* Employee selection */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Mitarbeiter
                </label>
                <select
                  value={tsFilterEmployeeId}
                  onChange={(e) => setTsFilterEmployeeId(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
                >
                  <option value="ALL">Alle Mitarbeiter</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Timeframe selector toggle */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Zeitrahmen
                </label>
                <div className="flex bg-surface-container-low border border-outline-variant rounded-lg p-0.5">
                  {(['daily', 'weekly', 'monthly'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTsFilterTimeframe(mode)}
                      className={`flex-1 text-center py-1.5 px-2 rounded font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                        tsFilterTimeframe === mode
                          ? "bg-secondary text-white shadow-sm"
                          : "text-outline hover:text-on-surface"
                      }`}
                    >
                      {mode === 'daily' ? 'Täglich' : mode === 'weekly' ? 'Wöchentlich' : 'Monatlich'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date pickers depending on timeframe */}
              {tsFilterTimeframe !== 'monthly' ? (
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                    {tsFilterTimeframe === 'daily' ? 'Datum' : 'Woche (Datum wählen)'}
                  </label>
                  <input
                    type="date"
                    value={tsFilterDate}
                    onChange={(e) => setTsFilterDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                      Monat
                    </label>
                    <select
                      value={tsFilterMonth}
                      onChange={(e) => setTsFilterMonth(Number(e.target.value))}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-2 py-2 text-body-sm text-on-surface outline-none"
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(2000, i, 1).toLocaleDateString('de-DE', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                      Jahr
                    </label>
                    <select
                      value={tsFilterYear}
                      onChange={(e) => setTsFilterYear(Number(e.target.value))}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-2 py-2 text-body-sm text-on-surface outline-none"
                    >
                      <option value={2026}>2026</option>
                      <option value={2025}>2025</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Refresh button */}
              <button
                onClick={loadTimesheets}
                disabled={timesheetsLoading}
                className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              >
                {timesheetsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Aktualisieren
              </button>
            </div>
          </div>

          {/* List/Table Container */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
            {timesheetsLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 animate-spin text-secondary mb-3" />
                <p className="text-outline text-body-sm">Stundenzettel werden geladen...</p>
              </div>
            ) : timesheets.length === 0 ? (
              <div className="text-center py-16 text-outline font-medium">
                Keine bestätigten Stundenzettel für diesen Filter gefunden.
              </div>
            ) : tsFilterTimeframe === 'daily' ? (
              /* Daily Details Table directly */
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider">
                    <th className="px-6 py-3">Mitarbeiter</th>
                    <th className="px-4 py-3">Wochentag / Datum</th>
                    <th className="px-4 py-3">Von - Bis</th>
                    <th className="px-4 py-3">Pause</th>
                    <th className="px-4 py-3">Stunden</th>
                    <th className="px-4 py-3">Arbeitsort</th>
                    <th className="px-6 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
                  {timesheets.map((ts) => {
                    const entry = ts.dayEntry;
                    return (
                      <tr key={ts.id} className="hover:bg-surface-bright transition-colors">
                        <td className="px-6 py-4 font-semibold text-on-surface">
                          {ts.employee?.name ?? ts.employeeName}
                        </td>
                        <td className="px-4 py-4 font-mono">
                          <span className="font-semibold block">{entry.weekday}</span>
                          <span className="text-xs text-outline">{new Date(entry.date).toLocaleDateString('de-DE')}</span>
                        </td>
                        <td className="px-4 py-4 font-mono text-[12px]">
                          {entry.startTime} – {entry.endTime}
                        </td>
                        <td className="px-4 py-4 font-mono text-outline">
                          {entry.breakMinutes} Min
                        </td>
                        <td className="px-4 py-4 font-mono font-bold text-secondary">
                          {entry.totalHours.toFixed(2)} h
                        </td>
                        <td className="px-4 py-4 font-medium text-on-surface-variant">
                          {entry.location || '—'}
                        </td>
                        <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                          <button
                            onClick={() => downloadTsFile(ts.id, 'pdf')}
                            disabled={downloadingTs?.id === ts.id}
                            className="bg-red-600/10 hover:bg-red-600/20 text-red-600 text-xs font-bold px-2.5 py-1.5 rounded shadow-sm transition-all cursor-pointer flex items-center gap-1"
                            title="Als PDF herunterladen"
                          >
                            {downloadingTs?.id === ts.id && downloadingTs?.fmt === 'pdf' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FileText className="w-3.5 h-3.5" />
                            )}
                            PDF
                          </button>
                          <button
                            onClick={() => downloadTsFile(ts.id, 'xlsx')}
                            disabled={downloadingTs?.id === ts.id}
                            className="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 text-xs font-bold px-2.5 py-1.5 rounded shadow-sm transition-all cursor-pointer flex items-center gap-1"
                            title="Als Excel herunterladen"
                          >
                            {downloadingTs?.id === ts.id && downloadingTs?.fmt === 'xlsx' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            )}
                            Excel
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              /* Weekly or Monthly List with expandible details */
              <div className="divide-y divide-outline-variant">
                {timesheets.map((ts) => {
                  const isExpanded = expandedTimesheetId === ts.id;
                  const details = timesheetDetails[ts.id];

                  return (
                    <div key={ts.id} className="hover:bg-surface-bright/50 transition-colors">
                      {/* Main row */}
                      <div className="flex items-center justify-between p-4 gap-4">
                        <div className="flex-1 min-w-0">
                          <h6 className="font-bold text-on-surface text-body-sm mb-0.5">
                            {ts.employee?.name ?? ts.employeeName}
                          </h6>
                          <p className="text-xs text-outline font-mono">
                            Zeitraum: {new Date(ts.weekStartDate).toLocaleDateString('de-DE')} – {
                              (() => {
                                const end = new Date(ts.weekStartDate);
                                end.setDate(end.getDate() + 6);
                                return end.toLocaleDateString('de-DE');
                              })()
                            }
                          </p>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <span className="block text-[10px] font-bold text-outline uppercase tracking-wider">Gesamtstunden</span>
                            <span className="font-mono font-bold text-secondary text-body-md">
                              {(ts.totalHours || 0).toFixed(2)} h
                            </span>
                          </div>

                          <div className="flex items-center gap-2 print:hidden">
                            {/* Expand daily details */}
                            <button
                              onClick={() => toggleExpandTimesheet(ts.id)}
                              className="p-1.5 rounded-lg border border-outline-variant text-outline hover:text-on-surface hover:bg-surface-container-low transition-all cursor-pointer"
                              title="Tägliche Stunden anzeigen"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {/* Export buttons */}
                            <button
                              onClick={() => downloadTsFile(ts.id, 'pdf')}
                              disabled={downloadingTs?.id === ts.id}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 transition-colors cursor-pointer"
                              title="PDF herunterladen"
                            >
                              {downloadingTs?.id === ts.id && downloadingTs?.fmt === 'pdf' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                            </button>

                            <button
                              onClick={() => downloadTsFile(ts.id, 'xlsx')}
                              disabled={downloadingTs?.id === ts.id}
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 transition-colors cursor-pointer"
                              title="Excel herunterladen"
                            >
                              {downloadingTs?.id === ts.id && downloadingTs?.fmt === 'xlsx' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileSpreadsheet className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Collapsible Details */}
                      {isExpanded && (
                        <div className="bg-surface-container-lowest/50 border-t border-outline-variant/60 p-4 animate-fadeIn">
                          {!details ? (
                            <div className="flex items-center gap-2 text-xs text-outline py-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-secondary" />
                              Lade Details...
                            </div>
                          ) : (
                            <div className="overflow-hidden border border-outline-variant/60 rounded-lg">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-surface-container-low/60 border-b border-outline-variant/50 text-[10px] font-bold text-outline uppercase tracking-wider">
                                    <th className="px-4 py-2">Tag</th>
                                    <th className="px-4 py-2">Datum</th>
                                    <th className="px-4 py-2">Von - Bis</th>
                                    <th className="px-4 py-2">Pause</th>
                                    <th className="px-4 py-2">Gesamt</th>
                                    <th className="px-4 py-2">Ort</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant/40 text-on-surface font-mono">
                                  {details.entries?.map((entry: any) => (
                                    <tr key={entry.id} className="hover:bg-surface-bright/30">
                                      <td className="px-4 py-2.5 font-bold font-sans">{entry.weekday}</td>
                                      <td className="px-4 py-2.5 text-outline">{new Date(entry.date).toLocaleDateString('de-DE')}</td>
                                      <td className="px-4 py-2.5">{entry.startTime} – {entry.endTime}</td>
                                      <td className="px-4 py-2.5 text-outline">{entry.breakMinutes} Min</td>
                                      <td className="px-4 py-2.5 font-bold text-secondary">{entry.totalHours.toFixed(2)} h</td>
                                      <td className="px-4 py-2.5 font-sans text-on-surface-variant">{entry.location || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
        </div>
      )}

      {/* Notification Toast */}
      {message.text && (
        <div
          className={`p-4 rounded-lg flex items-start gap-2.5 text-body-sm shadow-md animate-slideUp max-w-xl ${
            message.type === "success"
              ? "bg-emerald-100 border border-emerald-300 text-emerald-800"
              : "bg-error-container border border-error/20 text-error"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-error" />
          )}
          <div>
            <p className="font-bold">{message.type === "success" ? "Success" : "Error Occurred"}</p>
            <p className="text-[13px] opacity-90">{message.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
