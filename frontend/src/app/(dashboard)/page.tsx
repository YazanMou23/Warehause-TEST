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
  QrCode,
  Camera,
  ScanLine,
  Plus,
  Timer,
  CheckCircle2,
  Coffee,
  Sparkles,
  Layers,
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";
import ActiveEmployeeCalendar from "../components/ActiveEmployeeCalendar";
import CustomAlertModal, { CustomAlertOptions } from "../components/CustomAlertModal";
import QRScannerCameraModal from "../components/QRScannerCameraModal";
import EmployeeLogHoursModal from "../components/EmployeeLogHoursModal";
import WorkHoursVisibilityToggle from "../components/WorkHoursVisibilityToggle";

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
  shift?: string;
  treffpunkt?: string;
  treffpunktTime?: string;
  notes?: string;
  locations?: {
    warehouseId: string;
    warehouseName?: string;
    hallId: string;
    hallName?: string;
    notes?: string;
    warehouse?: { id: string; name: string };
    hall?: { id: string; name: string };
  }[];
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
  const [alertConfig, setAlertConfig] = useState<CustomAlertOptions>({
    isOpen: false,
    message: "",
  });
  const [userRole, setUserRole] = useState("");

  const [loading, setLoading] = useState(true);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const router = useRouter();

  // Employee Dashboard States
  const [employeeSummary, setEmployeeSummary] = useState<any>(null);
  const isWorkHoursHidden = Boolean(employeeSummary?.isWorkHoursHidden);
  const [employeeInfo, setEmployeeInfo] = useState<any>(null);
  const [clockInWarehouseId, setClockInWarehouseId] = useState("");
  const [clockInHallId, setClockInHallId] = useState("");
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [allHalls, setAllHalls] = useState<any[]>([]);
  const [clockLoading, setClockLoading] = useState(false);
  const [isLogHoursOpen, setIsLogHoursOpen] = useState(false);
  const [employeeActiveTab, setEmployeeActiveTab] = useState<"overview" | "shifts" | "logs" | "profile">("overview");
  const [activeShiftElapsed, setActiveShiftElapsed] = useState("");

  // Manager/Admin Dashboard States
  const [recentActivityLogs, setRecentActivityLogs] = useState<any[]>([]);
  const [dailyAttendance, setDailyAttendance] = useState<any[]>([]);
  const [dashboardEmployees, setDashboardEmployees] = useState<any[]>([]);
  const [bulkAssignEmployeesModalOpen, setBulkAssignEmployeesModalOpen] = useState(false);
  const [bulkSelectedEmployeeIds, setBulkSelectedEmployeeIds] = useState<string[]>([]);

  // Analytics Charts States
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<"weekly" | "monthly">("weekly");
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Global Work Hours & Timesheets Visibility State (for Admin & Manager)
  const [isGlobalWorkHoursHidden, setIsGlobalWorkHoursHidden] = useState(false);
  const [toggleWorkHoursLoading, setToggleWorkHoursLoading] = useState(false);

  const fetchWorkHoursVisibility = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/settings/work-hours-visibility`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setIsGlobalWorkHoursHidden(Boolean(data.isGlobalHidden));
      }
    } catch (e) {
      console.warn("Could not load work hours visibility", e);
    }
  };

  const handleToggleGlobalWorkHoursVisibility = async (newVal: boolean) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    setToggleWorkHoursLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/settings/work-hours-visibility`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ hideWorkHours: newVal }),
        }
      );
      if (res.ok) {
        setIsGlobalWorkHoursHidden(newVal);
        showAlert({
          title: t("success"),
          message: newVal ? t("workHoursHiddenAlertMsg") : t("workHoursVisibleAlertMsg"),
          type: "success",
        });
      } else {
        showAlert({
          title: t("errorOccurred"),
          message: "Fehler beim Ändern der Sichtbarkeit",
          type: "error",
        });
      }
    } catch (e) {
      console.error(e);
      showAlert({
        title: t("errorOccurred"),
        message: "Verbindungsfehler beim Ändern der Sichtbarkeit",
        type: "error",
      });
    } finally {
      setToggleWorkHoursLoading(false);
    }
  };

  const fetchAnalytics = async (tf: "weekly" | "monthly") => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/analytics?timeframe=${tf}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (e) {
      console.warn("Could not load dashboard analytics", e);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const showAlert = (options: Omit<CustomAlertOptions, "isOpen">) => {
    setAlertConfig({ ...options, isOpen: true });
  };

  const handleExportCSV = (plan: PlanItem) => {
    if (!plan) return;

    let csvContent = "";
    
    // Title & Metadata
    csvContent += `LOGIFLOW SHIFT OPERATIONS PLAN\n`;
    csvContent += `Date,${new Date(plan.date).toLocaleDateString('en-CA')}\n`;
    if (plan.shift) {
      csvContent += `Shift Time,${plan.shift}\n`;
    }
    if (plan.locations && plan.locations.length > 0) {
      const locString = plan.locations.map(l => `${l.warehouseName || l.warehouse?.name || plan.warehouseName || 'Warehouse'} (${l.hallName || l.hall?.name || plan.hallName || 'Hall'})`).join(" | ");
      csvContent += `Locations,"${locString}"\n\n`;
    } else {
      csvContent += `Warehouse,"${plan.warehouseName || ''}"\n`;
      csvContent += `Staging Hall,"${plan.hallName || ''}"\n\n`;
    }

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
    const defaultWh = plan.warehouseName || "Warehouse";
    const defaultHall = plan.hallName || "Hall";
    const filename = `plan_${defaultWh.replace(/\s+/g, "_")}_${defaultHall.replace(/\s+/g, "_")}_${plan.date.split("T")[0]}.csv`;
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

  const handleBulkDeletePlans = () => {
    if (selectedPlanIds.length === 0) return;
    showAlert({
      title: "Schichtpläne löschen",
      message: `Sind Sie sicher, dass Sie die ${selectedPlanIds.length} ausgewählten Schichtpläne löschen möchten?`,
      type: "warning",
      confirmText: "Löschen",
      cancelText: "Abbrechen",
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        try {
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
            showAlert({ title: "Erfolg", message: "Ausgewählte Schichtpläne wurden gelöscht.", type: "success" });
          } else {
            showAlert({ title: "Fehler", message: "Schichtpläne konnten nicht gelöscht werden.", type: "error" });
          }
        } catch (e) {
          console.error(e);
          showAlert({ title: "Fehler", message: "Fehler beim Löschen der Schichtpläne.", type: "error" });
        }
      },
    });
  };

  const handleBulkDuplicatePlans = () => {
    if (selectedPlanIds.length === 0) return;
    showAlert({
      title: "Schichtpläne duplizieren",
      message: `Sind Sie sicher, dass Sie die ${selectedPlanIds.length} ausgewählten Schichtpläne duplizieren möchten?`,
      type: "info",
      confirmText: "Duplizieren",
      cancelText: "Abbrechen",
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/bulk-duplicate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ ids: selectedPlanIds }),
          });

          if (res.ok) {
            setSelectedPlanIds([]);
            fetchPlans(selectedDate, showAllPlans);
            showAlert({ title: "Erfolg", message: "Schichtpläne wurden erfolgreich dupliziert.", type: "success" });
          } else {
            showAlert({ title: "Fehler", message: "Schichtpläne konnten nicht dupliziert werden.", type: "error" });
          }
        } catch (e) {
          console.error(e);
          showAlert({ title: "Fehler", message: "Fehler beim Duplizieren der Schichtpläne.", type: "error" });
        }
      },
    });
  };

  const handleBulkChangeHallPlans = async (hallId: string) => {
    if (selectedPlanIds.length === 0 || !hallId) return;

    const token = localStorage.getItem("accessToken");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/bulk-change-hall`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selectedPlanIds, hallId }),
      });

      if (res.ok) {
        setSelectedPlanIds([]);
        fetchPlans(selectedDate, showAllPlans);
        showAlert({ title: "Erfolg", message: "Halle für ausgewählte Pläne erfolgreich geändert.", type: "success" });
      } else {
        showAlert({ title: "Fehler", message: "Hallenänderung fehlgeschlagen.", type: "error" });
      }
    } catch (e) {
      console.error(e);
      showAlert({ title: "Fehler", message: "Fehler beim Ändern der Halle.", type: "error" });
    }
  };

  const handleBulkChangeShiftPlans = async (shift: string) => {
    if (selectedPlanIds.length === 0 || !shift) return;

    const token = localStorage.getItem("accessToken");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/bulk-change-shift`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selectedPlanIds, shift }),
      });

      if (res.ok) {
        setSelectedPlanIds([]);
        fetchPlans(selectedDate, showAllPlans);
        showAlert({ title: "Erfolg", message: "Schicht für ausgewählte Pläne erfolgreich geändert.", type: "success" });
      } else {
        showAlert({ title: "Fehler", message: "Schichtänderung fehlgeschlagen.", type: "error" });
      }
    } catch (e) {
      console.error(e);
      showAlert({ title: "Fehler", message: "Fehler beim Ändern der Schicht.", type: "error" });
    }
  };

  const handleBulkAssignEmployeesPlans = async (employeeIds: string[]) => {
    if (selectedPlanIds.length === 0) return;

    const token = localStorage.getItem("accessToken");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/bulk-assign-employees`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selectedPlanIds, employeeIds }),
      });

      if (res.ok) {
        setSelectedPlanIds([]);
        fetchPlans(selectedDate, showAllPlans);
        showAlert({ title: "Erfolg", message: "Mitarbeiter erfolgreich für ausgewählte Pläne zugewiesen.", type: "success" });
      } else {
        showAlert({ title: "Fehler", message: "Mitarbeiterzuweisung fehlgeschlagen.", type: "error" });
      }
    } catch (e) {
      console.error(e);
      showAlert({ title: "Fehler", message: "Fehler beim Zuweisen der Mitarbeiter.", type: "error" });
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
          showAlert({ title: "Ausgestempelt", message: "Erfolgreich ausgestempelt!", type: "success", onConfirm: () => window.location.reload() });
        } else {
          const data = await res.json();
          showAlert({ title: "Fehler", message: data.message || "Ausstempeln fehlgeschlagen.", type: "error" });
        }
      } else {
        // Clock In
        if (!clockInWarehouseId || !clockInHallId) {
          showAlert({ title: "Hinweis", message: "Bitte wählen Sie ein Lager und eine Halle zum Einstempeln aus.", type: "warning" });
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
          showAlert({ title: "Eingestempelt", message: "Erfolgreich eingestempelt!", type: "success", onConfirm: () => window.location.reload() });
        } else {
          const data = await res.json();
          showAlert({ title: "Fehler", message: data.message || "Einstempeln fehlgeschlagen.", type: "error" });
        }
      }
    } catch (e) {
      console.error(e);
      showAlert({ title: "Fehler", message: "Ein Fehler ist bei der Zeiterfassung aufgetreten.", type: "error" });
    } finally {
      setClockLoading(false);
    }
  };

  const handleQrScan = async (warehouseId: string, hallId: string) => {
    setClockLoading(true);
    const token = localStorage.getItem("accessToken");
    const headers = { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}` 
    };

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/qr-scan`, {
        method: "POST",
        headers,
        body: JSON.stringify({ warehouseId, hallId }),
      });
      const data = await res.json();

      if (res.ok) {
        // ✅ Close scanner modal first
        setIsQrScannerOpen(false);

        // ✅ Update local UI state immediately from response (no page reload needed)
        if (data.action === 'CLOCK_IN' && data.attendance) {
          const att = data.attendance;
          setEmployeeSummary((prev: any) => ({
            ...prev,
            activeShift: {
              id: att.id,
              warehouseId: att.warehouseId,
              hallId: att.hallId,
              warehouseName: att.warehouse?.name || warehouseId,
              hallName: att.hall?.name || hallId,
              clockIn: att.clockIn,
            },
          }));
        } else if (data.action === 'CLOCK_OUT') {
          setEmployeeSummary((prev: any) => ({
            ...prev,
            activeShift: null,
          }));
        }

        // Refresh full summary data to keep hours & timesheets perfectly synced
        refreshEmployeeData();

        showAlert({
          title: data.action === 'CLOCK_OUT' ? '✅ Ausgestempelt' : '✅ Eingestempelt',
          message: data.message || 'QR-Code Zeiterfassung erfolgreich!',
          type: 'success',
        });
      } else {
        setIsQrScannerOpen(false);
        showAlert({ title: "Fehler", message: data.message || "QR-Scan Zeiterfassung fehlgeschlagen.", type: "error" });
      }
    } catch (e: any) {
      console.error(e);
      setIsQrScannerOpen(false);
      showAlert({ title: "Fehler", message: e.message || "QR-Code konnte nicht verarbeitet werden.", type: "error" });
    } finally {
      setClockLoading(false);
    }
  };

  const refreshEmployeeData = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (!payload.sub) return;
      const headers = { Authorization: `Bearer ${token}` };
      const empSummaryRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${payload.sub}/dashboard-summary`,
        { headers }
      );
      if (empSummaryRes.ok) {
        const summaryJson = await empSummaryRes.json();
        setEmployeeSummary(summaryJson);
      }
    } catch (e) {
      console.error("Failed to refresh employee dashboard summary", e);
    }
  };

  const handleDeleteAttendanceEntry = (entryId: string) => {
    showAlert({
      title: t("deleteEntry"),
      message: t("deleteConfirm"),
      type: "warning",
      confirmText: t("deleteEntry"),
      cancelText: t("clear"),
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        if (!token) return;
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/${entryId}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (res.ok) {
            showAlert({
              title: t("success"),
              message: "Zeiterfassungseintrag erfolgreich gelöscht.",
              type: "success",
            });
            refreshEmployeeData();
          } else {
            const data = await res.json();
            showAlert({
              title: "Fehler",
              message: data.message || "Löschen fehlgeschlagen.",
              type: "error",
            });
          }
        } catch (e: any) {
          showAlert({
            title: "Fehler",
            message: e.message || "Fehler beim Löschen.",
            type: "error",
          });
        }
      },
    });
  };

  useEffect(() => {
    if (!employeeSummary?.activeShift?.clockIn) {
      setActiveShiftElapsed("");
      return;
    }

    const updateElapsed = () => {
      const start = new Date(employeeSummary.activeShift.clockIn).getTime();
      const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const h = Math.floor(diffSec / 3600);
      const m = Math.floor((diffSec % 3600) / 60);
      const s = diffSec % 60;
      setActiveShiftElapsed(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      );
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [employeeSummary?.activeShift?.clockIn]);

  // Ensure mobile tab does not stay on hidden "logs" tab (avoids blank screen)
  useEffect(() => {
    if (isWorkHoursHidden && employeeActiveTab === "logs") {
      setEmployeeActiveTab("overview");
    }
  }, [isWorkHoursHidden, employeeActiveTab]);

  // Periodic refresh for employee dashboard to detect admin visibility toggles live
  useEffect(() => {
    if (userRole !== "EMPLOYEE") return;
    const interval = setInterval(() => {
      refreshEmployeeData();
    }, 25000);
    return () => clearInterval(interval);
  }, [userRole]);

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
          } else {
            throw new Error("Failed to fetch employee details");
          }
        } else {
          // Admin/Manager dashboard data
          const usersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees?limit=1000`, { headers });
          const usersJson = usersRes.ok ? await usersRes.json() : null;
          const usersList = usersJson && Array.isArray(usersJson.data) ? usersJson.data : [];
          setDashboardEmployees(usersList);

          const containersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers`, { headers });
          const containersJson = containersRes.ok ? await containersRes.json() : null;
          const containersList = containersJson && Array.isArray(containersJson.data) ? containersJson.data : [];

          const hallsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, { headers });
          const hallsJson = hallsRes.ok ? await hallsRes.json() : null;
          const hallsList = hallsJson && Array.isArray(hallsJson.data) ? hallsJson.data : [];
          setAllHalls(hallsList);

          const whRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, { headers });
          const whJson = whRes.ok ? await whRes.json() : null;
          const whList = whJson && Array.isArray(whJson.data) ? whJson.data : (Array.isArray(whJson) ? whJson : []);
          setAllWarehouses(whList);

          const attendanceRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/daily`, { headers });
          const attendanceData = attendanceRes.ok ? await attendanceRes.json() : [];
          setDailyAttendance(attendanceData);

          setMetrics({
            employeesCount: usersJson?.meta?.total ?? usersList.length,
            activeTodayCount: Array.isArray(attendanceData) ? attendanceData.length : 0,
            containersCount: containersJson?.meta?.total ?? containersList.length,
            hallsCount: hallsJson?.meta?.total ?? hallsList.length,
          });

          if (payload.role === "MANAGER") {
            const logsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/action-logs?limit=50`, { headers });
            const logsJson = logsRes.ok ? await logsRes.json() : null;
            setRecentActivityLogs(logsJson?.data || []);
          }

          // Fetch dashboard analytics
          fetchAnalytics(analyticsTimeframe);
          fetchWorkHoursVisibility();
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data from API:", err);
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
  }, [selectedDate, showAllPlans, userRole]);

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
        <div className="space-y-5 print:hidden pb-20 sm:pb-0">
          {/* Top Welcome Header & Quick Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  {t("employeeDashboard")}
                </h3>
                {employeeSummary?.activeShift ? (
                  <span className="badge-premium badge-success animate-pulse text-[11px] font-bold">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> {t("clockedIn")}
                  </span>
                ) : (
                  <span className="badge-premium badge-error text-[11px] font-bold">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span> {t("clockedOut")}
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-xs mt-1">
                {t("welcomeBack")},{" "}
                <span className="font-semibold text-slate-800">
                  {employeeInfo?.name || "Mitarbeiter"}
                </span>
                . {t("manageShiftsDesc")}
              </p>
            </div>

            {/* Quick Primary Actions (Visible on header on tablet/desktop, thumb bar on mobile) */}
            <div className="flex items-center gap-2 shrink-0">
              {!isWorkHoursHidden && (
                <button
                  onClick={() => setIsLogHoursOpen(true)}
                  className="btn-primary py-2.5 px-4 text-xs font-bold shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t("logHoursCTA")}</span>
                </button>
              )}
              <button
                onClick={() => setIsQrScannerOpen(true)}
                disabled={clockLoading}
                className="btn-secondary py-2.5 px-3.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-slate-100"
              >
                <Camera className="w-4 h-4 text-blue-600" />
                <span>QR-Scan</span>
              </button>
            </div>
          </div>

          {/* Active Shift Live Ticker Banner (If Clocked In) */}
          {employeeSummary?.activeShift && (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-900 via-slate-900 to-blue-950 text-white shadow-lg border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-extrabold tracking-wider bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full">
                      ● Schicht läuft
                    </span>
                    <span className="text-xs text-slate-300 font-medium">
                      Seit {new Date(employeeSummary.activeShift.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} Uhr
                    </span>
                  </div>
                  <p className="font-bold text-sm sm:text-base text-white mt-0.5">
                    {employeeSummary.activeShift.warehouseName} — {employeeSummary.activeShift.hallName}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
                {!isWorkHoursHidden ? (
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] text-emerald-300 uppercase font-bold tracking-wider block">
                      {t("shiftActiveSince")}
                    </span>
                    <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-emerald-400">
                      {activeShiftElapsed || "00:00:00"}
                    </span>
                  </div>
                ) : (
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] text-emerald-300 uppercase font-bold tracking-wider block">
                      Status
                    </span>
                    <span className="text-xs font-extrabold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                      ● Schicht aktiv
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setIsQrScannerOpen(true)}
                  disabled={clockLoading}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Camera className="w-4 h-4" />
                  <span>Ausstempeln</span>
                </button>
              </div>
            </div>
          )}

          {/* Mobile Segmented Navigation Tabs (< sm screens) */}
          <div className="sm:hidden flex rounded-xl bg-slate-200/70 p-1 gap-1 text-xs font-bold">
            <button
              onClick={() => setEmployeeActiveTab("overview")}
              className={`flex-1 py-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                employeeActiveTab === "overview"
                  ? "bg-white text-blue-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>{t("tabOverview")}</span>
            </button>
            <button
              onClick={() => setEmployeeActiveTab("shifts")}
              className={`flex-1 py-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                employeeActiveTab === "shifts"
                  ? "bg-white text-blue-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>{t("tabShifts")}</span>
              {employeeSummary?.plansUpcoming?.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[10px] flex items-center justify-center font-mono">
                  {employeeSummary.plansUpcoming.length}
                </span>
              )}
            </button>
            {!isWorkHoursHidden && (
              <button
                onClick={() => setEmployeeActiveTab("logs")}
                className={`flex-1 py-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  employeeActiveTab === "logs"
                    ? "bg-white text-blue-900 shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>{t("tabLogs")}</span>
                {employeeSummary?.workHistory?.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] flex items-center justify-center font-mono">
                    {employeeSummary.workHistory.length}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setEmployeeActiveTab("profile")}
              className={`flex-1 py-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                employeeActiveTab === "profile"
                  ? "bg-white text-blue-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>{t("tabProfile")}</span>
            </button>
          </div>

          {/* Quick Hours Action Card (Shown only when hours are visible) */}
          {!isWorkHoursHidden && (
            <div className={`card-premium border-2 border-blue-500/20 shadow-sm bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/40 p-4 sm:p-5 ${employeeActiveTab !== "overview" ? "hidden sm:block" : ""}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0 mt-0.5">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                      <span>Arbeitszeit & Stunden eintragen</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-md uppercase">Neu</span>
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Haben Sie heute oder gestern gearbeitet? Tragen Sie Ihre Stunden mit flexiblen Vorlagen oder freier Zeiteingabe ein.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsLogHoursOpen(true)}
                  className="btn-primary py-2.5 px-5 text-xs font-extrabold shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer self-stretch sm:self-auto shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Jetzt Stunden erfassen</span>
                </button>
              </div>
            </div>
          )}

          {/* Shift Focus Info Banner (When hours are hidden) */}
          {isWorkHoursHidden && employeeActiveTab === "overview" && (
            <div className="card-premium border-2 border-slate-200/80 shadow-xs bg-gradient-to-r from-slate-50 via-white to-blue-50/20 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0 mt-0.5">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <span>{t("shiftsOverviewTitle")}</span>
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {t("myAssignedShiftsDesc")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Responsive Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column (Stats, Clock-in, Profile) */}
            <div className={`lg:col-span-1 space-y-6 ${employeeActiveTab !== "overview" && employeeActiveTab !== "profile" ? "hidden sm:block" : ""}`}>
              
              {/* Work Hours Statistics (Hidden when isWorkHoursHidden is true) */}
              {!isWorkHoursHidden && (employeeActiveTab === "overview" || employeeActiveTab === "logs") && (
                <div className="card-premium space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-600" />
                      <span>{t("workHours")}</span>
                    </h4>
                    <button
                      onClick={() => setIsLogHoursOpen(true)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      + Eintragen
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{t("today")}</p>
                      <p className="text-xl font-extrabold text-slate-900 font-mono mt-1">
                        {employeeSummary?.hoursSummary?.today || 0}
                        <span className="text-xs font-normal text-slate-400">h</span>
                      </p>
                    </div>
                    <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3">
                      <p className="text-[10px] text-blue-600 uppercase tracking-wider font-bold">{t("thisWeek")}</p>
                      <p className="text-xl font-extrabold text-blue-700 font-mono mt-1">
                        {employeeSummary?.hoursSummary?.week || 0}
                        <span className="text-xs font-normal text-blue-400">h</span>
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{t("thisMonth")}</p>
                      <p className="text-xl font-extrabold text-slate-900 font-mono mt-1">
                        {employeeSummary?.hoursSummary?.month || 0}
                        <span className="text-xs font-normal text-slate-400">h</span>
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{t("totalHours")}</p>
                      <p className="text-xl font-extrabold text-slate-900 font-mono mt-1">
                        {employeeSummary?.hoursSummary?.total || 0}
                        <span className="text-xs font-normal text-slate-400">h</span>
                      </p>
                    </div>
                  </div>

                  {/* Weekly Progress bar against 40h standard */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span>Wochensoll (40h):</span>
                      <span className="font-mono text-slate-800">
                        {Math.min(100, Math.round(((employeeSummary?.hoursSummary?.week || 0) / 40) * 100))}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.round(((employeeSummary?.hoursSummary?.week || 0) / 40) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* QR Code Zeiterfassung Card */}
              {employeeActiveTab === "overview" && (
                <div className="card-premium space-y-4 border-2 border-blue-500/20 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-blue-600" />
                      <span>QR-Code Zeiterfassung</span>
                    </h4>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                      Ein- & Ausgang
                    </span>
                  </div>

                  {employeeSummary?.activeShift ? (
                    <div className="space-y-3 text-center">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Beim Verlassen der Halle den offiziellen QR-Code am Ausgang scannen.
                      </p>
                      <button
                        onClick={() => setIsQrScannerOpen(true)}
                        disabled={clockLoading}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" />
                        <span>{clockLoading ? "Wird verarbeitet..." : "📷 QR-Code scannen (Ausstempeln)"}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 text-center space-y-2">
                        <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-sm">
                          <ScanLine className="w-6 h-6 animate-pulse" />
                        </div>
                        <p className="font-bold text-slate-800 text-xs">
                          Hallen QR-Code beim Eingang scannen
                        </p>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Scannen Sie den QR-Code am Halleneingang um Ihre Schicht zu starten.
                        </p>
                      </div>

                      <button
                        onClick={() => setIsQrScannerOpen(true)}
                        disabled={clockLoading}
                        className="w-full btn-primary py-3 text-xs font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>{clockLoading ? "Wird verarbeitet..." : "📷 QR-Code scannen (Einstempeln)"}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Personal Profile Details Card */}
              {(employeeActiveTab === "overview" || employeeActiveTab === "profile") && (
                <div className="card-premium space-y-3">
                  <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" /> {t("profileDetails")}
                  </h4>
                  <div className="divide-y divide-slate-100 text-xs text-slate-600">
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-400">{t("usernameLabel")}</span>
                      <span className="font-semibold text-slate-800 font-mono">{employeeInfo?.username}</span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-400">{t("employmentStart")}</span>
                      <span suppressHydrationWarning className="font-semibold text-slate-800">
                        {employeeSummary?.employmentStart
                          ? new Date(employeeSummary.employmentStart).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")
                          : "—"}
                      </span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-400">{t("phone")}</span>
                      <span className="font-semibold text-slate-800">{employeeInfo?.phone}</span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-400">{t("email")}</span>
                      <span className="font-semibold text-slate-800">{employeeInfo?.email || "—"}</span>
                    </div>
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-400">{t("telegramId")}</span>
                      <span className="font-semibold text-slate-800">{employeeInfo?.telegramId || "—"}</span>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Right Column (Shifts & Timesheet Work Logs) */}
            <div className={`lg:col-span-2 space-y-6 ${employeeActiveTab === "profile" ? "hidden sm:block" : ""}`}>
              
              {/* Scheduled & Upcoming Shifts */}
              {(employeeActiveTab === "overview" || employeeActiveTab === "shifts") && (
                <div className="card-premium p-0 overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span>{language === "de" ? "Geplante Schichten" : "Scheduled Shifts"}</span>
                    </h5>
                    {employeeSummary?.plansUpcoming?.length > 0 && (
                      <span className="badge-premium badge-info text-[10px] font-bold">
                        {employeeSummary.plansUpcoming.length} {language === "de" ? "Schicht(en)" : "Shift(s)"}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {(!employeeSummary?.plansUpcoming || employeeSummary.plansUpcoming.length === 0) &&
                    (!employeeSummary?.plansToday || employeeSummary.plansToday.length === 0) ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        <Calendar className="w-7 h-7 text-slate-200 mx-auto mb-1.5" />
                        <p>{language === "de" ? "Keine kommenden Schichten geplant." : "No upcoming shifts scheduled."}</p>
                      </div>
                    ) : (
                      (employeeSummary?.plansUpcoming || [...(employeeSummary?.plansToday || []), ...(employeeSummary?.plansTomorrow || [])]).map((p: any) => {
                        const planDateStr = new Date(p.date).toLocaleDateString('en-CA');
                        const todayStr = new Date().toLocaleDateString('en-CA');
                        const tom = new Date();
                        tom.setDate(tom.getDate() + 1);
                        const tomStr = tom.toLocaleDateString('en-CA');

                        let dateLabel = new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA");
                        let badgeClass = "bg-slate-100 text-slate-700 border-slate-200";
                        if (planDateStr === todayStr) {
                          dateLabel = language === "de" ? "HEUTE" : "TODAY";
                          badgeClass = "bg-blue-100 text-blue-800 border-blue-200 font-bold";
                        } else if (planDateStr === tomStr) {
                          dateLabel = language === "de" ? "MORGEN" : "TOMORROW";
                          badgeClass = "bg-amber-100 text-amber-800 border-amber-200 font-bold";
                        }

                        return (
                          <div key={p.id} className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between sm:items-start hover:bg-slate-50/50 transition-colors gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${badgeClass}`}>
                                  {dateLabel}
                                </span>
                                <span suppressHydrationWarning className="text-[11px] font-mono text-slate-400">
                                  {new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}
                                </span>
                              </div>
                              {p.locations && Array.isArray(p.locations) && p.locations.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  {p.locations.map((loc: any, lidx: number) => (
                                    <span key={lidx} className="inline-flex items-center gap-1 bg-white text-slate-800 text-xs font-bold px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                                      <Warehouse className="w-3 h-3 text-blue-600 shrink-0" />
                                      <span>{loc.warehouseName || loc.warehouse?.name || p.warehouseName || "Lager"}</span>
                                      <span className="text-slate-300">|</span>
                                      <span className="text-slate-600">{loc.hallName || loc.hall?.name || p.hallName || "Halle"}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-sm font-bold text-slate-900 block mt-1">
                                  {p.warehouseName} — {p.hallName}
                                </span>
                              )}
                              <div className="flex flex-wrap gap-2 mt-2">
                                {p.shift && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">
                                    <Clock className="w-3 h-3" /> {p.shift}
                                  </span>
                                )}
                                {p.treffpunkt && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                                    <MapPin className="w-3 h-3 text-amber-600" /> {p.treffpunkt}{p.treffpunktTime ? ` (${p.treffpunktTime})` : ""}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
                                  <Users className="w-3 h-3 text-slate-400" />
                                  {p.assignedEmployees?.length || 0} {language === "de" ? "Mitarbeiter" : "Staff"}
                                </span>
                                <span className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
                                  <Package className="w-3 h-3 text-slate-400" />
                                  {p.assignedContainers?.length || 0} {language === "de" ? "Container" : "Containers"}
                                </span>
                              </div>
                              {p.notes && (
                                <p className="text-[10px] text-slate-500 mt-1.5 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                                  "{p.notes}"
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => setSelectedPlanForView(p)}
                              className="btn-secondary py-1.5 px-3 text-[10px] uppercase font-bold tracking-wider hover:bg-slate-50 cursor-pointer self-start sm:self-center shrink-0"
                            >
                              {t("viewDetails")}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Past Shifts History (Shown on Shifts tab or Desktop) */}
              {(employeeActiveTab === "shifts" || (employeeActiveTab === "overview" && (!employeeSummary?.plansUpcoming || employeeSummary.plansUpcoming.length === 0))) && (
                <div className="card-premium p-0 overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <History className="w-4 h-4 text-slate-500" /> {t("shiftHistory")}
                    </h5>
                    {employeeSummary?.plansHistory?.length > 0 && (
                      <span className="text-[10px] font-mono text-slate-400 font-semibold">
                        {employeeSummary.plansHistory.length} {language === "de" ? "Einträge" : "Records"}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
                    {!employeeSummary?.plansHistory || employeeSummary.plansHistory.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        <p>{t("noPastShifts")}</p>
                      </div>
                    ) : (
                      employeeSummary.plansHistory.map((p: any) => (
                        <div key={p.id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-center hover:bg-slate-50/30 transition-colors gap-2.5">
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">
                              {p.warehouseName} — {p.hallName}
                            </span>
                            <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-slate-400 font-semibold">
                              <span suppressHydrationWarning className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                {new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}
                              </span>
                              {p.shift && (
                                <span className="font-mono text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                  {p.shift}
                                </span>
                              )}
                              <span>{p.assignedContainers?.length || 0} Container</span>
                            </div>
                          </div>
                          <button
                            onClick={() => setSelectedPlanForView(p)}
                            className="btn-secondary py-1 px-2.5 text-[10px] uppercase font-bold tracking-wider hover:bg-slate-50 cursor-pointer self-start sm:self-center"
                          >
                            {t("details")}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Work Logs & Timesheets: Mobile Cards + Desktop Table (Hidden when isWorkHoursHidden is true) */}
              {!isWorkHoursHidden && (employeeActiveTab === "overview" || employeeActiveTab === "logs") && (
                <div className="card-premium p-0 overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>{t("timesheetsTitle")}</span>
                    </h5>
                    <button
                      onClick={() => setIsLogHoursOpen(true)}
                      className="btn-primary py-1.5 px-3 text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t("logHoursCTA")}</span>
                    </button>
                  </div>

                  {/* Empty state */}
                  {!employeeSummary?.workHistory || employeeSummary.workHistory.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                      <Clock className="w-8 h-8 text-slate-200 mx-auto" />
                      <p>{t("noAttendanceLogs")}</p>
                      <button
                        onClick={() => setIsLogHoursOpen(true)}
                        className="btn-secondary py-1.5 px-3 text-xs font-semibold cursor-pointer"
                      >
                        + Erste Arbeitszeit erfassen
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Mobile Card List (< sm screens) */}
                      <div className="sm:hidden divide-y divide-slate-100">
                        {employeeSummary.workHistory.map((r: any) => {
                          const isManual = r.source === "MANUAL";
                          return (
                            <div key={r.id} className="p-4 space-y-2.5 hover:bg-slate-50/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <span suppressHydrationWarning className="font-bold text-xs text-slate-900 font-mono">
                                  {new Date(r.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA", {
                                    weekday: "short",
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                  })}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {isManual ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                                      <span>Manuell</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                                      <QrCode className="w-3 h-3" />
                                      <span>QR-Scan</span>
                                    </span>
                                  )}
                                  <span className="text-xs font-black font-mono bg-slate-100 text-slate-800 px-2 py-0.5 rounded-lg border border-slate-200">
                                    {r.totalHours ? `${r.totalHours}h` : t("activeShiftLabel")}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <Warehouse className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="font-medium truncate">{r.warehouseName} — {r.hallName}</span>
                              </div>

                              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  <span>
                                    {new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {" → "}
                                    {r.clockOut ? new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "läuft"}
                                  </span>
                                  {r.breakMinutes > 0 && (
                                    <span className="text-slate-400">
                                      (Pause: {r.breakMinutes}m)
                                    </span>
                                  )}
                                </div>

                                {isManual && (
                                  <button
                                    onClick={() => handleDeleteAttendanceEntry(r.id)}
                                    className="text-red-500 hover:text-red-700 font-sans font-semibold text-[10px] flex items-center gap-1 cursor-pointer p-1 rounded hover:bg-red-50"
                                    title="Löschen"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Löschen</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table View (>= sm screens) */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500">
                              <th className="px-5 py-3 font-semibold">{t("date")}</th>
                              <th className="px-5 py-3 font-semibold">{t("warehouse")}</th>
                              <th className="px-4 py-3 font-semibold">Zeitraum</th>
                              <th className="px-3 py-3 font-semibold text-center">{t("breakDuration")}</th>
                              <th className="px-4 py-3 font-semibold text-right">{t("totalHours")}</th>
                              <th className="px-4 py-3 font-semibold text-center">Quelle</th>
                              <th className="px-4 py-3 font-semibold text-right">Aktion</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-600">
                            {employeeSummary.workHistory.map((r: any) => {
                              const isManual = r.source === "MANUAL";
                              return (
                                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td suppressHydrationWarning className="px-5 py-3 font-mono text-slate-800 font-semibold">
                                    {new Date(r.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}
                                  </td>
                                  <td className="px-5 py-3 text-slate-700 font-medium">
                                    {r.warehouseName} — {r.hallName}
                                  </td>
                                  <td suppressHydrationWarning className="px-4 py-3 font-mono text-slate-500">
                                    {new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {" – "}
                                    {r.clockOut ? new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Aktiv"}
                                  </td>
                                  <td className="px-3 py-3 font-mono text-center text-slate-500">
                                    {r.breakMinutes ? `${r.breakMinutes}m` : "—"}
                                  </td>
                                  <td className="px-4 py-3 font-mono text-right text-slate-900 font-bold">
                                    {r.totalHours ? `${r.totalHours}h` : t("activeShiftLabel")}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {isManual ? (
                                      <span className="inline-flex items-center text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                                        Manuell
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                                        <QrCode className="w-3 h-3" />
                                        <span>QR</span>
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {isManual && (
                                      <button
                                        onClick={() => handleDeleteAttendanceEntry(r.id)}
                                        className="text-slate-400 hover:text-red-600 transition-colors p-1 rounded-md hover:bg-red-50 cursor-pointer inline-flex items-center"
                                        title="Löschen"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Sticky Mobile Bottom Bar for Mitarbeiter (< sm screens) */}
          <div
            className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-3 z-40 sm:hidden flex items-center gap-3 shadow-lg shadow-slate-900/10"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {!isWorkHoursHidden && (
              <button
                onClick={() => setIsLogHoursOpen(true)}
                className="flex-1 btn-primary py-3 text-xs font-extrabold flex items-center justify-center gap-2 shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>{t("logHoursCTA")}</span>
              </button>
            )}
            <button
              onClick={() => setIsQrScannerOpen(true)}
              disabled={clockLoading}
              className={`${isWorkHoursHidden ? "w-full" : ""} btn-secondary py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 shrink-0`}
            >
              <Camera className="w-4 h-4 text-blue-600" />
              <span>QR-Scan</span>
            </button>
          </div>
        </div>
      ) : (
        /* 2. MANAGER & ADMIN DASHBOARD */
        <div className="space-y-6 print:hidden">
          {/* Welcome header & Admin/Manager Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">
                {userRole === "MANAGER" ? t("roleManager") + " Dashboard" : t("operationalDashboard")}
              </h3>
              <p className="text-slate-500 text-xs mt-1">
                {t("statusOverview")}
              </p>
            </div>

            {/* Global Work Hours & Timesheets Visibility Control for Admin & Manager */}
            <WorkHoursVisibilityToggle
              onVisibilityChange={(hidden) => setIsGlobalWorkHoursHidden(hidden)}
            />
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            
            {/* Total Employees */}
            <div className="card-premium">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  {t("totalEmployees")}
                </span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <h4 className="text-2xl font-bold font-mono tracking-tight text-slate-800">
                  {metrics.employeesCount}
                </h4>
                <span className="badge-premium badge-success py-0.5 px-1.5 text-[9px] flex items-center gap-0.5 font-semibold">
                  <TrendingUp className="w-2.5 h-2.5 text-emerald-600" /> +2.4%
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Registered personnel</p>
            </div>

            {/* Active Today */}
            <div className="card-premium">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  {t("activeToday")}
                </span>
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <h4 className="text-2xl font-bold font-mono tracking-tight text-blue-600">
                  {metrics.activeTodayCount}
                </h4>
                <span className="badge-premium badge-info py-0.5 px-1.5 text-[9px] flex items-center gap-0.5 animate-pulse font-semibold">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> {t("live")}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Currently clocked-in staff</p>
            </div>

            {/* Containers Today */}
            <div className="card-premium">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  {t("totalContainers")}
                </span>
                <Package className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <h4 className="text-2xl font-bold font-mono tracking-tight text-slate-800">
                  {metrics.containersCount}
                </h4>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Routed containers queue</p>
            </div>

            {/* Active Halls */}
            <div className="card-premium">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  {t("activeHalls")}
                </span>
                <Grid className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <h4 className="text-2xl font-bold font-mono tracking-tight text-slate-800">
                  {metrics.hallsCount}
                </h4>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Assigned staging zones</p>
            </div>
          </div>

          {/* ── Dashboard Analytics Charts (Soll vs. Ist & Team Trend) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Employee Soll vs. Ist Comparison */}
            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    Mitarbeiter-Arbeitszeiten: Soll vs. Ist
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {analyticsData?.range?.label || "Aktueller Zeitraum"} (Soll: {analyticsTimeframe === 'weekly' ? '40h' : '160h'})
                  </p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => { setAnalyticsTimeframe("weekly"); fetchAnalytics("weekly"); }}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      analyticsTimeframe === "weekly" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Wöchentlich
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAnalyticsTimeframe("monthly"); fetchAnalytics("monthly"); }}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      analyticsTimeframe === "monthly" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Monatlich
                  </button>
                </div>
              </div>

              {/* Employee rows */}
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {analyticsLoading ? (
                  <div className="py-12 flex justify-center items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : !analyticsData?.employeeStats || analyticsData.employeeStats.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400 italic">
                    Keine Mitarbeiterdaten für diesen Zeitraum vorhanden.
                  </div>
                ) : (
                  analyticsData.employeeStats.map((emp: any) => {
                    const pct = Math.min(100, emp.percentage || 0);
                    const isOvertime = emp.ist >= emp.soll;
                    return (
                      <div key={emp.id} className="p-3 bg-slate-50/70 hover:bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 transition-colors">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-800">{emp.name}</span>
                            {emp.absenceDays > 0 && (
                              <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded font-bold">
                                {emp.absenceDays} Abwesenheit(en)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-800">
                              {emp.ist.toFixed(1)} / {emp.soll.toFixed(0)} h
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isOvertime ? "bg-emerald-100 text-emerald-800 font-mono" : emp.ist > 0 ? "bg-blue-100 text-blue-800 font-mono" : "bg-slate-200 text-slate-600"
                            }`}>
                              {emp.percentage}%
                            </span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isOvertime ? "bg-emerald-500" : emp.ist > 0 ? "bg-blue-600" : "bg-slate-300"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Chart 2: Total Working Hours Trend */}
            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    Gesamtarbeitszeit aller Mitarbeiter
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Summierte Teamstunden & Auslastung im Zeitverlauf
                  </p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => { setAnalyticsTimeframe("weekly"); fetchAnalytics("weekly"); }}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      analyticsTimeframe === "weekly" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Wöchentlich
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAnalyticsTimeframe("monthly"); fetchAnalytics("monthly"); }}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      analyticsTimeframe === "monthly" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Monatlich
                  </button>
                </div>
              </div>

              {/* Summary metrics header */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-blue-50/70 border border-blue-100 p-2.5 rounded-xl">
                  <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Gesamtstunden</p>
                  <p className="text-lg font-mono font-extrabold text-blue-950 mt-0.5">
                    {analyticsData?.summary?.totalIst?.toFixed(1) || "0.0"} h
                  </p>
                </div>
                <div className="bg-emerald-50/70 border border-emerald-100 p-2.5 rounded-xl">
                  <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Aktive Mitarbeiter</p>
                  <p className="text-lg font-mono font-extrabold text-emerald-950 mt-0.5">
                    {analyticsData?.summary?.activeEmployeesCount || 0}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Team Soll-Summe</p>
                  <p className="text-lg font-mono font-extrabold text-slate-800 mt-0.5">
                    {analyticsData?.summary?.totalSoll?.toFixed(0) || "0"} h
                  </p>
                </div>
              </div>

              {/* Trend Bars */}
              <div className="space-y-2.5 pt-1 max-h-[280px] overflow-y-auto pr-1">
                {analyticsLoading ? (
                  <div className="py-12 flex justify-center items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                  </div>
                ) : !analyticsData?.aggregatedTrend || analyticsData.aggregatedTrend.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400 italic">
                    Keine Trenddaten für diesen Zeitraum vorhanden.
                  </div>
                ) : (
                  (() => {
                    const maxH = Math.max(...analyticsData.aggregatedTrend.map((t: any) => t.totalHours), 1);
                    return analyticsData.aggregatedTrend.map((tItem: any, idx: number) => {
                      const barWidth = Math.min(100, Math.round((tItem.totalHours / maxH) * 100));
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold text-slate-700">{tItem.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">
                                {tItem.activeCount} Mitarbeiter
                              </span>
                              <span className="font-mono font-bold text-slate-900">
                                {tItem.totalHours.toFixed(1)} h
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-linear-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </div>
          </div>

          {/* Active Employee Calendar (Gantt style timeline) */}
          <ActiveEmployeeCalendar
            logs={dailyAttendance}
            loading={loading}
          />

          {/* Quick Operations Section */}
          <div className="space-y-3">
            <h6 className="text-[10px] font-bold tracking-widest text-[#4b5563] uppercase px-1">
              {t("quickOperations")}
            </h6>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Link
                href="/planning"
                className="flex items-center gap-4 p-5 bg-white border border-slate-100 rounded-xl hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all group text-left cursor-pointer shadow-sm"
              >
                <div className="w-10 h-10 flex items-center justify-center bg-blue-50 border border-blue-100 rounded-lg text-blue-600 group-hover:scale-105 transition-transform shrink-0">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-xs">{t("createNewPlan")}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">{t("createPlanDesc")}</span>
                </div>
              </Link>

              <Link
                href="/containers"
                className="flex items-center gap-4 p-5 bg-white border border-slate-100 rounded-xl hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all group text-left cursor-pointer shadow-sm"
              >
                <div className="w-10 h-10 flex items-center justify-center bg-blue-50 border border-blue-100 rounded-lg text-blue-600 group-hover:scale-105 transition-transform shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-xs">{t("containers")}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">{t("containersDesc")}</span>
                </div>
              </Link>

              <Link
                href="/employees"
                className="flex items-center gap-4 p-5 bg-white border border-slate-100 rounded-xl hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all group text-left cursor-pointer shadow-sm"
              >
                <div className="w-10 h-10 flex items-center justify-center bg-blue-50 border border-blue-100 rounded-lg text-blue-600 group-hover:scale-105 transition-transform shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-xs">{t("employees")}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">{t("staffDesc")}</span>
                </div>
              </Link>
            </div>
          </div>

          {/* Grid Layout: Active Shift Plans & Activity Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Active Shift Plans */}
            <div className="lg:col-span-2 card-premium p-0 overflow-hidden flex flex-col justify-between">
              <div>
                <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50/50 gap-3">
                  <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    {t("shiftPlans")} {showAllPlans ? `(${t("showingAll")})` : `(${selectedDate})`}
                  </h5>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage && plans.length > 0 && (
                      <button
                        onClick={() => {
                          if (selectedPlanIds.length === plans.length) {
                            setSelectedPlanIds([]);
                          } else {
                            setSelectedPlanIds(plans.map(p => p.id));
                          }
                        }}
                        className="bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        {selectedPlanIds.length === plans.length ? "Keine auswählen" : "Alle auswählen"}
                      </button>
                    )}

                    {!showAllPlans && (
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="input-premium py-1 px-2 text-xs w-36"
                      />
                    )}
                    
                    <button
                      onClick={() => setShowAllPlans(!showAllPlans)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                        showAllPlans
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {showAllPlans ? t("showingAll") : t("showAllPlans")}
                    </button>

                    <Link
                      href="/planning"
                      className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all flex items-center gap-1"
                    >
                      {t("createNewPlan")} <PlusCircle className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                {/* Bulk Action Bar */}
                {selectedPlanIds.length > 0 && (
                  <div className="bg-blue-50/50 border-b border-blue-150 px-6 py-4 flex flex-wrap items-center gap-3 text-xs animate-fadeIn">
                    <span className="text-blue-800 font-bold flex items-center gap-1.5 mr-2">
                      <Users className="w-4 h-4" />
                      <span>{selectedPlanIds.length} Pläne ausgewählt:</span>
                    </span>

                    {/* Bulk Delete */}
                    <button
                      onClick={handleBulkDeletePlans}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Löschen
                    </button>

                    {/* Bulk Duplicate */}
                    <button
                      onClick={handleBulkDuplicatePlans}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                    >
                      Duplizieren
                    </button>

                    {/* Bulk Assign Employees */}
                    <button
                      onClick={() => setBulkAssignEmployeesModalOpen(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                    >
                      <Users className="w-3.5 h-3.5" /> Mitarbeiter zuweisen
                    </button>

                    {/* Bulk Change Hall */}
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkChangeHallPlans(e.target.value);
                          e.target.value = "";
                        }
                      }}
                      className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold text-slate-700 outline-none hover:border-slate-350 cursor-pointer"
                      defaultValue=""
                    >
                      <option value="" disabled>Halle ändern...</option>
                      {allHalls.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>

                    {/* Bulk Change Shift */}
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkChangeShiftPlans(e.target.value);
                          e.target.value = "";
                        }
                      }}
                      className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold text-slate-700 outline-none hover:border-slate-350 cursor-pointer"
                      defaultValue=""
                    >
                      <option value="" disabled>Schicht ändern...</option>
                      <option value="FRUEH">Frühschicht</option>
                      <option value="SPAET">Spätschicht</option>
                      <option value="NACHT">Nachtschicht</option>
                    </select>

                    {/* Clear selection */}
                    <button
                      onClick={() => setSelectedPlanIds([])}
                      className="text-slate-500 hover:text-slate-800 font-bold ml-auto px-2 py-1 cursor-pointer"
                    >
                      Auswahl aufheben
                    </button>
                  </div>
                )}

                {plansLoading ? (
                  <div className="py-10 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {plans.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40 text-amber-500" />
                        <p className="text-xs font-medium">{t("noPlansConfigured")}</p>
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
                          className={`px-6 py-4 flex flex-col sm:flex-row justify-between sm:items-center hover:bg-slate-50/30 transition-colors gap-3 ${
                            selectedPlanIds.includes(p.id) ? "bg-blue-50/30" : ""
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
                                className="mr-3 text-slate-300 hover:text-blue-600 shrink-0 transition-colors cursor-pointer"
                              >
                                {selectedPlanIds.includes(p.id) ? (
                                  <CheckSquare className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            <div className="flex flex-col gap-1.5">
                              {p.locations && Array.isArray(p.locations) && p.locations.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {p.locations.map((loc: any, idx: number) => (
                                    <span key={idx} className="inline-flex items-center gap-1 bg-slate-100/80 text-slate-800 text-xs font-bold px-2 py-0.5 rounded-md border border-slate-200">
                                      <Warehouse className="w-3 h-3 text-blue-600 shrink-0" />
                                      <span>{loc.warehouseName || loc.warehouse?.name || p.warehouseName || "Lager"}</span>
                                      <span className="text-slate-300">|</span>
                                      <span className="text-slate-600 font-semibold">{loc.hallName || loc.hall?.name || p.hallName || "Halle"}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                  <Warehouse className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  {p.warehouseName || "Lager"} — {p.hallName || "Halle"}
                                </span>
                              )}
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-semibold">
                                <span suppressHydrationWarning className="font-mono text-blue-700 bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded font-bold">
                                  {new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}
                                </span>
                                {p.shift && (
                                  <span className="inline-flex items-center gap-1 font-mono bg-amber-50 text-amber-900 border border-amber-200/60 px-2 py-0.5 rounded">
                                    <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                    {p.shift}
                                  </span>
                                )}
                                {p.treffpunkt && (
                                  <span className="inline-flex items-center gap-1 font-sans bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                    <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                                    {p.treffpunkt} {p.treffpunktTime ? `(${p.treffpunktTime})` : ""}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 bg-slate-50 border border-slate-150 px-2 py-0.5 rounded text-slate-600">
                                  <Users className="w-3 h-3 text-slate-400 shrink-0" />
                                  {p.assignedEmployees?.length || 0} {language === "de" ? "Mitarbeiter" : "Staff"}
                                </span>
                                <span className="flex items-center gap-1 bg-slate-50 border border-slate-150 px-2 py-0.5 rounded text-slate-600">
                                  <Package className="w-3 h-3 text-slate-400 shrink-0" />
                                  {p.assignedContainers?.length || 0} {language === "de" ? "Container" : "Containers"}
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
                              className="btn-primary py-1.5 px-3.5 text-[10px] uppercase font-bold tracking-wider cursor-pointer"
                            >
                              {t("viewDetails")}
                            </button>
                            <Link
                              href={`/planning?date=${p.date.split("T")[0]}&warehouseId=${p.warehouseId}&hallId=${p.hallId}&planId=${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="btn-secondary py-1.5 px-3.5 text-[10px] uppercase font-bold tracking-wider cursor-pointer"
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
            <div className="lg:col-span-1 space-y-6">
              {userRole === "MANAGER" ? (
                <div className="card-premium p-0 overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-slate-500" /> {t("auditActivityLogs")}
                      </h5>
                      <Link href="/reports" className="text-blue-600 text-xs font-bold hover:underline flex items-center gap-1">
                        {t("reports")} <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                    
                    <div className="p-5 space-y-5 max-h-[500px] overflow-y-auto divide-y divide-slate-100">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-3 flex items-center gap-1.5 font-semibold">
                          <Users className="w-3.5 h-3.5 text-blue-600" /> {t("employeeActivity")}
                        </p>
                        <div className="space-y-2.5">
                          {recentActivityLogs.filter(log => ["LOGIN", "LOGOUT", "CLOCK_IN", "CLOCK_OUT"].includes(log.action)).length === 0 ? (
                            <p className="text-xs text-slate-400 italic">{t("noRecentActivity")}</p>
                          ) : (
                            recentActivityLogs
                              .filter(log => ["LOGIN", "LOGOUT", "CLOCK_IN", "CLOCK_OUT"].includes(log.action))
                              .slice(0, 5)
                              .map(log => (
                                <div key={log.id} className="text-xs p-3 bg-slate-50 border border-slate-100 rounded-lg flex flex-col gap-1">
                                  <div className="flex justify-between items-center">
                                    <span className="font-semibold text-slate-800">{log.user?.name || "System"}</span>
                                    <span suppressHydrationWarning className="text-[9px] text-slate-400 font-mono"> {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <span className="text-slate-500 text-[11px] leading-relaxed">{log.details}</span>
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      <div className="pt-5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-3 flex items-center gap-1.5 font-semibold">
                          <Shield className="w-3.5 h-3.5 text-slate-500" /> {t("adminActivity")}
                        </p>
                        <div className="space-y-2.5">
                          {recentActivityLogs.filter(log => !["LOGIN", "LOGOUT", "CLOCK_IN", "CLOCK_OUT"].includes(log.action)).length === 0 ? (
                            <p className="text-xs text-slate-400 italic">{t("noRecentActivity")}</p>
                          ) : (
                            recentActivityLogs
                              .filter(log => !["LOGIN", "LOGOUT", "CLOCK_IN", "CLOCK_OUT"].includes(log.action))
                              .slice(0, 5)
                              .map(log => (
                                <div key={log.id} className="text-xs p-3 bg-slate-50 border border-slate-100 rounded-lg flex flex-col gap-1">
                                  <div className="flex justify-between items-center">
                                    <span className="font-semibold text-slate-800">{log.user?.name || "System"}</span>
                                    <span suppressHydrationWarning className="text-[9px] text-slate-400 font-mono"> {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <span className="font-mono text-[9px] mt-0.5 uppercase text-blue-600 bg-blue-50 border border-blue-100/50 w-fit px-1.5 py-0.5 rounded font-bold">{log.action}</span>
                                  <span className="text-slate-500 text-[11px] leading-relaxed mt-1">{log.details}</span>
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
                <div className="card-premium p-0 overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h5 className="font-bold text-sm text-slate-800">{language === "de" ? "Aktuelle Systemereignisse" : "Recent System Events"}</h5>
                      <span className="badge-premium badge-info text-[9px] py-0.5 px-2">Operational</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      <div className="px-6 py-4 flex justify-between items-center hover:bg-slate-50/30 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">{language === "de" ? "Plan für Duisburg verarbeitet" : "Plan processed for Duisburg"}</span>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-mono mt-0.5">System • {language === "de" ? "Gerade eben" : "Just Now"}</span>
                        </div>
                        <span className="badge-premium badge-success text-[9px] py-0.5 px-2">{t("success")}</span>
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center hover:bg-slate-50/30 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">{language === "de" ? "Neuer Mitarbeiter hinzugefügt" : "New Employee Added"}</span>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-mono mt-0.5">Admin • {language === "de" ? "vor 1 Std." : "1h ago"}</span>
                        </div>
                        <span className="badge-premium badge-neutral text-[9px] py-0.5 px-2">Audit</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn print:hidden">
          <div className="bg-white border border-slate-100 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden animate-scaleIn">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">{t("shiftDetailsModalTitle")}</h4>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  {t("shiftDetailsSubtitle")}
                </p>
              </div>
              <button
                onClick={() => setSelectedPlanForView(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              {/* Warehouse & Shift Details */}
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">{t("shiftDate")} & {language === "de" ? "Arbeitszeit" : "Shift Time"}</span>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span suppressHydrationWarning className="font-mono text-blue-600 font-bold bg-blue-100/50 px-2 py-0.5 rounded">
                        {new Date(selectedPlanForView.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                      {selectedPlanForView.shift && (
                        <span className="inline-flex items-center gap-1 font-mono text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          {selectedPlanForView.shift}
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedPlanForView.treffpunkt && (
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">{language === "de" ? "Treffpunkt" : "Meeting Point"}</span>
                      <span className="font-semibold text-slate-800 mt-1 flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200/60">
                        <MapPin className="w-3.5 h-3.5 text-amber-600" />
                        {selectedPlanForView.treffpunkt} {selectedPlanForView.treffpunktTime ? `(${selectedPlanForView.treffpunktTime})` : ""}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold mb-1.5">
                    {language === "de" ? "Einsatzstandorte (Lager & Hallen)" : "Assigned Locations (Warehouses & Halls)"}
                  </span>
                  {selectedPlanForView.locations && Array.isArray(selectedPlanForView.locations) && selectedPlanForView.locations.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPlanForView.locations.map((loc: any, idx: number) => (
                        <span key={idx} className="inline-flex items-center gap-1.5 bg-white text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 font-semibold shadow-2xs">
                          <Warehouse className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{loc.warehouseName || loc.warehouse?.name || selectedPlanForView.warehouseName || "Lager"}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-600">{loc.hallName || loc.hall?.name || selectedPlanForView.hallName || "Halle"}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 bg-white p-2.5 rounded-lg border border-slate-200/60">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold">{t("depotLocation")}</span>
                        <span className="font-bold text-slate-800 block mt-0.5">{selectedPlanForView.warehouseName || "—"}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold">{t("stagingHall")}</span>
                        <span className="font-bold text-slate-800 block mt-0.5">{selectedPlanForView.hallName || "—"}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Staff Roster */}
              <div className="space-y-2.5">
                <h5 className="font-bold text-xs text-slate-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" /> {t("assignedStaff")} ({selectedPlanForView.assignedEmployees?.length || 0})
                </h5>
                <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                        <th className="px-4 py-2 font-semibold">{t("nameColumn")}</th>
                        <th className="px-4 py-2 font-semibold">{t("roleColumn")}</th>
                        <th className="px-4 py-2 font-semibold">{t("phone")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!selectedPlanForView.assignedEmployees || selectedPlanForView.assignedEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-400 italic">{t("noStaffAssigned")}</td>
                        </tr>
                      ) : (
                        selectedPlanForView.assignedEmployees.map((emp, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-medium text-slate-850">{emp.name}</td>
                            <td className="px-4 py-2.5">
                              <span className="badge-premium badge-info text-[9px] py-0.5 px-2">
                                {emp.role}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-slate-500">{emp.phone || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Container Queue */}
              <div className="space-y-2.5">
                <h5 className="font-bold text-xs text-slate-800 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" /> {t("routedContainers")} ({selectedPlanForView.assignedContainers?.length || 0})
                </h5>
                <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                        <th className="px-4 py-2 font-semibold">{t("containerNumber")}</th>
                        <th className="px-4 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!selectedPlanForView.assignedContainers || selectedPlanForView.assignedContainers.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-slate-400 italic">{t("noContainersRouted")}</td>
                        </tr>
                      ) : (
                        selectedPlanForView.assignedContainers.map((c, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-mono text-slate-850 font-semibold">{c.containerNumber}</td>
                            <td className="px-4 py-2.5">
                              <span className={`badge-premium text-[9px] py-0.5 px-2 ${
                                c.status === "FULL" 
                                  ? "badge-warning" 
                                  : "badge-success"
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
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <button
                onClick={() => setSelectedPlanForView(null)}
                className="btn-secondary py-1.5 px-4 cursor-pointer"
              >
                {t("close")}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExportCSV(selectedPlanForView)}
                  className="btn-secondary py-1.5 px-4 cursor-pointer text-xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" /> {t("exportCsv")}
                </button>
                <button
                  onClick={() => window.print()}
                  className="btn-primary py-1.5 px-4 cursor-pointer text-xs"
                >
                  <Printer className="w-3.5 h-3.5 text-white" /> {t("printPlan")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Assign Employees Modal ── */}
      {bulkAssignEmployeesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border border-slate-100 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-blue-500" />
                Massen-Mitarbeiterzuweisung
              </h4>
              <button
                onClick={() => {
                  setBulkAssignEmployeesModalOpen(false);
                  setBulkSelectedEmployeeIds([]);
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-slate-500">
                Wählen Sie die Mitarbeiter aus, die Sie allen {selectedPlanIds.length} ausgewählten Plänen zuweisen möchten:
              </p>
              <div className="space-y-2">
                {dashboardEmployees.map((emp) => {
                  const isChecked = bulkSelectedEmployeeIds.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      className="flex items-center gap-2.5 p-2 hover:bg-slate-50 rounded-lg border border-slate-100 cursor-pointer text-xs transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setBulkSelectedEmployeeIds(prev => prev.filter(id => id !== emp.id));
                          } else {
                            setBulkSelectedEmployeeIds(prev => [...prev, emp.id]);
                          }
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-semibold text-slate-800">{emp.name}</span>
                        <span className="text-[10px] text-slate-450 block">{emp.role} {emp.hallName ? `• ${emp.hallName}` : ""}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => {
                  setBulkAssignEmployeesModalOpen(false);
                  setBulkSelectedEmployeeIds([]);
                }}
                className="btn-secondary py-1.5 px-4 cursor-pointer text-xs"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  handleBulkAssignEmployeesPlans(bulkSelectedEmployeeIds);
                  setBulkAssignEmployeesModalOpen(false);
                  setBulkSelectedEmployeeIds([]);
                }}
                className="btn-primary py-1.5 px-4 cursor-pointer text-xs"
                disabled={bulkSelectedEmployeeIds.length === 0}
              >
                Zuweisen
              </button>
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
            {selectedPlanForView.shift && <div><strong>Shift Time:</strong> {selectedPlanForView.shift}</div>}
            <div className="col-span-2">
              <strong>Assigned Locations:</strong>{" "}
              {selectedPlanForView.locations && selectedPlanForView.locations.length > 0
                ? selectedPlanForView.locations.map((l: any) => `${l.warehouseName || l.warehouse?.name || selectedPlanForView.warehouseName} (${l.hallName || l.hall?.name || selectedPlanForView.hallName})`).join(", ")
                : `${selectedPlanForView.warehouseName} — ${selectedPlanForView.hallName}`}
            </div>
            {selectedPlanForView.treffpunkt && (
              <div className="col-span-2"><strong>Meeting Point:</strong> {selectedPlanForView.treffpunkt} {selectedPlanForView.treffpunktTime ? `at ${selectedPlanForView.treffpunktTime}` : ""}</div>
            )}
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

      {/* QR Code Camera / Image Scanner Modal for Mitarbeiter */}
      <QRScannerCameraModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        isLoading={clockLoading}
        onScanSuccess={({ warehouseId, hallId }) => {
          handleQrScan(warehouseId, hallId);
        }}
      />

      {/* Employee Log Hours Modal (Special UI/UX for Mitarbeiter) */}
      <EmployeeLogHoursModal
        isOpen={isLogHoursOpen}
        onClose={() => setIsLogHoursOpen(false)}
        onSuccess={() => {
          refreshEmployeeData();
          showAlert({
            title: t("success"),
            message: "Arbeitszeit erfolgreich erfasst!",
            type: "success",
          });
        }}
        employeeId={employeeInfo?.id || ""}
        defaultWarehouseId={employeeInfo?.warehouseId}
        defaultHallId={employeeInfo?.hallId}
        warehouses={allWarehouses}
        halls={allHalls}
      />

      {/* Custom Popup Alert Modal */}
      <CustomAlertModal
        {...alertConfig}
        onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
