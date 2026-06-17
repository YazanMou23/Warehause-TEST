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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const [report, setReport] = useState<ReportData | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchingReport, setFetchingReport] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    const loadEmployees = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const res = await fetch("http://localhost:3000/employees", { headers });
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
        ];
        setEmployees(mockEmployees);
        setSelectedEmployeeId(mockEmployees[0].id);
      } finally {
        setLoading(false);
      }
    };

    loadEmployees();
  }, [router]);

  const handleFetchReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedEmployeeId) return;

    setFetchingReport(true);
    setMessage({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      // Mock report generation
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
        `http://localhost:3000/attendance/monthly-report/${selectedEmployeeId}?year=${year}&month=${month}`,
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

  useEffect(() => {
    if (selectedEmployeeId) {
      handleFetchReport();
    }
  }, [selectedEmployeeId, month, year, isOffline]);

  const handlePrint = () => {
    window.print();
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
    <div className="space-y-stack-lg animate-fadeIn print:space-y-0 print:p-0">
      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h3 className="font-headline-lg font-bold text-on-surface">Staff Monthly Reports</h3>
          <p className="text-on-surface-variant font-body-sm">
            Generate and print verified timesheets for payroll log audits.
          </p>
        </div>
        
        {report && (
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
          <span>Offline mock active. Selected timesheets will use simulated database statistics.</span>
        </div>
      )}

      {/* Filter and Settings Panel */}
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
              <span className="text-lg font-black text-secondary">LogisticsOS</span>
              <p className="text-[10px] text-neutral-500 mt-1">Verified Digital Log</p>
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
                      <td className="px-4 py-3.5 font-mono text-on-surface">
                        {new Date(record.clockIn).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3.5 font-mono">
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
              <p className="text-[11px] text-neutral-400 font-mono">Report generated on: {new Date().toLocaleDateString()}</p>
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
