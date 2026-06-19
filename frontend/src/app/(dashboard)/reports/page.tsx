"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Printer,
  Calendar,
  Users,
  Clock,
  Briefcase,
  AlertTriangle,
  CheckCircle,
  FileText,
  TrendingUp,
  Activity,
  User,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { useTimeFormat, useDateTimeFormat } from "../../i18n/useDateFormat";

interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number | null;
  warehouseName: string;
  hallName: string;
}

interface ReportData {
  employee: Employee;
  month: number;
  year: number;
  totalHours: number;
  recordCount: number;
  records: AttendanceRecord[];
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"timesheets" | "activity">("timesheets");
  
  // Timesheet state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [month, setMonth] = useState(1);
  const [year, setYear] = useState(2026);
  const [report, setReport] = useState<ReportData | null>(null);
  const [fetchingReport, setFetchingReport] = useState(false);

  // Activity Log state
  const [logs, setLogs] = useState<any[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);
  
  // Activity Log Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ text: "", type: "" });
  const router = useRouter();

  // Load initial employees list
  const loadEmployees = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees`, { headers });
      const dataJson = res.ok ? await res.json() : null;
      const empList = dataJson && Array.isArray(dataJson.data) ? dataJson.data : (Array.isArray(dataJson) ? dataJson : []);
      const nonAdmin = empList.filter((u: any) => u.role !== "ADMIN");
      setEmployees(nonAdmin);
      if (nonAdmin.length > 0) {
        setSelectedEmployeeId(nonAdmin[0].id);
      }
      setIsOffline(false);
    } catch (err) {
      setIsOffline(true);
      const mockEmployees = [
        { id: "emp-1", name: "Johannes Müller", phone: "+491704444444", role: "EMPLOYEE" },
        { id: "emp-2", name: "Dieter Schmidt", phone: "+491705555555", role: "EMPLOYEE" },
        { id: "emp-3", name: "Anna Weber", phone: "+491706666666", role: "TEAM_LEADER" },
        { id: "emp-4", name: "M. Warehouse", phone: "+491701111111", role: "ADMIN" },
      ];
      setEmployees(mockEmployees.filter(e => e.role !== "ADMIN"));
      setSelectedEmployeeId(mockEmployees[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMonth(new Date().getMonth() + 1);
    setYear(new Date().getFullYear());
    loadEmployees();
  }, [router]);

  const handleFetchReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedEmployeeId) return;

    setFetchingReport(true);
    setMessage({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      setTimeout(() => {
        const selectedEmp = employees.find((emp) => emp.id === selectedEmployeeId);
        if (!selectedEmp) return;

        const mockRecords: AttendanceRecord[] = [
          {
            id: "att-1",
            date: `${year}-${String(month).padStart(2, "0")}-04`,
            clockIn: new Date(year, month - 1, 4, 8, 0).toISOString(),
            clockOut: new Date(year, month - 1, 4, 16, 30).toISOString(),
            totalHours: 8.5,
            warehouseName: "Duisburg Port Hub",
            hallName: "Hall A - Cold Storage",
          },
          {
            id: "att-2",
            date: `${year}-${String(month).padStart(2, "0")}-11`,
            clockIn: new Date(year, month - 1, 11, 8, 15).toISOString(),
            clockOut: new Date(year, month - 1, 11, 17, 0).toISOString(),
            totalHours: 8.75,
            warehouseName: "Duisburg Port Hub",
            hallName: "Hall A - Cold Storage",
          },
          {
            id: "att-3",
            date: `${year}-${String(month).padStart(2, "0")}-18`,
            clockIn: new Date(year, month - 1, 18, 7, 50).toISOString(),
            clockOut: new Date(year, month - 1, 18, 16, 20).toISOString(),
            totalHours: 8.5,
            warehouseName: "Duisburg Port Hub",
            hallName: "Hall A - Cold Storage",
          },
        ];

        setReport({
          employee: selectedEmp,
          month,
          year,
          totalHours: 25.75,
          recordCount: mockRecords.length,
          records: mockRecords,
        });
        setFetchingReport(false);
      }, 600);
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/monthly-report/${selectedEmployeeId}?year=${year}&month=${month}`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to generate report.");
      }

      setReport(data);
    } catch (err: any) {
      setMessage({ text: err.message || "Could not retrieve monthly timesheet.", type: "error" });
    } finally {
      setFetchingReport(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    const token = localStorage.getItem("accessToken");
    const headers = { Authorization: `Bearer ${token}` };
    try {
      if (isOffline) {
        const mockLogs = [
          { id: "log-1", timestamp: new Date().toISOString(), action: "CREATE_PLAN", details: "Created shift plan for Duisburg Hall A", user: { name: "Lars Leader" } },
          { id: "log-2", timestamp: new Date(Date.now() - 3600000).toISOString(), action: "UPDATE_USER", details: "Updated employee Anna Weber", user: { name: "M. Warehouse" } },
          { id: "log-3", timestamp: new Date(Date.now() - 86400000).toISOString(), action: "CLOCK_IN", details: "Clocked in at Wesel Hall B", user: { name: "Erik Employee" } },
        ];
        setLogs(mockLogs);
        setLogsTotalPages(1);
        return;
      }

      let queryParams = `page=${logsPage}&limit=12`;
      if (filterUserId) queryParams += `&userId=${filterUserId}`;
      if (filterAction) queryParams += `&action=${filterAction}`;
      if (filterStartDate) queryParams += `&startDate=${filterStartDate}`;
      if (filterEndDate) queryParams += `&endDate=${filterEndDate}`;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/action-logs?${queryParams}`, { headers });
      if (res.ok) {
        const json = await res.json();
        setLogs(json.data || []);
        setLogsTotalPages(json.meta?.totalPages || 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEmployeeId && activeTab === "timesheets") {
      handleFetchReport();
    }
  }, [selectedEmployeeId, month, year, isOffline, activeTab]);

  useEffect(() => {
    if (activeTab === "activity") {
      fetchLogs();
    }
  }, [activeTab, logsPage, filterUserId, filterAction, filterStartDate, filterEndDate, isOffline]);

  const handlePrint = () => {
    window.print();
  };

  const getActionBadgeClass = (action: string) => {
    if (action.startsWith("CREATE_")) return "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400";
    if (action.startsWith("UPDATE_")) return "bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400";
    if (action.startsWith("DEACTIVATE_") || action.startsWith("BULK_DEACTIVATE_")) return "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400";
    return "bg-surface-container-high text-on-surface-variant";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    );
  }

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div className="space-y-stack-lg animate-fadeIn print:space-y-0 print:p-0 text-on-background">
      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h3 className="font-headline-lg font-bold text-on-surface">Warehouse Reports</h3>
          <p className="text-on-surface-variant font-body-sm">
            Generate printable employee timesheets or view the system activity audit log.
          </p>
        </div>
        
        {activeTab === "timesheets" && report && (
          <button
            onClick={handlePrint}
            className="bg-secondary hover:bg-secondary/90 text-white font-bold px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <Printer className="w-5 h-5" />
            <span>Print Timesheet</span>
          </button>
        )}
      </div>

      {isOffline && (
        <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-2.5 rounded-lg flex items-center gap-2 text-label-md print:hidden">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline mock active. Reports and event logs will display simulated data.</span>
        </div>
      )}

      {/* Tabs Selector */}
      <div className="flex border-b border-outline-variant print:hidden">
        <button
          onClick={() => setActiveTab("timesheets")}
          className={`px-5 py-3 font-label-md uppercase tracking-wider font-bold border-b-2 transition-colors ${
            activeTab === "timesheets"
              ? "border-secondary text-secondary"
              : "border-transparent text-outline hover:text-on-surface"
          }`}
        >
          Employee Timesheets
        </button>
        <button
          onClick={() => {
            setActiveTab("activity");
            setLogsPage(1);
          }}
          className={`px-5 py-3 font-label-md uppercase tracking-wider font-bold border-b-2 transition-colors ${
            activeTab === "activity"
              ? "border-secondary text-secondary"
              : "border-transparent text-outline hover:text-on-surface"
          }`}
        >
          Activity Audit Log
        </button>
      </div>

      {/* TAB 1: Timesheets */}
      {activeTab === "timesheets" && (
        <div className="space-y-stack-lg print:space-y-4">
          {/* Filter Panel */}
          <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm print:hidden">
            <form onSubmit={handleFetchReport} className="grid grid-cols-1 md:grid-cols-4 gap-stack-md items-end">
              {/* Employee */}
              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Staff Member
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role.replace("_", " ")})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Month */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Select Month
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
                  >
                    {months.map((name, i) => (
                      <option key={i + 1} value={i + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Year */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Select Year
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
                  >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                  </select>
                </div>
              </div>
            </form>
          </div>

          {/* Report Summary Display */}
          {fetchingReport ? (
            <div className="flex flex-col items-center justify-center py-20 print:hidden">
              <Clock className="w-10 h-10 animate-spin text-secondary mb-3" />
              <p className="text-outline text-body-sm">Calculating database records and totals...</p>
            </div>
          ) : report ? (
            <div className="space-y-stack-md print:space-y-4">
              
              {/* Printable Report Header */}
              <div className="hidden print:flex justify-between items-center border-b-2 border-primary pb-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-black">LogiFlow Timesheet Report</h1>
                  <p className="text-xs text-neutral-500 uppercase tracking-widest font-semibold mt-1">
                    Month: {months[report.month - 1]} {report.year}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-secondary">LogiFlow</span>
                  <p className="text-[10px] text-neutral-500 mt-1">Verified Digital Shift Log</p>
                </div>
              </div>

              {/* Employee Meta Card */}
              <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:border-none print:shadow-none print:p-0">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-secondary/10 text-secondary flex items-center justify-center rounded-lg font-bold text-xl shrink-0 print:border print:border-neutral-200">
                    {report.employee.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <h4 className="font-bold text-body-lg text-on-surface">{report.employee.name}</h4>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[13px] text-on-surface-variant font-medium">
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-4 h-4 text-outline" /> {report.employee.role.replace("_", " ")}
                      </span>
                      <span className="text-outline-variant hidden sm:inline">|</span>
                      <span className="font-mono text-outline">{report.employee.phone}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 self-stretch md:self-auto border-t border-outline-variant md:border-t-0 pt-3 md:pt-0 print:border-none print:pt-0">
                  <div className="flex-1 text-center md:text-right md:border-r border-outline-variant pr-4 print:pr-2">
                    <span className="block text-[11px] font-bold text-outline uppercase tracking-wider">Total Worked</span>
                    <span className="font-mono text-2xl font-black text-secondary print:text-black">{report.totalHours} hrs</span>
                  </div>
                  <div className="flex-1 text-center md:text-right">
                    <span className="block text-[11px] font-bold text-outline uppercase tracking-wider">Completed Shifts</span>
                    <span className="font-mono text-2xl font-black text-on-surface">{report.recordCount}</span>
                  </div>
                </div>
              </div>

              {/* Quick Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-stack-md print:grid-cols-3 print:gap-4 print:hidden">
                <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-lg flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary/15 text-secondary flex items-center justify-center rounded-lg">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold text-outline uppercase tracking-wider">Avg Shift Length</span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">
                      {report.recordCount > 0
                        ? `${(report.totalHours / report.recordCount).toFixed(2)} hrs`
                        : "0 hrs"}
                    </span>
                  </div>
                </div>

                <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-lg flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary/15 text-secondary flex items-center justify-center rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold text-outline uppercase tracking-wider">Target Hours</span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">160 hrs</span>
                  </div>
                </div>

                <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-lg flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary/15 text-secondary flex items-center justify-center rounded-lg">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold text-outline uppercase tracking-wider">Monthly Progress</span>
                    <span className="font-mono text-body-lg font-bold text-emerald-700">
                      {Math.min(Math.round((report.totalHours / 160) * 100), 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Timesheet List Table */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm print:border-none print:shadow-none">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider print:bg-neutral-100 print:text-black">
                      <th className="px-container-margin py-3">Work Date</th>
                      <th className="px-4 py-3">Depot Location</th>
                      <th className="px-4 py-3">Clock In</th>
                      <th className="px-4 py-3">Clock Out</th>
                      <th className="px-container-margin py-3 text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface print:text-xs">
                    {report.records.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-outline font-medium">
                          No shift records registered for this monthly slot.
                        </td>
                      </tr>
                    ) : (
                      report.records.map((record) => (
                        <tr key={record.id} className="hover:bg-surface-bright transition-colors">
                          <td className="px-container-margin py-3.5 font-bold font-mono">
                            {record.date}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-on-surface">{record.warehouseName}</div>
                            <div className="text-[12px] text-outline print:text-[10px]">{record.hallName}</div>
                          </td>
                          <td suppressHydrationWarning className="px-4 py-3.5 font-mono text-on-surface">
                            {new Date(record.clockIn).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td suppressHydrationWarning className="px-4 py-3.5 font-mono">
                            {record.clockOut ? (
                              new Date(record.clockOut).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            ) : (
                              <span className="text-amber-600 font-semibold uppercase tracking-wider text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 print:border-none print:p-0">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-container-margin py-3.5 text-right font-mono font-bold text-secondary print:text-black">
                            {record.totalHours !== null ? `${record.totalHours.toFixed(2)} hrs` : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Printable Signature Line */}
              <div className="hidden print:flex justify-between items-end mt-16 pt-8 border-t border-dashed border-neutral-300">
                <div>
                  <p suppressHydrationWarning className="text-[11px] text-neutral-400 font-mono">Report generated on: {new Date().toLocaleDateString()}</p>
                </div>
                <div className="text-center w-64 border-t border-neutral-400 pt-2">
                  <span className="text-xs font-semibold text-neutral-600">Supervisor Signature / Date</span>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white border border-outline-variant p-stack-lg rounded-lg text-center text-outline text-body-sm print:hidden">
              Please select a staff member to display timesheet report.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Activity Audit Log */}
      {activeTab === "activity" && (
        <div className="space-y-stack-lg">
          {/* Activity Filters */}
          <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-stack-md">
            
            {/* User Filter */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                Filter by User
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <select
                  value={filterUserId}
                  onChange={(e) => {
                    setFilterUserId(e.target.value);
                    setLogsPage(1);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none appearance-none font-bold"
                >
                  <option value="">All Users</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Type Filter */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                Filter by Action
              </label>
              <div className="relative">
                <Activity className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <select
                  value={filterAction}
                  onChange={(e) => {
                    setFilterAction(e.target.value);
                    setLogsPage(1);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none appearance-none font-bold"
                >
                  <option value="">All Actions</option>
                  <option value="CREATE_PLAN">Create Shift Plan</option>
                  <option value="UPDATE_PLAN">Update Shift Plan</option>
                  <option value="DEACTIVATE_PLAN">Delete Shift Plan</option>
                  <option value="CREATE_USER">Create Employee</option>
                  <option value="UPDATE_USER">Update Employee</option>
                  <option value="DEACTIVATE_USER">Delete Employee</option>
                  <option value="CLOCK_IN">Clock In Attendance</option>
                  <option value="CLOCK_OUT">Clock Out Attendance</option>
                </select>
              </div>
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                Start Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => {
                    setFilterStartDate(e.target.value);
                    setLogsPage(1);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none font-bold"
                />
              </div>
            </div>

            {/* End Date */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                End Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => {
                    setFilterEndDate(e.target.value);
                    setLogsPage(1);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none font-bold"
                />
              </div>
            </div>

          </div>

          {/* Audit Logs Table */}
          {logsLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Clock className="w-10 h-10 animate-spin text-secondary mb-3" />
              <p className="text-outline text-body-sm">Loading activity logs...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider">
                      <th className="px-container-margin py-3">Timestamp</th>
                      <th className="px-4 py-3">User Account</th>
                      <th className="px-4 py-3">Action Type</th>
                      <th className="px-container-margin py-3">Details / Changes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-outline font-medium">
                          No audit events matching criteria registered.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-surface-bright transition-colors">
                          <td suppressHydrationWarning className="px-container-margin py-3.5 font-mono text-[12px] text-outline">
                            {new Date(log.timestamp).toLocaleString('en-CA')}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-on-surface">
                            {log.user?.name || "System Automated"}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`px-2.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider ${getActionBadgeClass(log.action)}`}>
                              {log.action.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-container-margin py-3.5 text-on-surface-variant max-w-md break-words">
                            {log.details}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Logs Pagination controls */}
              {logsTotalPages > 1 && (
                <div className="flex justify-between items-center bg-white border border-outline-variant p-3.5 rounded-lg shadow-sm">
                  <button
                    disabled={logsPage === 1}
                    onClick={() => setLogsPage(prev => Math.max(prev - 1, 1))}
                    className="flex items-center gap-1 text-label-md font-bold uppercase tracking-wider text-secondary disabled:opacity-30 transition-opacity"
                  >
                    <ArrowLeft className="w-4 h-4" /> Previous
                  </button>
                  <span className="text-body-sm font-semibold text-outline font-mono">
                    Page {logsPage} of {logsTotalPages}
                  </span>
                  <button
                    disabled={logsPage === logsTotalPages}
                    onClick={() => setLogsPage(prev => Math.min(prev + 1, logsTotalPages))}
                    className="flex items-center gap-1 text-label-md font-bold uppercase tracking-wider text-secondary disabled:opacity-30 transition-opacity"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toast Notification */}
      {message.text && (
        <div
          className={`p-4 rounded-lg flex items-start gap-2.5 text-body-sm shadow-md animate-slideUp max-w-xl print:hidden ${
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
