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
import ActiveEmployeeCalendar from "../components/ActiveEmployeeCalendar";
import CustomAlertModal, { CustomAlertOptions } from "../components/CustomAlertModal";

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
  const [alertConfig, setAlertConfig] = useState<CustomAlertOptions>({
    isOpen: false,
    message: "",
  });
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
  const [dailyAttendance, setDailyAttendance] = useState<any[]>([]);
  const [dashboardEmployees, setDashboardEmployees] = useState<any[]>([]);
  const [bulkAssignEmployeesModalOpen, setBulkAssignEmployeesModalOpen] = useState(false);
  const [bulkSelectedEmployeeIds, setBulkSelectedEmployeeIds] = useState<string[]>([]);

  const showAlert = (options: Omit<CustomAlertOptions, "isOpen">) => {
    setAlertConfig({ ...options, isOpen: true });
  };

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
          if (isOffline) {
            showAlert({ title: "Simuliert", message: "Schichtpläne im Offline-Modus dupliziert!", type: "info" });
            setSelectedPlanIds([]);
            return;
          }

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
      if (isOffline) {
        showAlert({ title: "Simuliert", message: "Halle im Offline-Modus geändert!", type: "info" });
        setSelectedPlanIds([]);
        return;
      }

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
      if (isOffline) {
        showAlert({ title: "Simuliert", message: "Schicht im Offline-Modus geändert!", type: "info" });
        setSelectedPlanIds([]);
        return;
      }

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
      if (isOffline) {
        showAlert({ title: "Simuliert", message: "Mitarbeiter im Offline-Modus zugewiesen!", type: "info" });
        setSelectedPlanIds([]);
        return;
      }

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

          // Generate mock today date format
          const baseToday = new Date();
          const yyyy = baseToday.getFullYear();
          const mm = String(baseToday.getMonth() + 1).padStart(2, "0");
          const dd = String(baseToday.getDate()).padStart(2, "0");
          const todayPrefix = `${yyyy}-${mm}-${dd}`;

          setDailyAttendance([
            {
              id: "att-mock-1",
              employeeId: "emp-1",
              employeeName: "Alex Arbeiter",
              employee: { id: "emp-1", name: "Alex Arbeiter", phone: "+491701111111" },
              clockIn: `${todayPrefix}T06:30:00.000Z`,
              clockOut: null,
              warehouseId: "wh-1",
              warehouseName: "Duisburg Port Hub",
              hallId: "hall-1",
              hallName: "Hall A",
              date: `${todayPrefix}T00:00:00.000Z`
            },
            {
              id: "att-mock-2",
              employeeId: "emp-2",
              employeeName: "Bella Buche",
              employee: { id: "emp-2", name: "Bella Buche", phone: "+491702222222" },
              clockIn: `${todayPrefix}T08:00:00.000Z`,
              clockOut: `${todayPrefix}T16:00:00.000Z`,
              warehouseId: "wh-1",
              warehouseName: "Duisburg Port Hub",
              hallId: "hall-2",
              hallName: "Hall B",
              date: `${todayPrefix}T00:00:00.000Z`
            },
            {
              id: "att-mock-3",
              employeeId: "emp-3",
              employeeName: "Chris Container",
              employee: { id: "emp-3", name: "Chris Container", phone: "+491703333333" },
              clockIn: `${todayPrefix}T09:15:00.000Z`,
              clockOut: null,
              warehouseId: "wh-2",
              warehouseName: "Wesel NRW-North",
              hallId: "hall-3",
              hallName: "Hall A",
              date: `${todayPrefix}T00:00:00.000Z`
            },
            {
              id: "att-mock-4",
              employeeId: "emp-4",
              employeeName: "Dieter Depots",
              employee: { id: "emp-4", name: "Dieter Depots", phone: "+491704444444" },
              clockIn: `${todayPrefix}T07:45:00.000Z`,
              clockOut: null,
              warehouseId: "wh-2",
              warehouseName: "Wesel NRW-North",
              hallId: "hall-3",
              hallName: "Hall A",
              date: `${todayPrefix}T00:00:00.000Z`
            }
          ]);

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
        <div className="space-y-6 print:hidden">
          {/* Welcome Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">
                {t("employeeDashboard")}
              </h3>
              <p className="text-slate-500 text-xs mt-1">
                {t("welcomeBack")}, <span className="font-semibold text-slate-800">{employeeInfo?.name || "Mitarbeiter"}</span>. {t("manageShiftsDesc")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {employeeSummary?.activeShift ? (
                <span className="badge-premium badge-success animate-pulse">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> {t("clockedIn")}
                </span>
              ) : (
                <span className="badge-premium badge-error">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span> {t("clockedOut")}
                </span>
              )}
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Side: Clock Widget, Stats & Profile */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Clock In / Clock Out Card */}
              <div className="card-premium space-y-4">
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" /> {t("timeTracking")}
                </h4>
                
                {employeeSummary?.activeShift ? (
                  <div className="space-y-4">
                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 space-y-2">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{t("currentShift")}</p>
                      <p className="font-bold text-slate-800 text-sm">{employeeSummary.activeShift.warehouseName}</p>
                      <p className="text-xs text-slate-500">{employeeSummary.activeShift.hallName}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-2">
                        <LogIn className="w-3.5 h-3.5 text-emerald-500" />
                        {language === "de" ? "Seit" : "Since"} {new Date(employeeSummary.activeShift.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {language === "de" ? "Uhr" : ""}
                      </p>
                    </div>
                    <button
                      onClick={handleClockInOut}
                      disabled={clockLoading}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {clockLoading ? (language === "de" ? "Wird verarbeitet..." : "Processing...") : t("clockOutButton")}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {t("selectWarehouse")}
                      </label>
                      <select
                        value={clockInWarehouseId}
                        onChange={(e) => {
                          setClockInWarehouseId(e.target.value);
                          setClockInHallId(""); // Reset hall
                        }}
                        className="input-premium py-2 text-xs"
                      >
                        <option value="">{t("chooseWarehousePlaceholder")}</option>
                        {allWarehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>{wh.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {t("selectHall")}
                      </label>
                      <select
                        value={clockInHallId}
                        onChange={(e) => setClockInHallId(e.target.value)}
                        disabled={!clockInWarehouseId}
                        className="input-premium py-2 text-xs"
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
                      className="w-full btn-primary py-2.5 text-xs shadow-sm hover:shadow transition-all"
                    >
                      {clockLoading ? (language === "de" ? "Wird verarbeitet..." : "Processing...") : t("clockInButton")}
                    </button>
                  </div>
                )}
              </div>

              {/* Hours Summary Statistics */}
              <div className="card-premium space-y-4">
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-500" /> {t("workHours")}
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{t("today")}</p>
                    <p className="text-lg font-bold text-slate-800 font-mono mt-1">{employeeSummary?.hoursSummary?.today || 0}h</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{t("thisWeek")}</p>
                    <p className="text-lg font-bold text-blue-600 font-mono mt-1">{employeeSummary?.hoursSummary?.week || 0}h</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{t("thisMonth")}</p>
                    <p className="text-lg font-bold text-slate-800 font-mono mt-1">{employeeSummary?.hoursSummary?.month || 0}h</p>
                  </div>
                </div>
              </div>

              {/* Personal Profile Details Card */}
              <div className="card-premium space-y-4">
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" /> {t("profileDetails")}
                </h4>
                <div className="divide-y divide-slate-100 text-xs text-slate-600">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-400">{t("usernameLabel")}</span>
                    <span className="font-semibold text-slate-800 font-mono">{employeeInfo?.username}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-400">{t("employmentStart")}</span>
                    <span suppressHydrationWarning className="font-semibold text-slate-800">
                      {employeeSummary?.employmentStart 
                        ? new Date(employeeSummary.employmentStart).toLocaleDateString(language === "de" ? "de-DE" : "en-CA") 
                        : "—"}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-400">{t("phone")}</span>
                    <span className="font-semibold text-slate-800">{employeeInfo?.phone}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-400">{t("email")}</span>
                    <span className="font-semibold text-slate-800">{employeeInfo?.email || "—"}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-400">{t("telegramId")}</span>
                    <span className="font-semibold text-slate-800">{employeeInfo?.telegramId || "—"}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Side: Assigned Plans, Plans History & Work History */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Assigned Plans for Today */}
              <div className="card-premium p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" /> {t("activeShiftPlansToday")}
                  </h5>
                </div>
                <div className="divide-y divide-slate-100">
                  {!employeeSummary?.plansToday || employeeSummary.plansToday.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-xs">
                      <p>{t("noShiftsToday")}</p>
                    </div>
                  ) : (
                    employeeSummary.plansToday.map((p: any) => (
                      <div key={p.id} className="p-5 flex flex-col sm:flex-row justify-between sm:items-center hover:bg-slate-50/30 transition-colors gap-3">
                        <div>
                          <span className="text-sm font-bold text-slate-800 block">
                            {p.warehouseName} — {p.hallName}
                          </span>
                          <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-slate-400 font-semibold">
                            <span suppressHydrationWarning className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"> {new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-slate-300" />
                              {p.assignedEmployees?.length || 0} {language === "de" ? "Mitarbeiter" : "Staff Assigned"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="w-3.5 h-3.5 text-slate-300" />
                              {p.assignedContainers?.length || 0} {language === "de" ? "Container" : "Containers"}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedPlanForView(p)}
                          className="btn-secondary py-1.5 px-3 text-[10px] uppercase font-bold tracking-wider hover:bg-slate-50 cursor-pointer self-start sm:self-center"
                        >
                          {t("viewDetails")}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Plans for Tomorrow */}
              <div className={`card-premium p-0 overflow-hidden ${employeeSummary?.plansTomorrow?.length > 0 ? "ring-2 ring-amber-400/50" : ""}`}>
                <div className={`px-6 py-4 border-b border-slate-100 flex items-center justify-between ${employeeSummary?.plansTomorrow?.length > 0 ? "bg-amber-50" : "bg-slate-50/50"}`}>
                  <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <Calendar className={`w-4 h-4 ${employeeSummary?.plansTomorrow?.length > 0 ? "text-amber-500" : "text-slate-500"}`} />
                    {language === "de" ? "Schichtplan für morgen" : "Plans for Tomorrow"}
                  </h5>
                  {employeeSummary?.plansTomorrow?.length > 0 && (
                    <span className="badge-premium badge-warning text-[10px] animate-pulse">
                      {employeeSummary.plansTomorrow.length} {language === "de" ? "Schicht(en)" : "Shift(s)"}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  {!employeeSummary?.plansTomorrow || employeeSummary.plansTomorrow.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      <Calendar className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                      <p>{language === "de" ? "Keine Schichten für morgen geplant" : "No shifts scheduled for tomorrow"}</p>
                    </div>
                  ) : (
                    employeeSummary.plansTomorrow.map((p: any) => (
                      <div key={p.id} className="p-5 flex flex-col sm:flex-row justify-between sm:items-start hover:bg-amber-50/30 transition-colors gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-slate-800 block">
                            {p.warehouseName} — {p.hallName}
                          </span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {p.shift && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                                <Clock className="w-3 h-3" /> {p.shift}
                              </span>
                            )}
                            {p.treffpunkt && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                                <MapPin className="w-3 h-3" /> {p.treffpunkt}{p.treffpunktTime ? ` (${p.treffpunktTime})` : ""}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                              <Users className="w-3 h-3 text-slate-300" />
                              {p.assignedEmployees?.length || 0} {language === "de" ? "Mitarbeiter" : "Staff"}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                              <Package className="w-3 h-3 text-slate-300" />
                              {p.assignedContainers?.length || 0} {language === "de" ? "Container" : "Containers"}
                            </span>
                          </div>
                          {p.notes && (
                            <p className="text-[10px] text-slate-500 mt-1.5 italic">{p.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setSelectedPlanForView(p)}
                          className="btn-secondary py-1.5 px-3 text-[10px] uppercase font-bold tracking-wider hover:bg-slate-50 cursor-pointer self-start sm:self-center shrink-0"
                        >
                          {t("viewDetails")}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Plans History */}
              <div className="card-premium p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500" /> {t("shiftHistory")}
                  </h5>
                </div>
                <div className="divide-y divide-slate-100">
                  {!employeeSummary?.plansHistory || employeeSummary.plansHistory.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-xs">
                      <p>{t("noPastShifts")}</p>
                    </div>
                  ) : (
                    employeeSummary.plansHistory.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="p-5 flex flex-col sm:flex-row justify-between sm:items-center hover:bg-slate-50/30 transition-colors gap-3">
                        <div>
                          <span className="text-sm font-bold text-slate-800 block">
                            {p.warehouseName} — {p.hallName}
                          </span>
                          <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-slate-400 font-semibold">
                            <span suppressHydrationWarning className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"> {new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}</span>
                            <span>{p.assignedContainers?.length || 0} {language === "de" ? "Container bearbeitet" : "Containers processed"}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedPlanForView(p)}
                          className="btn-secondary py-1.5 px-3 text-[10px] uppercase font-bold tracking-wider hover:bg-slate-50 cursor-pointer self-start sm:self-center"
                        >
                          {t("details")}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Work History (Attendance Logs) */}
              <div className="card-premium p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" /> {t("timesheetsTitle")}
                  </h5>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500">
                        <th className="px-6 py-3 font-semibold">{t("date")}</th>
                        <th className="px-6 py-3 font-semibold">{t("warehouse")}</th>
                        <th className="px-6 py-3 font-semibold">{t("clockedIn")}</th>
                        <th className="px-6 py-3 font-semibold">{t("clockedOut")}</th>
                        <th className="px-6 py-3 font-semibold text-right">{t("totalHours")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      {!employeeSummary?.workHistory || employeeSummary.workHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400 italic">{t("noAttendanceLogs")}</td>
                        </tr>
                      ) : (
                        employeeSummary.workHistory.map((r: any) => (
                          <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                            <td suppressHydrationWarning className="px-6 py-3 font-mono text-slate-800"> {new Date(r.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}</td>
                            <td className="px-6 py-3 text-slate-600">{r.warehouseName} — {r.hallName}</td>
                            <td suppressHydrationWarning className="px-6 py-3 font-mono text-slate-500"> {new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-6 py-3 font-mono text-slate-500">{r.clockOut ? new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</td>
                            <td className="px-6 py-3 font-mono text-right text-slate-800 font-semibold">{r.totalHours ? `${r.totalHours}h` : t("activeShiftLabel")}</td>
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
        <div className="space-y-6 print:hidden">
          {/* Welcome header & Offline status */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">
                {userRole === "MANAGER" ? t("roleManager") + " Dashboard" : t("operationalDashboard")}
              </h3>
              <p className="text-slate-500 text-xs mt-1">
                {t("statusOverview")}
              </p>
            </div>

            {isOffline && (
              <span className="badge-premium badge-warning animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{t("sandboxMode")}</span>
              </span>
            )}
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

          {/* Active Employee Calendar (Gantt style timeline) */}
          <ActiveEmployeeCalendar
            logs={dailyAttendance}
            loading={loading}
            isOffline={isOffline}
          />

          {/* Quick Operations Section */}
          <div className="space-y-3">
            <h6 className="text-[10px] font-bold tracking-widest text-[#4b5563] uppercase px-1">
              {t("quickOperations")}
            </h6>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
                href="/ocr"
                className="flex items-center gap-4 p-5 bg-white border border-slate-100 rounded-xl hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all group text-left cursor-pointer shadow-sm"
              >
                <div className="w-10 h-10 flex items-center justify-center bg-blue-50 border border-blue-100 rounded-lg text-blue-600 group-hover:scale-105 transition-transform shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-xs">{t("ocrUpload")}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">{t("ocrDesc")}</span>
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
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800">
                                {p.warehouseName} — {p.hallName}
                              </span>
                              <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-slate-400 font-semibold">
                                <span suppressHydrationWarning className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"> {new Date(p.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA")}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3.5 h-3.5 text-slate-300" />
                                  {p.assignedEmployees?.length || 0} {language === "de" ? "Mitarbeiter" : "Staff"}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Package className="w-3.5 h-3.5 text-slate-300" />
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
                              href={`/planning?date=${p.date.split("T")[0]}&warehouseId=${p.warehouseId}&hallId=${p.hallId}`}
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
              
              {/* Warehouse Details */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">{t("depotLocation")}</span>
                  <span className="font-bold text-slate-850 mt-1 block">{selectedPlanForView.warehouseName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">{t("stagingHall")}</span>
                  <span className="font-bold text-slate-850 mt-1 block">{selectedPlanForView.hallName}</span>
                </div>
                <div className="col-span-2 mt-2 pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">{t("shiftDate")}</span>
                  <span suppressHydrationWarning className="font-mono text-blue-600 font-bold mt-1 block"> {new Date(selectedPlanForView.date).toLocaleDateString(language === "de" ? "de-DE" : "en-CA", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
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

      {/* Custom Popup Alert Modal */}
      <CustomAlertModal
        {...alertConfig}
        onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
