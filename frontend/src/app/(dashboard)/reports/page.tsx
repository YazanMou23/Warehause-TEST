"use client";
import { useTranslation } from "../../i18n/LanguageContext";

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
 const { t, locale } = useTranslation();
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


  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [generatedOn, setGeneratedOn] = useState("");
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
    } catch (err) {
      console.error("Failed to load employees:", err);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    setMonth(now.getMonth() + 1);
    setYear(now.getFullYear());
    setGeneratedOn(now.toISOString());
    loadEmployees();
  }, [router]);

  const handleFetchReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedEmployeeId) return;

    setFetchingReport(true);
    setMessage({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/monthly-report/${selectedEmployeeId}?year=${year}&month=${month}`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t("inventory1656"));
      }

      setReport(data);
    } catch (err: any) {
      setMessage({ text: err.message || t("inventory1657"), type: "error" });
    } finally {
      setFetchingReport(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    const token = localStorage.getItem("accessToken");
    const headers = { Authorization: `Bearer ${token}` };
    try {
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
  }, [selectedEmployeeId, month, year, activeTab]);

  useEffect(() => {
    if (activeTab === "activity") {
      fetchLogs();
    }
  }, [activeTab, logsPage, filterUserId, filterAction, filterStartDate, filterEndDate]);

  const handlePrint = () => {
    window.print();
  };

  const actionLabels: Record<string, string> = { "CREATE_PLAN": t("inventory1638"), "UPDATE_PLAN": t("inventory1639"), "DEACTIVATE_PLAN": t("inventory1640"), "CREATE_USER": t("inventory1641"), "UPDATE_USER": t("inventory1642"), "DEACTIVATE_USER": t("inventory1643"), "CLOCK_IN": t("inventory1644"), "CLOCK_OUT": t("inventory1645") };

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

  const months = Array.from({ length: 12 }, (_, month) => new Date(2026, month, 1).toLocaleDateString(locale, { month: "long" }));


  return (
    <div className="space-y-stack-lg animate-fadeIn print:space-y-0 print:p-0 text-on-background">
      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h3 className="font-headline-lg font-bold text-on-surface"> {t("inventory1607")} </h3>
          <p className="text-on-surface-variant font-body-sm">
             {t("inventory1608")} </p>
        </div>
        
        {activeTab === "timesheets" && report && (
          <button
            onClick={handlePrint}
            className="bg-secondary hover:bg-secondary/90 text-white font-bold px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <Printer className="w-5 h-5" />
            <span> {t("inventory1609")} </span>
          </button>
        )}
      </div>



      {/* Tabs Selector */}
      <div className="flex border-b border-outline-variant print:hidden">
        <button
          onClick={() => setActiveTab("timesheets")}
          className={`px-5 py-3 font-label-md uppercase tracking-wider font-bold border-b-2 transition-colors ${
            activeTab === "timesheets"
              ? "border-secondary text-secondary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          }`}
        >
           {t("inventory1610")} </button>
        <button
          onClick={() => {
            setActiveTab("activity");
            setLogsPage(1);
          }}
          className={`px-5 py-3 font-label-md uppercase tracking-wider font-bold border-b-2 transition-colors ${
            activeTab === "activity"
              ? "border-secondary text-secondary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          }`}
        >
           {t("inventory1611")} </button>
      </div>

      {/* TAB 1: Timesheets */}
      {activeTab === "timesheets" && (
        <div className="space-y-stack-lg print:space-y-4">
          {/* Filter Panel */}
          <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm print:hidden">
            <form onSubmit={handleFetchReport} className="grid grid-cols-1 md:grid-cols-4 gap-stack-md items-end">
              {/* Employee */}
              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                   {t("inventory1612")} </label>
                <div className="relative">
                  <Users className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg ps-10 pe-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role === "MANAGER" ? t("roleManager") : emp.role === "ADMIN" ? t("staff924") : t("roleEmployee")})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Month */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                   {t("inventory1613")} </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg ps-10 pe-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
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
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                   {t("inventory1614")} </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg ps-10 pe-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
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
              <p className="text-on-surface-variant text-body-sm"> {t("inventory1615")} </p>
            </div>
          ) : report ? (
            <div className="space-y-stack-md print:space-y-4">
              
              {/* Printable Report Header */}
              <div className="hidden print:flex justify-between items-center border-b-2 border-primary pb-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-black"> {t("inventory1616")} </h1>
                  <p className="text-xs text-neutral-600 uppercase tracking-widest font-semibold mt-1">
                     {t("inventory1617")} {months[report.month - 1]} {report.year}
                  </p>
                </div>
                <div className="text-end">
                  <span className="text-lg font-black text-secondary"> {t("appName")} </span>
                  <p className="text-[10px] text-neutral-600 mt-1"> {t("inventory1618")} </p>
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
                        <Briefcase className="w-4 h-4 text-on-surface-variant" /> {report.employee.role === "MANAGER" ? t("roleManager") : report.employee.role === "ADMIN" ? t("staff924") : t("roleEmployee")}
                      </span>
                      <span className="text-on-surface-variant hidden sm:inline">|</span>
                      <span dir="ltr" className="font-mono text-on-surface-variant">{report.employee.phone}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 self-stretch md:self-auto border-t border-outline-variant md:border-t-0 pt-3 md:pt-0 print:border-none print:pt-0">
                  <div className="flex-1 text-center md:text-end md:border-e border-outline-variant pe-4 print:pr-2">
                    <span className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider"> {t("inventory1619")} </span>
                    <span className="font-mono text-2xl font-black text-secondary print:text-black">{report.totalHours}  {t("inventory1620")} </span>
                  </div>
                  <div className="flex-1 text-center md:text-end">
                    <span className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider"> {t("inventory1621")} </span>
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
                    <span className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider"> {t("inventory1622")} </span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">
                      {report.recordCount > 0
                        ? `${(report.totalHours / report.recordCount).toFixed(2)} ${t("inventory1620")}`
                        : `0 ${t("inventory1620")}`}
                    </span>
                  </div>
                </div>

                <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-lg flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary/15 text-secondary flex items-center justify-center rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider"> {t("inventory1623")} </span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">160 {t("inventory1620")}</span>
                  </div>
                </div>

                <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-lg flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary/15 text-secondary flex items-center justify-center rounded-lg">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider"> {t("inventory1624")} </span>
                    <span className="font-mono text-body-lg font-bold text-emerald-700">
                      {Math.min(Math.round((report.totalHours / 160) * 100), 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Timesheet List Table */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-x-auto shadow-sm print:border-none print:shadow-none">
                <table className="w-full min-w-[650px] print:min-w-0 text-start border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-on-surface-variant uppercase tracking-wider print:bg-neutral-100 print:text-black">
                      <th className="px-container-margin py-3"> {t("inventory1625")} </th>
                      <th className="px-4 py-3"> {t("inventory1626")} </th>
                      <th className="px-4 py-3"> {t("inventory1627")} </th>
                      <th className="px-4 py-3"> {t("inventory1628")} </th>
                      <th className="px-container-margin py-3 text-end"> {t("inventory1629")} </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface print:text-xs">
                    {report.records.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-on-surface-variant font-medium">
                           {t("inventory1630")} </td>
                      </tr>
                    ) : (
                      report.records.map((record) => (
                        <tr key={record.id} className="hover:bg-surface-bright transition-colors">
                          <td className="px-container-margin py-3.5 font-bold font-mono">
                            {new Date(record.date).toLocaleDateString(locale)}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-on-surface">{record.warehouseName}</div>
                            <div className="text-[12px] text-on-surface-variant print:text-[10px]">{record.hallName}</div>
                          </td>
                          <td suppressHydrationWarning className="px-4 py-3.5 font-mono text-on-surface">
                            {new Date(record.clockIn).toLocaleTimeString(locale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td suppressHydrationWarning className="px-4 py-3.5 font-mono">
                            {record.clockOut ? (
                              new Date(record.clockOut).toLocaleTimeString(locale, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            ) : (
                              <span className="text-amber-800 font-semibold uppercase tracking-wider text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 print:border-none print:p-0">
                                {t("active")}
                              </span>
                            )}
                          </td>
                          <td className="px-container-margin py-3.5 text-end font-mono font-bold text-secondary print:text-black">
                            {record.totalHours !== null ? `${record.totalHours.toFixed(2)} ${t("inventory1620")}` : "-"}
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
                  <p className="text-[11px] text-neutral-600 font-mono"> {t("inventory1631")} {generatedOn ? new Date(generatedOn).toLocaleDateString(locale) : ""}</p>
                </div>
                <div className="text-center w-64 border-t border-neutral-400 pt-2">
                  <span className="text-xs font-semibold text-neutral-600"> {t("inventory1632")} </span>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white border border-outline-variant p-stack-lg rounded-lg text-center text-on-surface-variant text-body-sm print:hidden">
               {t("inventory1633")} </div>
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
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                 {t("inventory1634")} </label>
              <div className="relative">
                <User className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <select
                  value={filterUserId}
                  onChange={(e) => {
                    setFilterUserId(e.target.value);
                    setLogsPage(1);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg ps-10 pe-3 py-2 text-body-sm text-on-surface outline-none appearance-none font-bold"
                >
                  <option value=""> {t("inventory1635")} </option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Type Filter */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                 {t("inventory1636")} </label>
              <div className="relative">
                <Activity className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <select
                  value={filterAction}
                  onChange={(e) => {
                    setFilterAction(e.target.value);
                    setLogsPage(1);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg ps-10 pe-3 py-2 text-body-sm text-on-surface outline-none appearance-none font-bold"
                >
                  <option value=""> {t("inventory1637")} </option>
                  <option value="CREATE_PLAN"> {t("inventory1638")} </option>
                  <option value="UPDATE_PLAN"> {t("inventory1639")} </option>
                  <option value="DEACTIVATE_PLAN"> {t("inventory1640")} </option>
                  <option value="CREATE_USER"> {t("inventory1641")} </option>
                  <option value="UPDATE_USER"> {t("inventory1642")} </option>
                  <option value="DEACTIVATE_USER"> {t("inventory1643")} </option>
                  <option value="CLOCK_IN"> {t("inventory1644")} </option>
                  <option value="CLOCK_OUT"> {t("inventory1645")} </option>
                </select>
              </div>
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                 {t("inventory1646")} </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => {
                    setFilterStartDate(e.target.value);
                    setLogsPage(1);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg ps-10 pe-3 py-2 text-body-sm text-on-surface outline-none font-bold"
                />
              </div>
            </div>

            {/* End Date */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                 {t("inventory1647")} </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => {
                    setFilterEndDate(e.target.value);
                    setLogsPage(1);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg ps-10 pe-3 py-2 text-body-sm text-on-surface outline-none font-bold"
                />
              </div>
            </div>

          </div>

          {/* Audit Logs Table */}
          {logsLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Clock className="w-10 h-10 animate-spin text-secondary mb-3" />
              <p className="text-on-surface-variant text-body-sm"> {t("inventory1648")} </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-x-auto shadow-sm">
                <table className="w-full min-w-[650px] print:min-w-0 text-start border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      <th className="px-container-margin py-3"> {t("inventory1649")} </th>
                      <th className="px-4 py-3"> {t("inventory1650")} </th>
                      <th className="px-4 py-3"> {t("inventory1651")} </th>
                      <th className="px-container-margin py-3"> {t("inventory1652")} </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-on-surface-variant font-medium">
                           {t("inventory1653")} </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-surface-bright transition-colors">
                          <td suppressHydrationWarning className="px-container-margin py-3.5 font-mono text-[12px] text-on-surface-variant">
                            {new Date(log.timestamp).toLocaleString(locale)}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-on-surface">
                            {log.user?.name || t("inventory1654")}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`px-2.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider ${getActionBadgeClass(log.action)}`}>
                              {actionLabels[log.action] || log.action.replaceAll("_", " ")}
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
                    <ArrowLeft className="w-4 h-4" />  {t("staff1085")} </button>
                  <span className="text-body-sm font-semibold text-on-surface-variant font-mono">
                     {t("ui402")} {logsPage} {t("ui435")} {logsTotalPages}
                  </span>
                  <button
                    disabled={logsPage === logsTotalPages}
                    onClick={() => setLogsPage(prev => Math.min(prev + 1, logsTotalPages))}
                    className="flex items-center gap-1 text-label-md font-bold uppercase tracking-wider text-secondary disabled:opacity-30 transition-opacity"
                  >
                     {t("staff1086")} <ArrowRight className="w-4 h-4" />
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
            <p className="font-bold">{message.type === "success" ? t("success") : t("inventory1655")}</p>
            <p className="text-[13px] opacity-90">{message.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
