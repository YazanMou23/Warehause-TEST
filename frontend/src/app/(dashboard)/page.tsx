"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Warehouse,
  Grid,
  Package,
  ArrowRight,
  TrendingUp,
  Activity,
  PlusCircle,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  Calendar,
  X,
  Printer,
  Download,
  CheckSquare,
  Square,
  Trash2,
  Clock,
  User,
  FileText,
  Shield,
  LogIn,
  LogOut,
  MapPin,
  UserCheck,
  History,
  Smartphone,
  Mail,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

interface Metrics {
  employeesCount: number;
  activeTodayCount: number;
  containersCount: number;
  hallsCount: number;
}

interface PlanItem {
  id: string;
  date: string;
  warehouseId: string;
  warehouseName: string;
  hallId: string;
  hallName: string;
  assignedEmployees: any[];
  assignedContainers: any[];
}

export default function DashboardPage() {
  const { t, language } = useTranslation();
  const [metrics, setMetrics] = useState<Metrics>({
    employeesCount: 0,
    activeTodayCount: 0,
    containersCount: 0,
    hallsCount: 0,
  });
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [selectedPlanForView, setSelectedPlanForView] = useState<PlanItem | null>(null);
  const [todayStr, setTodayStr] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [userRole, setUserRole] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Employee Dashboard States
  const [employeeSummary, setEmployeeSummary] = useState<any>(null);
  const [employeeInfo, setEmployeeInfo] = useState<any>(null);
  const [clockInWarehouseId, setClockInWarehouseId] = useState("");
  const [clockInHallId, setClockInHallId] = useState("");
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [allHalls, setAllHalls] = useState<any[]>([]);
  const [clockLoading, setClockLoading] = useState(false);

  // Manager/Admin Dashboard States
  const [recentActivityLogs, setRecentActivityLogs] = useState<any[]>([]);

  const handleExportCSV = (plan: PlanItem) => {
    if (!plan) return;

    let csvContent = "";
    
    // Title & Metadata
    csvContent += `LOGIFLOW SHIFT OPERATIONS PLAN\n`;
    csvContent += `Date,${new Date(plan.date).toLocaleDateString('en-CA')}\n`;
    csvContent += `Warehouse,${plan.warehouseName}\n`;
    csvContent += `Staging Hall,${plan.hallName}\n\n`;

    // Staff Roster
    csvContent += `ASSIGNED STAFF ROSTER\n`;
    csvContent += `Employee Name,Role,Phone\n`;
    if (plan.assignedEmployees && plan.assignedEmployees.length > 0) {
      plan.assignedEmployees.forEach((emp) => {
        csvContent += `"${emp.name}","${emp.role}","${emp.phone || ''}"\n`;
      });
    } else {
      csvContent += `No staff assigned,\n`;
    }
    csvContent += `\n`;

    // Container Routing
    csvContent += `ROUTED CONTAINERS QUEUE\n`;
    csvContent += `Container Number,Status\n`;
    if (plan.assignedContainers && plan.assignedContainers.length > 0) {
      plan.assignedContainers.forEach((c) => {
        csvContent += `"${c.containerNumber || 'N/A'}","${c.status || 'N/A'}"\n`;
      });
    } else {
      csvContent += `No containers routed,\n`;
    }

    // Download Trigger
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = `plan_${plan.warehouseName.replace(/\s+/g, "_")}_${plan.hallName.replace(/\s+/g, "_")}_${plan.date.split("T")[0]}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchPlans = async (date: string, showAll: boolean) => {
    setPlansLoading(true);
    const token = localStorage.getItem("accessToken");
    const headers = { Authorization: `Bearer ${token}` };
    try {
      if (isOffline) {
        // Mock fallback plans
        const mockPlans = [
          {
            id: "mock-p-1",
            date: new Date().toISOString(),
            warehouseId: "wh-1",
            warehouseName: "Duisburg Port Hub",
            hallId: "hall-1",
            hallName: "Hall A",
            assignedEmployees: [{ id: "u2", name: "Emil Employee", role: "EMPLOYEE" }, { id: "u3", name: "Elsa Employee", role: "EMPLOYEE" }],
            assignedContainers: [{ containerNumber: "MSKU887652", status: "FULL" }],
          },
          {
            id: "mock-p-2",
            date: new Date().toISOString(),
            warehouseId: "wh-2",
            warehouseName: "Wesel NRW-North",
            hallId: "hall-3",
            hallName: "Hall A",
            assignedEmployees: [{ id: "u5", name: "Erik Employee", role: "EMPLOYEE" }],
            assignedContainers: [],
          },
        ];
        
        if (showAll) {
          setPlans(mockPlans);
        } else {
          setPlans(mockPlans.filter(p => p.date.split("T")[0] === date));
        }
        return;
      }

      let url = "";
      if (showAll) {
        url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning?limit=100`;
      } else {
        url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/query?date=${date}`;
      }
      const res = await fetch(url, { headers });
      const data = res.ok ? await res.json() : [];
      const plansList = showAll ? (data.data || []) : data;
      setPlans(plansList);
    } catch (e) {
      console.error("Failed to fetch plans", e);
    } finally {
      setPlansLoading(false);
    }
  };

  const handleBulkDeletePlans = async () => {
    if (selectedPlanIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedPlanIds.length} selected plan(s)?`)) {
      return;
    }

    const token = localStorage.getItem("accessToken");
    try {
      if (isOffline) {
        setPlans(prev => prev.filter(p => !selectedPlanIds.includes(p.id)));
        setSelectedPlanIds([]);
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/bulk`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selectedPlanIds }),
      });

      if (res.ok) {
        setSelectedPlanIds([]);
        fetchPlans(selectedDate, showAllPlans);
      } else {
        alert("Failed to delete plans");
      }
    } catch (e) {
      console.error(e);
      alert("Error deleting plans");
    }
  };

  const handleClockInOut = async () => {
    if (!employeeSummary) return;
    setClockLoading(true);
    const token = localStorage.getItem("accessToken");
    const headers = { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}` 
    };

    try {
      if (employeeSummary.activeShift) {
        // Clock Out
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/clock-out`, {
          method: "POST",
          headers,
          body: JSON.stringify({ employeeId: employeeInfo.id }),
        });
        if (res.ok) {
          alert("Successfully clocked out!");
          window.location.reload();
        } else {
          const data = await res.json();
          alert(data.message || "Failed to clock out");
        }
      } else {
        // Clock In
        if (!clockInWarehouseId || !clockInHallId) {
          alert("Please select a warehouse and hall to clock in.");
          setClockLoading(false);
          return;
        }
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/clock-in`, {
          method: "POST",
          headers,
          body: JSON.stringify({ 
            employeeId: employeeInfo.id,
            warehouseId: clockInWarehouseId,
            hallId: clockInHallId
          }),
        });
        if (res.ok) {
          alert("Successfully clocked in!");
          window.location.reload();
        } else {
          const data = await res.json();
          alert(data.message || "Failed to clock in");
        }
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred during clock action");
    } finally {
      setClockLoading(false);
    }
  };

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA');
    setTodayStr(today);
    setSelectedDate(today);

    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    let payload: any = {};
    try {
      payload = JSON.parse(atob(token.split(".")[1]));
      setUserRole(payload.role || "");
    } catch (e) {}

    const fetchDashboardData = async () => {
      const headers = { Authorization: `Bearer ${token}` };
      
      try {
        if (payload.role === "EMPLOYEE") {
          // Employee dashboard data
          const empSummaryRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${payload.sub}/dashboard-summary`, { headers });
          const summaryJson = empSummaryRes.ok ? await empSummaryRes.json() : null;
          
          const empInfoRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${payload.sub}`, { headers });
          const infoJson = empInfoRes.ok ? await empInfoRes.json() : null;

          const whsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, { headers });
          const whsJson = whsRes.ok ? await whsRes.json() : null;
          setAllWarehouses(whsJson?.data || []);

          const hallsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, { headers });
          const hallsJson = hallsRes.ok ? await hallsRes.json() : null;
          setAllHalls(hallsJson?.data || []);

          if (summaryJson && infoJson) {
            setEmployeeSummary(summaryJson);
            setEmployeeInfo(infoJson);
            setIsOffline(false);
          } else {
            throw new Error("Failed to fetch employee details");
          }
        } else {
          // Admin/Manager dashboard data
          const usersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees`, { headers });
          const usersJson = usersRes.ok ? await usersRes.json() : null;
          const usersList = usersJson && Array.isArray(usersJson.data) ? usersJson.data : [];

          const containersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers`, { headers });
          const containersJson = containersRes.ok ? await containersRes.json() : null;
          const containersList = containersJson && Array.isArray(containersJson.data) ? containersJson.data : [];

          const hallsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, { headers });
          const hallsJson = hallsRes.ok ? await hallsRes.json() : null;
          const hallsList = hallsJson && Array.isArray(hallsJson.data) ? hallsJson.data : [];

          const attendanceRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/daily`, { headers });
          const attendanceData = attendanceRes.ok ? await attendanceRes.json() : [];

          setMetrics({
            employeesCount: usersList.length || 12,
            activeTodayCount: Array.isArray(attendanceData) ? attendanceData.length : 4,
            containersCount: containersList.length || 32,
            hallsCount: hallsList.length || 6,
          });

          if (payload.role === "MANAGER") {
            const logsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/action-logs?limit=50`, { headers });
            const logsJson = logsRes.ok ? await logsRes.json() : null;
            setRecentActivityLogs(logsJson?.data || []);
          }

          setIsOffline(false);
        }
      } catch (err) {
        console.warn("Failed to fetch live API metrics, using offline mock database.");
        setIsOffline(true);

        if (payload.role === "EMPLOYEE") {
          setEmployeeInfo({
            id: payload.sub || "emp-mock",
            username: payload.username || "employee1",
            name: payload.name || "Emil Employee",
            phone: "+491704444444",
            email: "e.employee@logiflow.de",
            role: "EMPLOYEE",
            warehouse: { name: "Duisburg Port Hub" },
            hall: { name: "Hall A" },
          });

          setEmployeeSummary({
            activeShift: null,
            hoursSummary: { today: 6.5, week: 38.5, month: 142.0 },
            plansToday: [
              {
                id: "mock-p-1",
                date: new Date().toISOString(),
                warehouseName: "Duisburg Port Hub",
                hallName: "Hall A",
                assignedContainers: [{ containerNumber: "MSKU887652", status: "FULL" }],
                assignedEmployees: [{ name: "Emil Employee", role: "EMPLOYEE" }],
              }
            ],
            plansHistory: [
              {
                id: "mock-p-old-1",
                date: new Date(Date.now() - 86400000).toISOString(),
                warehouseName: "Duisburg Port Hub",
                hallName: "Hall A",
                assignedContainers: [{ containerNumber: "MSKU112233", status: "EMPTY" }],
                assignedEmployees: [{ name: "Emil Employee", role: "EMPLOYEE" }],
              }
            ],
            workHistory: [
              {
                id: "att-1",
                date: new Date(Date.now() - 86400000).toISOString(),
                clockIn: new Date(Date.now() - 86400000 - 8*3600000).toISOString(),
                clockOut: new Date(Date.now() - 86400000).toISOString(),
                totalHours: 8.0,
                warehouseName: "Duisburg Port Hub",
                hallName: "Hall A",
              }
            ],
          });

          setAllWarehouses([
            { id: "wh-1", name: "Duisburg Port Hub" },
            { id: "wh-2", name: "Wesel NRW-North" }
          ]);
          setAllHalls([
            { id: "hall-1", warehouseId: "wh-1", name: "Hall A" },
            { id: "hall-2", warehouseId: "wh-1", name: "Hall B" },
            { id: "hall-3", warehouseId: "wh-2", name: "Hall A" }
          ]);
        } else {
          setMetrics({
            employeesCount: 450,
            activeTodayCount: 382,
            containersCount: 180,
            hallsCount: 18,
          });

          if (payload.role === "MANAGER") {
            setRecentActivityLogs([
              { id: "log-1", timestamp: new Date().toISOString(), action: "LOGIN", user: { name: "Admin User", username: "admin" }, details: "User Admin User logged in" },
              { id: "log-2", timestamp: new Date(Date.now() - 600000).toISOString(), action: "CREATE_PLAN", user: { name: "Lars Leader", username: "manager" }, details: "Created shift plan for Duisburg Port Hub" },
              { id: "log-3", timestamp: new Date(Date.now() - 3600000).toISOString(), action: "ROLE_CHANGE", user: { name: "Lars Leader", username: "manager" }, details: "Promoted Emil Employee to ADMIN" },
              { id: "log-4", timestamp: new Date(Date.now() - 7200000).toISOString(), action: "CREDENTIAL_CHANGE", user: { name: "Lars Leader", username: "manager" }, details: "Updated password for user Elsa Employee" },
            ]);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [router]);

  useEffect(() => {
    if (selectedDate && userRole !== "EMPLOYEE") {
      fetchPlans(selectedDate, showAllPlans);
    }
  }, [selectedDate, showAllPlans, isOffline, userRole]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    );
  }

  const canManage = userRole === "ADMIN" || userRole === "MANAGER";

  return (
    <div className="space-y-stack-lg animate-fadeIn">
      
      {/* 1. EMPLOYEE DASHBOARD */}
      {userRole === "EMPLOYEE" ? (
        <div className="space-y-stack-lg print:hidden">
          {/* Welcome Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-headline-lg font-bold text-on-surface">
                {t("employeeDashboard")}
              </h3>
              <p className="text-on-surface-variant font-body-sm">
                {t("welcomeBack")}, <span className="font-semibold text-primary">{employeeInfo?.name || "Mitarbeiter"}</span>. {t("manageShiftsDesc")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {employeeSummary?.activeShift ? (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3.5 py-1.5 rounded-lg flex items-center gap-2 text-label-md shadow-sm animate-pulse">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full"></span> {t("clockedIn")}
                </span>
              ) : (
                <span className="bg-error-container/20 text-error border border-error/20 px-3.5 py-1.5 rounded-lg flex items-center gap-2 text-label-md shadow-sm">
                  <span className="w-2 h-2 bg-error rounded-full"></span> {t("clockedOut")}
                </span>
              )}
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-stack-md">
            {/* Left Side: Clock Widget, Stats & Profile */}
            <div className="lg:col-span-1 space-y-stack-md">
              
              {/* Clock In / Clock Out Card */}
              <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-xl shadow-sm space-y-4">
                <h4 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
                  <Clock className="w-5 h-5 text-secondary" /> {t("timeTracking")}
                </h4>
                
                {employeeSummary?.activeShift ? (
                  <div className="space-y-4">
                    <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 space-y-2">
                      <p className="text-xs text-outline uppercase tracking-wider font-bold">{t("currentShift")}</p>
                      <p className="font-bold text-on-surface">{employeeSummary.activeShift.warehouseName}</p>
                      <p className="text-body-sm text-on-surface-variant">{employeeSummary.activeShift.hallName}</p>
                      <p className="text-body-sm text-outline flex items-center gap-1.5 mt-2">
                        <LogIn className="w-4 h-4 text-emerald-400" />
                        {language === "de" ? "Seit" : "Since"} {new Date(employeeSummary.activeShift.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {language === "de" ? "Uhr" : ""}
                      </p>
                    </div>
                    <button
                      onClick={handleClockInOut}
                      disabled={clockLoading}
                      className="w-full bg-error hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {clockLoading ? (language === "de" ? "Wird verarbeitet..." : "Processing...") : t("clockOutButton")}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
                        {t("selectWarehouse")}
                      </label>
                      <select
                        value={clockInWarehouseId}
                        onChange={(e) => {
                          setClockInWarehouseId(e.target.value);
                          setClockInHallId(""); // Reset hall
                        }}
                        className="w-full bg-white border border-[#e5e7eb] rounded-lg px-3 py-2.5 text-body-sm text-[#0f172a] focus:border-[#2563eb] outline-none transition-colors"
                      >
                        <option value="">{t("chooseWarehousePlaceholder")}</option>
                        {allWarehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>{wh.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
                        {t("selectHall")}
                      </label>
                      <select
                        value={clockInHallId}
                        onChange={(e) => setClockInHallId(e.target.value)}
                        disabled={!clockInWarehouseId}
                        className="w-full bg-white border border-[#e5e7eb] disabled:opacity-50 rounded-lg px-3 py-2.5 text-body-sm text-[#0f172a] focus:border-[#2563eb] outline-none transition-colors"
                      >
                        <option value="">{t("chooseHallPlaceholder")}</option>
                        {allHalls
                          .filter((h) => h.warehouseId === clockInWarehouseId)
                          .map((hall) => (
                            <option key={hall.id} value={hall.id}>{hall.name}</option>
                          ))}
                      </select>
                    </div>

                    <button
                      onClick={handleClockInOut}
                      disabled={clockLoading || !clockInWarehouseId || !clockInHallId}
                      className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {clockLoading ? (language === "de" ? "Wird verarbeitet..." : "Processing...") : t("clockInButton")}
                    </button>
                  </div>
                )}
              </div>

              {/* Hours Summary Statistics */}
              <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-xl shadow-sm space-y-4">
                <h4 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-secondary" /> {t("workHours")}
                </h4>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-surface-container-low border border-outline-variant rounded-lg p-2.5">
                    <p className="text-[10px] text-outline uppercase tracking-wider font-bold">{t("today")}</p>
                    <p className="text-headline-sm font-black text-on-surface mt-1">{employeeSummary?.hoursSummary?.today || 0}h</p>
                  </div>
                  <div className="bg-surface-container-low border border-outline-variant rounded-lg p-2.5">
                    <p className="text-[10px] text-outline uppercase tracking-wider font-bold">{t("thisWeek")}</p>
                    <p className="text-headline-sm font-black text-secondary mt-1">{employeeSummary?.hoursSummary?.week || 0}h</p>
                  </div>
                  <div className="bg-surface-container-low border border-outline-variant rounded-lg p-2.5">
                    <p className="text-[10px] text-outline uppercase tracking-wider font-bold">{t("thisMonth")}</p>
                    <p className="text-headline-sm font-black text-on-surface mt-1">{employeeSummary?.hoursSummary?.month || 0}h</p>
                  </div>
                </div>
              </div>

              {/* Personal Profile Details Card */}
              <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-xl shadow-sm space-y-4">
                <h4 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
                  <User className="w-5 h-5 text-secondary" /> {t("profileDetails")}
                </h4>
                <div className="divide-y divide-outline-variant text-body-sm text-on-surface-variant">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-outline">{t("usernameLabel")}</span>
                    <span className="font-semibold text-on-surface font-mono">{employeeInfo?.username}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-outline">{t("employmentStart")}</span>
                    <span suppressHydrationWarning className="font-semibold text-on-surface">
                      {employeeSummary?.employmentStart 
                        ? new Date(employeeSummary.employmentStart).toLocaleDateString(language === "de" ? "de-DE" : "en-CA") 
                        : "—"}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-outline">{t("phone")}</span>
                    <span className="font-semibold text-on-surface">{employeeInfo?.phone}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-outline">{t("email")}</span>
                    <span className="font-semibold text-on-surface">{employeeInfo?.email || "—"}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-outline">{t("telegramId")}</span>
                    <span className="font-semibold text-on-surface">{employeeInfo?.telegramId || "—"}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Side: Assigned Plans, Plans History & Work History */}
            <div className="lg:col-span-2 space-y-stack-md">
              
              {/* Assigned Plans for Today */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
                <div className="p-stack-md border-b border-outline-variant bg-surface-container-low">
                  <h5 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-secondary" /> {t("activeShiftPlansToday")}
                  </h5>
                </div>
                <div className="divide-y divide-outline-variant">
                  {!employeeSummary?.plansToday || employeeSummary.plansToday.length === 0 ? (
                    <div className="p-stack-lg text-center text-outline">
                      <p className="text-body-sm">{t("noShiftsToday")}</p>
                    </div>
                  ) : (
                    employeeSummary.plansToday.map((p: any) => (
                      <div key={p.id} className="p-stack-md flex flex-col sm:flex-row justify-between sm:items-center hover:bg-surface-bright transition-colors gap-3">
                        <div>
                          <span className="text-body-md font-bold text-on-surface block">
                            {p.warehouseName} — {p.hallName}
                          </span>
                          <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-outline">
                            <span suppressHydrationWarning className="flex items-center gap-1 font-mono text-secondary-container bg-secondary-container/10 px-1 py-0.5 rounded font-bold"> {new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {p.assignedEmployees?.length || 0} {language === "de" ? "Mitarbeiter" : "Staff Assigned"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="w-3.5 h-3.5" />
                              {p.assignedContainers?.length || 0} {language === "de" ? "Container" : "Containers"}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedPlanForView(p)}
                          className="px-3.5 py-1.5 bg-secondary text-white hover:bg-secondary-container rounded-lg text-xs font-bold uppercase tracking-wider text-center transition-colors shadow-sm self-start sm:self-center"
                        >
                          {t("viewDetails")}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Plans History */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
                <div className="p-stack-md border-b border-outline-variant bg-surface-container-low">
                  <h5 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
                    <History className="w-5 h-5 text-secondary" /> {t("shiftHistory")}
                  </h5>
                </div>
                <div className="divide-y divide-outline-variant">
                  {!employeeSummary?.plansHistory || employeeSummary.plansHistory.length === 0 ? (
                    <div className="p-stack-lg text-center text-outline">
                      <p className="text-body-sm">{t("noPastShifts")}</p>
                    </div>
                  ) : (
                    employeeSummary.plansHistory.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="p-stack-md flex flex-col sm:flex-row justify-between sm:items-center hover:bg-surface-bright transition-colors gap-3">
                        <div>
                          <span className="text-body-md font-bold text-on-surface block">
                            {p.warehouseName} — {p.hallName}
                          </span>
                          <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-outline">
                            <span suppressHydrationWarning className="font-mono"> {new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}</span>
                            <span>{p.assignedContainers?.length || 0} {language === "de" ? "Container bearbeitet" : "Containers processed"}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedPlanForView(p)}
                          className="px-3 py-1.5 border border-outline-variant hover:border-secondary hover:text-secondary rounded-lg text-xs font-bold uppercase tracking-wider text-center transition-colors self-start sm:self-center"
                        >
                          {t("details")}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Work History (Attendance Logs) */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
                <div className="p-stack-md border-b border-outline-variant bg-surface-container-low">
                  <h5 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
                    <FileText className="w-5 h-5 text-secondary" /> {t("timesheetsTitle")}
                  </h5>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant">
                        <th className="p-3.5 font-semibold">{t("date")}</th>
                        <th className="p-3.5 font-semibold">{t("warehouse")}</th>
                        <th className="p-3.5 font-semibold">{t("clockedIn")}</th>
                        <th className="p-3.5 font-semibold">{t("clockedOut")}</th>
                        <th className="p-3.5 font-semibold text-right">{t("totalHours")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant text-on-surface-variant">
                      {!employeeSummary?.workHistory || employeeSummary.workHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center">{t("noAttendanceLogs")}</td>
                        </tr>
                      ) : (
                        employeeSummary.workHistory.map((r: any) => (
                          <tr key={r.id} className="hover:bg-surface-bright transition-colors">
                            <td suppressHydrationWarning className="p-3.5 font-mono text-on-surface"> {new Date(r.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}</td>
                            <td className="p-3.5">{r.warehouseName} — {r.hallName}</td>
                            <td suppressHydrationWarning className="p-3.5 font-mono"> {new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="p-3.5 font-mono">{r.clockOut ? new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</td>
                            <td className="p-3.5 font-mono text-right text-white font-bold">{r.totalHours ? `${r.totalHours}h` : t("activeShiftLabel")}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      ) : (
        /* 2. MANAGER & ADMIN DASHBOARD */
        <div className="space-y-stack-lg print:hidden">
          {/* Welcome header & Offline status */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-headline-lg font-bold text-on-surface">
                {userRole === "MANAGER" ? t("roleManager") + " Dashboard" : t("operationalDashboard")}
              </h3>
              <p className="text-on-surface-variant font-body-sm">
                {t("statusOverview")}
              </p>
            </div>

            {isOffline && (
              <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-1.5 rounded-lg flex items-center gap-2 text-label-md max-w-fit shadow-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                <span>{t("sandboxMode")}</span>
              </div>
            )}
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-stack-md">
            
            {/* Total Employees */}
            <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-lg shadow-sm hover:shadow transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <Users className="w-6 h-6 text-outline" />
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3 text-emerald-500" /> +2.4%
                </span>
              </div>
              <p className="text-outline font-label-md uppercase tracking-wider text-[10px] font-semibold">
                {t("totalEmployees")}
              </p>
              <h4 className="text-headline-md font-black mt-1 font-mono text-on-surface">
                {metrics.employeesCount}
              </h4>
            </div>

            {/* Active Today */}
            <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-lg shadow-sm hover:shadow transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <Activity className="w-6 h-6 text-secondary" />
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary-container text-white flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 bg-white rounded-full"></span> {t("live")}
                </span>
              </div>
              <p className="text-outline font-label-md uppercase tracking-wider text-[10px] font-semibold">
                {t("activeToday")}
              </p>
              <h4 className="text-headline-md font-black mt-1 font-mono text-secondary">
                {metrics.activeTodayCount}
              </h4>
            </div>

            {/* Containers Today */}
            <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-lg shadow-sm hover:shadow transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <Package className="w-6 h-6 text-outline" />
              </div>
              <p className="text-outline font-label-md uppercase tracking-wider text-[10px] font-semibold">
                {t("totalContainers")}
              </p>
              <h4 className="text-headline-md font-black mt-1 font-mono text-on-surface">
                {metrics.containersCount}
              </h4>
            </div>

            {/* Active Halls */}
            <div className="bg-surface-container-lowest border border-outline-variant p-stack-md rounded-lg shadow-sm hover:shadow transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <Grid className="w-6 h-6 text-outline" />
              </div>
              <p className="text-outline font-label-md uppercase tracking-wider text-[10px] font-semibold">
                {t("activeHalls")}
              </p>
              <h4 className="text-headline-md font-black mt-1 font-mono text-on-surface">
                {metrics.hallsCount}
              </h4>
            </div>
          </div>

          {/* Quick Operations Section */}
          <div className="space-y-stack-md">
            <h6 className="font-label-md text-outline uppercase tracking-wider text-[11px] font-semibold">
              {t("quickOperations")}
            </h6>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
              <Link
                href="/planning"
                className="flex items-center gap-4 p-stack-md bg-white border border-outline-variant rounded-lg hover:bg-surface-container-low hover:border-secondary/30 transition-all group shadow-sm text-left"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-secondary-container rounded-lg text-white group-hover:scale-105 transition-transform shrink-0">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-bold text-on-surface block text-body-md">{t("createNewPlan")}</span>
                  <span className="text-[12px] text-outline">{t("createPlanDesc")}</span>
                </div>
              </Link>

              <Link
                href="/ocr"
                className="flex items-center gap-4 p-stack-md bg-white border border-outline-variant rounded-lg hover:bg-surface-container-low hover:border-secondary/30 transition-all group shadow-sm text-left"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-secondary-container rounded-lg text-white group-hover:scale-105 transition-transform shrink-0">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-bold text-on-surface block text-body-md">{t("ocrUpload")}</span>
                  <span className="text-[12px] text-outline">{t("ocrDesc")}</span>
                </div>
              </Link>

              <Link
                href="/containers"
                className="flex items-center gap-4 p-stack-md bg-white border border-outline-variant rounded-lg hover:bg-surface-container-low hover:border-secondary/30 transition-all group shadow-sm text-left"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-secondary-container rounded-lg text-white group-hover:scale-105 transition-transform shrink-0">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-bold text-on-surface block text-body-md">{t("containers")}</span>
                  <span className="text-[12px] text-outline">{t("containersDesc")}</span>
                </div>
              </Link>

              <Link
                href="/employees"
                className="flex items-center gap-4 p-stack-md bg-white border border-outline-variant rounded-lg hover:bg-surface-container-low hover:border-secondary/30 transition-all group shadow-sm text-left"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-secondary-container rounded-lg text-white group-hover:scale-105 transition-transform shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-bold text-on-surface block text-body-md">{t("employees")}</span>
                  <span className="text-[12px] text-outline">{t("staffDesc")}</span>
                </div>
              </Link>
            </div>
          </div>

          {/* Grid Layout: Active Shift Plans & Activity Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-stack-md">
            
            {/* Active Shift Plans */}
            <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm flex flex-col justify-between">
              <div>
                <div className="p-stack-md border-b border-outline-variant flex flex-col sm:flex-row justify-between sm:items-center bg-surface-container-low gap-3">
                  <h5 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-secondary" />
                    {t("shiftPlans")} {showAllPlans ? `(${t("showingAll")})` : `(${selectedDate})`}
                  </h5>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    {!showAllPlans && (
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-2 py-1 text-xs border border-outline-variant rounded bg-white text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
                      />
                    )}
                    
                    <button
                      onClick={() => setShowAllPlans(!showAllPlans)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all border ${
                        showAllPlans
                          ? "bg-secondary text-white border-secondary"
                          : "bg-white text-secondary border-outline-variant hover:bg-surface-container-low"
                      }`}
                    >
                      {showAllPlans ? t("showingAll") : t("showAllPlans")}
                    </button>

                    <Link
                      href="/planning"
                      className="bg-secondary text-white px-3 py-1 rounded text-xs font-bold hover:bg-secondary-container transition-all flex items-center gap-1"
                    >
                      {t("createNewPlan")} <PlusCircle className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                {/* Bulk Delete Bar */}
                {selectedPlanIds.length > 0 && (
                  <div className="bg-error-container/20 border-b border-error-container px-stack-md py-2.5 flex justify-between items-center text-xs animate-fadeIn">
                    <span className="text-error font-medium flex items-center gap-1">
                      <Trash2 className="w-4 h-4" /> {selectedPlanIds.length} {language === "de" ? "Pläne ausgewählt" : "plans selected"}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedPlanIds([])}
                        className="text-on-surface hover:underline font-bold px-2 py-1"
                      >
                        {t("clear")}
                      </button>
                      <button
                        onClick={handleBulkDeletePlans}
                        className="bg-error text-white px-3 py-1 rounded font-bold hover:bg-red-700 transition-colors shadow-sm"
                      >
                        {t("bulkDeleteSelected")}
                      </button>
                    </div>
                  </div>
                )}

                {plansLoading ? (
                  <div className="p-stack-lg text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-secondary mx-auto"></div>
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant">
                    {plans.length === 0 ? (
                      <div className="p-stack-lg text-center text-outline">
                        <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-50 text-amber-500" />
                        <p className="text-body-sm font-medium">{t("noPlansConfigured")}</p>
                      </div>
                    ) : (
                      plans.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            if (canManage && selectedPlanIds.length > 0) {
                              if (selectedPlanIds.includes(p.id)) {
                                setSelectedPlanIds(prev => prev.filter(id => id !== p.id));
                              } else {
                                setSelectedPlanIds(prev => [...prev, p.id]);
                              }
                            }
                          }}
                          className={`px-stack-md py-4 flex flex-col sm:flex-row justify-between sm:items-center hover:bg-surface-bright transition-colors gap-3 ${
                            selectedPlanIds.includes(p.id) ? "bg-secondary-container/5" : ""
                          }`}
                        >
                          <div className="flex items-center">
                            {canManage && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectedPlanIds.includes(p.id)) {
                                    setSelectedPlanIds(prev => prev.filter(id => id !== p.id));
                                  } else {
                                    setSelectedPlanIds(prev => [...prev, p.id]);
                                  }
                                }}
                                className="mr-3 text-on-surface-variant hover:text-secondary shrink-0 transition-colors"
                              >
                                {selectedPlanIds.includes(p.id) ? (
                                  <CheckSquare className="w-4 h-4 text-secondary" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            <div className="flex flex-col">
                              <span className="text-body-md font-bold text-on-surface">
                                {p.warehouseName} — {p.hallName}
                              </span>
                              <div className="flex flex-wrap gap-3 mt-1 text-[12px] text-outline">
                                <span suppressHydrationWarning className="font-mono text-secondary-container bg-secondary-container/10 px-1.5 py-0.5 rounded font-bold"> {new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3.5 h-3.5" />
                                  {p.assignedEmployees?.length || 0} {language === "de" ? "Mitarbeiter zugeteilt" : "Staff Assigned"}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Package className="w-3.5 h-3.5" />
                                  {p.assignedContainers?.length || 0} {language === "de" ? "Container geleitet" : "Containers Routed"}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 pl-7 sm:pl-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPlanForView(p);
                              }}
                              className="px-3.5 py-1.5 bg-secondary text-white hover:bg-secondary-container rounded-lg text-xs font-bold uppercase tracking-wider text-center transition-colors shadow-sm"
                            >
                              {t("viewDetails")}
                            </button>
                            <Link
                              href={`/planning?date=${p.date.split("T")[0]}&warehouseId=${p.warehouseId}&hallId=${p.hallId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="px-3.5 py-1.5 border border-outline-variant hover:border-secondary hover:text-secondary rounded-lg text-xs font-bold uppercase tracking-wider text-center transition-colors"
                            >
                              {t("managePlan")}
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: Manager Audit Feed OR Active Staff */}
            <div className="lg:col-span-1 space-y-stack-md">
              {userRole === "MANAGER" ? (
                <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="p-stack-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                      <h5 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
                        <Shield className="w-5 h-5 text-secondary" /> {t("auditActivityLogs")}
                      </h5>
                      <Link href="/reports" className="text-secondary text-label-md font-bold hover:underline flex items-center gap-1">
                        {t("reports")} <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                    
                    <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto divide-y divide-outline-variant">
                      <div>
                        <p className="text-xs text-outline uppercase tracking-wider font-bold mb-2.5 flex items-center gap-1.5 text-secondary">
                          <Users className="w-3.5 h-3.5" /> {t("employeeActivity")}
                        </p>
                        <div className="space-y-2">
                          {recentActivityLogs.filter(log => ["LOGIN", "LOGOUT", "CLOCK_IN", "CLOCK_OUT"].includes(log.action)).length === 0 ? (
                            <p className="text-xs text-outline italic">{t("noRecentActivity")}</p>
                          ) : (
                            recentActivityLogs
                              .filter(log => ["LOGIN", "LOGOUT", "CLOCK_IN", "CLOCK_OUT"].includes(log.action))
                              .slice(0, 5)
                              .map(log => (
                                <div key={log.id} className="text-xs p-2.5 bg-[#f8fafc] rounded-lg border border-[#e2e8f0] flex flex-col gap-0.5">
                                  <div className="flex justify-between items-center">
                                    <span className="font-semibold text-[#0f172a]">{log.user?.name || "System"}</span>
                                    <span suppressHydrationWarning className="text-[9px] text-[#94a3b8] font-mono"> {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <span className="text-[#64748b]">{log.details}</span>
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      <div className="pt-4">
                        <p className="text-xs text-outline uppercase tracking-wider font-bold mb-2.5 flex items-center gap-1.5 text-emerald-400">
                          <Shield className="w-3.5 h-3.5" /> {t("adminActivity")}
                        </p>
                        <div className="space-y-2">
                          {recentActivityLogs.filter(log => !["LOGIN", "LOGOUT", "CLOCK_IN", "CLOCK_OUT"].includes(log.action)).length === 0 ? (
                            <p className="text-xs text-outline italic">{t("noRecentActivity")}</p>
                          ) : (
                            recentActivityLogs
                              .filter(log => !["LOGIN", "LOGOUT", "CLOCK_IN", "CLOCK_OUT"].includes(log.action))
                              .slice(0, 5)
                              .map(log => (
                                <div key={log.id} className="text-xs p-2.5 bg-[#f8fafc] rounded-lg border border-[#e2e8f0] flex flex-col gap-0.5">
                                  <div className="flex justify-between items-center">
                                    <span className="font-semibold text-[#0f172a]">{log.user?.name || "System"}</span>
                                    <span suppressHydrationWarning className="text-[9px] text-[#94a3b8] font-mono"> {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <span className="font-mono text-[10px] mt-0.5 uppercase text-[#2563eb] bg-[#eff6ff] w-fit px-1.5 py-0.5 rounded font-semibold">{log.action}</span>
                                  <span className="text-[#64748b] mt-1">{log.details}</span>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Admin Recent Log */
                <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="p-stack-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                      <h5 className="font-bold text-body-lg text-on-surface">{language === "de" ? "Aktuelle Systemereignisse" : "Recent System Events"}</h5>
                      <span className="text-[10px] bg-secondary-container px-2 py-0.5 rounded font-bold text-white uppercase tracking-wider">Operational</span>
                    </div>
                    <div className="divide-y divide-outline-variant">
                      <div className="px-stack-md py-3.5 flex justify-between items-center hover:bg-surface-bright transition-colors">
                        <div className="flex flex-col">
                          <span className="text-body-sm font-medium text-on-surface">{language === "de" ? "Plan für Duisburg verarbeitet" : "Plan processed for Duisburg"}</span>
                          <span className="text-[10px] text-outline uppercase tracking-wider font-mono mt-0.5">System • {language === "de" ? "Gerade eben" : "Just Now"}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-900/30 text-emerald-400 rounded text-[10px] font-bold uppercase tracking-wider font-mono">{t("success")}</span>
                      </div>
                      <div className="px-stack-md py-3.5 flex justify-between items-center hover:bg-surface-bright transition-colors">
                        <div className="flex flex-col">
                          <span className="text-body-sm font-medium text-on-surface">{language === "de" ? "Neuer Mitarbeiter hinzugefügt" : "New Employee Added"}</span>
                          <span className="text-[10px] text-outline uppercase tracking-wider font-mono mt-0.5">Admin • {language === "de" ? "vor 1 Std." : "1h ago"}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded text-[10px] font-bold uppercase tracking-wider font-mono">Audit</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Detail View Modal */}
      {selectedPlanForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn print:hidden">
          <div className="bg-white border border-[#e2e8f0] rounded-2xl max-w-2xl w-full shadow-xl overflow-hidden animate-scaleIn">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#f8fafc] border-b border-[#e2e8f0] flex justify-between items-center">
              <div>
                <h4 className="font-bold text-body-lg text-[#0f172a]">{t("shiftDetailsModalTitle")}</h4>
                <p className="text-xs text-[#64748b] mt-0.5">
                  {t("shiftDetailsSubtitle")}
                </p>
              </div>
              <button
                onClick={() => setSelectedPlanForView(null)}
                className="text-[#64748b] hover:text-[#0f172a] p-1.5 hover:bg-[#f1f5f9] rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              {/* Warehouse Details */}
              <div className="grid grid-cols-2 gap-4 bg-[#f8fafc] border border-[#e2e8f0] p-4 rounded-xl">
                <div>
                  <span className="text-[11px] text-[#64748b] uppercase tracking-wider block font-bold">{t("depotLocation")}</span>
                  <span className="font-bold text-[#0f172a] text-body-md mt-1 block">{selectedPlanForView.warehouseName}</span>
                </div>
                <div>
                  <span className="text-[11px] text-[#64748b] uppercase tracking-wider block font-bold">{t("stagingHall")}</span>
                  <span className="font-bold text-[#0f172a] text-body-md mt-1 block">{selectedPlanForView.hallName}</span>
                </div>
                <div className="col-span-2 mt-2 pt-2 border-t border-[#e2e8f0]">
                  <span className="text-[11px] text-[#64748b] uppercase tracking-wider block font-bold">{t("shiftDate")}</span>
                  <span suppressHydrationWarning className="font-mono text-secondary text-body-md font-bold mt-1 block"> {new Date(selectedPlanForView.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Staff Roster */}
              <div className="space-y-2.5">
                <h5 className="font-bold text-body-md text-[#0f172a] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#2563eb]" /> {t("assignedStaff")} ({selectedPlanForView.assignedEmployees?.length || 0})
                </h5>
                <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b]">
                        <th className="p-3 font-semibold">{t("nameColumn")}</th>
                        <th className="p-3 font-semibold">{t("roleColumn")}</th>
                        <th className="p-3 font-semibold">{t("phone")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {!selectedPlanForView.assignedEmployees || selectedPlanForView.assignedEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-[#94a3b8]">{t("noStaffAssigned")}</td>
                        </tr>
                      ) : (
                        selectedPlanForView.assignedEmployees.map((emp, idx) => (
                          <tr key={idx} className="hover:bg-[#f8fafc]">
                            <td className="p-3 font-medium text-[#0f172a]">{emp.name}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 bg-[#eff6ff] text-[#2563eb] rounded-full text-[10px] font-semibold uppercase tracking-wider">
                                {emp.role}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-[#64748b]">{emp.phone || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Container Queue */}
              <div className="space-y-2.5">
                <h5 className="font-bold text-body-md text-[#0f172a] flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#2563eb]" /> {t("routedContainers")} ({selectedPlanForView.assignedContainers?.length || 0})
                </h5>
                <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b]">
                        <th className="p-3 font-semibold">{t("containerNumber")}</th>
                        <th className="p-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {!selectedPlanForView.assignedContainers || selectedPlanForView.assignedContainers.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-[#94a3b8]">{t("noContainersRouted")}</td>
                        </tr>
                      ) : (
                        selectedPlanForView.assignedContainers.map((c, idx) => (
                          <tr key={idx} className="hover:bg-[#f8fafc]">
                            <td className="p-3 font-mono text-[#0f172a] font-medium">{c.containerNumber}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                c.status === "FULL" 
                                  ? "bg-amber-50 text-amber-700 border border-amber-200" 
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}>
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-[#f8fafc] border-t border-[#e2e8f0] flex justify-between items-center">
              <button
                onClick={() => setSelectedPlanForView(null)}
                className="px-4 py-2 border border-[#e2e8f0] hover:bg-[#f1f5f9] text-[#64748b] hover:text-[#0f172a] rounded-lg text-sm transition-colors"
              >
                {t("close")}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExportCSV(selectedPlanForView)}
                  className="px-4 py-2 bg-secondary/20 border border-secondary/30 hover:bg-secondary/35 text-secondary hover:text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4" /> {t("exportCsv")}
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-secondary hover:bg-secondary-container text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-4 h-4" /> {t("printPlan")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print-Friendly Container */}
      {selectedPlanForView && (
        <div className="hidden print:block print:p-8 bg-white text-black min-h-screen">
          <h1 className="text-2xl font-bold border-b pb-2 mb-4">LogiFlow Shift Operations Plan</h1>
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div suppressHydrationWarning><strong>Date:</strong> {new Date(selectedPlanForView.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}</div>
            <div><strong>Depot Location:</strong> {selectedPlanForView.warehouseName}</div>
            <div><strong>Staging Area:</strong> {selectedPlanForView.hallName}</div>
          </div>
          
          <h2 className="text-lg font-semibold border-b pb-1 mb-2">Assigned Staff ({selectedPlanForView.assignedEmployees?.length || 0})</h2>
          <table className="w-full border-collapse mb-6 text-xs text-left text-black">
            <thead>
              <tr className="border-b border-black">
                <th className="py-2">Name</th>
                <th className="py-2">Role</th>
                <th className="py-2">Phone</th>
              </tr>
            </thead>
            <tbody>
              {selectedPlanForView.assignedEmployees?.map((emp, idx) => (
                <tr key={idx} className="border-b border-black">
                  <td className="py-2 font-medium">{emp.name}</td>
                  <td className="py-2">{emp.role}</td>
                  <td className="py-2">{emp.phone || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="text-lg font-semibold border-b pb-1 mb-2">Routed Containers ({selectedPlanForView.assignedContainers?.length || 0})</h2>
          <table className="w-full border-collapse text-xs text-left text-black">
            <thead>
              <tr className="border-b border-black">
                <th className="py-2">Container Number</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {selectedPlanForView.assignedContainers?.map((c, idx) => (
                <tr key={idx} className="border-b border-black">
                  <td className="py-2 font-mono font-medium">{c.containerNumber}</td>
                  <td className="py-2">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
