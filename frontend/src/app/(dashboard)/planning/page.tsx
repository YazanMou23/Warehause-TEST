"use client";
import { useTranslation } from "../../i18n/LanguageContext";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Grid,
  Warehouse as WarehouseIcon,
  Users,
  Save,
  AlertTriangle,
  X,
  Search,
  Edit2,
  Clock,
  MapPin,
  Trash2,
  RotateCcw,
  Layers,
  Check,
  ShieldAlert,
  Package,
  Plus,
  AlertCircle,
  UserX,
  HeartPulse,
  HelpCircle,
  Mail,
  Send,
  Sparkles,
  UserCheck,
} from "lucide-react";
import CustomAlertModal, { CustomAlertOptions } from "../../components/CustomAlertModal";
import WhatsAppModal from "../../components/WhatsAppModal";
import ShiftConfirmationList from "../../components/planning/ShiftConfirmationList";

interface Warehouse {
  id: string;
  name: string;
}

interface Hall {
  id: string;
  name: string;
  warehouseId: string;
  color?: string;
}

interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
  treffpunkt?: string | null;
  treffpunktTime?: string | null;
}

interface SelectedLocation {
  warehouseId: string;
  hallId: string;
  startTime?: string;
  endTime?: string;
  isOpenEnd?: boolean;
  notes?: string;
}

export interface EmployeePlanSegmentItem {
  id?: string;
  employeeId: string;
  treffpunkt: string;
  treffpunktTime?: string;
  startTime: string;
  endTime: string;
  notes?: string;
  order?: number;
}

export interface EmployeeAbsenceItem {
  id: string;
  employeeId: string;
  date: string;
  status: "NICHT_GEARBEITET" | "KRANK" | "ABWESEND_GRUND";
  reason?: string | null;
  notes?: string | null;
  employee?: { id: string; name: string };
}

function PlanningPageContent() {
  const { t: tx, locale: uiLocale } = useTranslation();
  const [activePlanningTab, setActivePlanningTab] = useState<"plan" | "confirmations">("plan");
  const [date, setDate] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<SelectedLocation[]>([]);
  
  // Keep scalar selectedWarehouseId as a quick filter option if needed
  const [filterWarehouseId, setFilterWarehouseId] = useState("ALL");

  const searchParams = useSearchParams();
  const [hasInitializedFromQuery, setHasInitializedFromQuery] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");

  // Selection states for planning
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>([]);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [whatsAppTargetEmp, setWhatsAppTargetEmp] = useState<{ name: string; phone: string } | null>(null);
  const [shiftPreset, setShiftPreset] = useState("Frühschicht");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("14:00");
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const [treffpunktTime, setTreffpunktTime] = useState("05:30");
  const [treffpunkt, setTreffpunkt] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedContainerNumbers, setAssignedContainerNumbers] = useState<string[]>([]);
  const [typedContainerNumber, setTypedContainerNumber] = useState("");
  const [containerCountInput, setContainerCountInput] = useState("");

  // ── Per-Employee Multi-Segment Planning State ──
  const [employeeSegments, setEmployeeSegments] = useState<Record<string, EmployeePlanSegmentItem[]>>({});

  // ── Employee Absence / Status State ──
  const [absences, setAbsences] = useState<EmployeeAbsenceItem[]>([]);
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [selectedEmployeeForAbsence, setSelectedEmployeeForAbsence] = useState<Employee | null>(null);
  const [absenceStatusInput, setAbsenceStatusInput] = useState<"NICHT_GEARBEITET" | "KRANK" | "ABWESEND_GRUND">("NICHT_GEARBEITET");
  const [absenceReasonCategory, setAbsenceReasonCategory] = useState("Arzttermin");
  const [absenceCustomReason, setAbsenceCustomReason] = useState("");
  const [absenceNotesInput, setAbsenceNotesInput] = useState("");
  const [isSavingAbsence, setIsSavingAbsence] = useState(false);

  // Helper to parse shift string into start/end time and preset
  const applyShiftString = (rawShift: string) => {
    if (!rawShift) {
      setStartTime("06:00");
      setEndTime("14:00");
      setEndTimeOpen(false);
      setShiftPreset("Frühschicht");
      return;
    }

    const openEndMatch = rawShift.match(/(\d{1,2}:\d{2})\s*-\s*(offen|x|open|\s*|)$/i);
    const singleTimeMatch = rawShift.match(/^(\d{1,2}:\d{2})$/);

    if (openEndMatch && (openEndMatch[2].toLowerCase() === "offen" || openEndMatch[2].toLowerCase() === "x" || openEndMatch[2].toLowerCase() === "open" || openEndMatch[2].trim() === "")) {
      setStartTime(openEndMatch[1].padStart(5, '0'));
      setEndTime("");
      setEndTimeOpen(true);
      setShiftPreset("Benutzerdefiniert");
      return;
    } else if (singleTimeMatch) {
      setStartTime(singleTimeMatch[1].padStart(5, '0'));
      setEndTime("");
      setEndTimeOpen(true);
      setShiftPreset("Benutzerdefiniert");
      return;
    }

    setEndTimeOpen(false);
    const timeMatch = rawShift.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (timeMatch) {
      setStartTime(timeMatch[1].padStart(5, '0'));
      setEndTime(timeMatch[2].padStart(5, '0'));
    } else {
      if (rawShift.includes("Früh")) { setStartTime("06:00"); setEndTime("14:00"); }
      else if (rawShift.includes("Spät")) { setStartTime("14:00"); setEndTime("22:00"); }
      else if (rawShift.includes("Nacht")) { setStartTime("22:00"); setEndTime("06:00"); }
    }

    if (rawShift.includes("Frühschicht")) setShiftPreset("Frühschicht");
    else if (rawShift.includes("Spätschicht")) setShiftPreset("Spätschicht");
    else if (rawShift.includes("Nachtschicht")) setShiftPreset("Nachtschicht");
    else setShiftPreset("Benutzerdefiniert");
  };

  const getFormattedShift = () => {
    if (endTimeOpen) {
      return `${startTime} - offen`;
    }
    if (shiftPreset !== "Benutzerdefiniert") {
      return `${startTime} - ${endTime} (${shiftPreset})`;
    }
    return `${startTime} - ${endTime}`;
  };

  // Localized display only. getFormattedShift remains canonical for API writes.
  const displayShift = (value: string) => value
    .replace("Frühschicht", tx("earlyShift"))
    .replace("Spätschicht", tx("lateShift"))
    .replace("Nachtschicht", tx("nightShift"))
    .replace("Benutzerdefiniert", tx("planning632"))
    .replace(/offen/gi, tx("planning720"));

  const [planId, setPlanId] = useState<string | null>(null);
  const [lastSavedPlanId, setLastSavedPlanId] = useState<string | null>(null);
  const [allCreatedPlans, setAllCreatedPlans] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const createdPlansSectionRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);
  const loadedPlanIdRef = useRef<string | null>(null);

  // Centered Alert Modal State
  const [alertConfig, setAlertConfig] = useState<CustomAlertOptions>({
    isOpen: false,
    message: "",
  });

  const showAlert = (options: Omit<CustomAlertOptions, "isOpen">) => {
    setAlertConfig({ ...options, isOpen: true });
  };

  const router = useRouter();

  // Helper to calculate segment working hours (excluding treffzeit)
  const calculateSegmentHours = (start?: string, end?: string): number => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(":").map(Number);
    const [h2, m2] = end.split(":").map(Number);
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
    let diffMin = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diffMin < 0) diffMin += 24 * 60; // overnight support
    return Math.round((diffMin / 60) * 100) / 100;
  };

  // Helper to check segment time overlaps for an employee
  const checkEmployeeOverlap = (segments: EmployeePlanSegmentItem[]): string | null => {
    if (!segments || segments.length <= 1) return null;
    const toMinutes = (timeStr?: string) => {
      if (!timeStr) return null;
      const parts = timeStr.split(":");
      if (parts.length < 2) return null;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      return isNaN(h) || isNaN(m) ? null : h * 60 + m;
    };

    for (let i = 0; i < segments.length; i++) {
      const s1 = toMinutes(segments[i].startTime);
      const e1 = toMinutes(segments[i].endTime);
      if (s1 === null || e1 === null) continue;

      for (let j = i + 1; j < segments.length; j++) {
        const s2 = toMinutes(segments[j].startTime);
        const e2 = toMinutes(segments[j].endTime);
        if (s2 === null || e2 === null) continue;

        if (s1 < e2 && e1 > s2) {
          return tx("planningOverlap").replace("{first}", String(i + 1)).replace("{second}", String(j + 1));
        }
      }
    }
    return null;
  };

  // Helper to check if segment times stay within the official plan range
  const isSegmentWithinOfficialPlan = (
    segStart?: string,
    segEnd?: string,
    pStart?: string,
    pEnd?: string,
    pOpen?: boolean
  ): boolean => {
    if (!segStart || !pStart) return true;
    const toMinutes = (timeStr?: string) => {
      if (!timeStr) return null;
      const parts = timeStr.split(":");
      if (parts.length < 2) return null;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      return isNaN(h) || isNaN(m) ? null : h * 60 + m;
    };
    const sSeg = toMinutes(segStart);
    const sPlan = toMinutes(pStart);
    if (sSeg !== null && sPlan !== null && sSeg < sPlan) {
      return false; // starts earlier than official plan start
    }
    if (!pOpen && pEnd && segEnd) {
      const eSeg = toMinutes(segEnd);
      const ePlan = toMinutes(pEnd);
      if (eSeg !== null && ePlan !== null && eSeg > ePlan) {
        return false; // ends later than official plan end
      }
    }
    return true;
  };

  // Helper to compute default pickup time (15 mins before work start)
  const getDefaultPickupTime = (workStart?: string, minusMinutes: number = 15): string => {
    if (!workStart) return "07:45";
    const parts = workStart.split(":").map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return "07:45";
    let totMin = parts[0] * 60 + parts[1] - minusMinutes;
    if (totMin < 0) totMin += 24 * 60;
    const h = Math.floor(totMin / 60);
    const m = totMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    const loadMetadata = async () => {
      const qWh = searchParams.get("warehouseId");
      const qHall = searchParams.get("hallId");
      const qDt = searchParams.get("date");
      const qTab = searchParams.get("tab");

      if (qTab === "confirmations") {
        setActivePlanningTab("confirmations");
      }

      if (qDt) {
        setDate(qDt);
      } else {
        setDate(new Date().toLocaleDateString("en-CA"));
      }

      try {
        const [resWH, resHalls, resEmp] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees?limit=1000`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (resWH.ok && resHalls.ok && resEmp.ok) {
          const whData = await resWH.json();
          const hallsData = await resHalls.json();
          const empData = await resEmp.json();

          setWarehouses(Array.isArray(whData?.data) ? whData.data : (Array.isArray(whData) ? whData : []));
          setHalls(Array.isArray(hallsData?.data) ? hallsData.data : (Array.isArray(hallsData) ? hallsData : []));
          setEmployees(Array.isArray(empData?.data) ? empData.data : (Array.isArray(empData) ? empData : []));

          const qPlan = searchParams.get("planId");
          if (!qPlan && !planId) {
            if (qWh && qHall && hallsData.some((h: any) => h.id === qHall)) {
              setSelectedLocations([{ warehouseId: qWh, hallId: qHall }]);
            } else if (whData.length > 0) {
              const firstWhHalls = hallsData.filter((h: any) => h.warehouseId === whData[0].id);
              if (firstWhHalls.length > 0) {
                setSelectedLocations([{ warehouseId: whData[0].id, hallId: firstWhHalls[0].id }]);
              }
            }
          }
        } else {
          throw new Error("API failed");
        }
      } catch (err) {
        console.error("Failed to load planning metadata from API:", err);
        setWarehouses([]);
        setHalls([]);
        setEmployees([]);
      } finally {
        setHasInitializedFromQuery(true);
      }
    };

    if (token) {
      loadMetadata();
    }
  }, [router, searchParams]);

  // Fetch all plans and absences for the selected date whenever date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingPlansAndAbsences = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token) return;

      setIsLoading(true);
      try {
        const [plansRes, absencesRes] = await Promise.all([
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/query?date=${date}`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/absences?date=${date}`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
        ]);

        if (plansRes.ok) {
          const plans = await plansRes.json();
          setAllCreatedPlans(plans);
        }
        if (absencesRes.ok) {
          const abs = await absencesRes.json();
          setAbsences(abs);
        }
      } catch (err) {
        console.warn("Could not query plans/absences from API");
      } finally {
        setIsLoading(false);
      }
    };

    fetchExistingPlansAndAbsences();
  }, [date]);

  // ── WhatsApp Notification States ──
  const [isSendingWhatsAppForPlanId, setIsSendingWhatsAppForPlanId] = useState<string | null>(null);
  const [whatsAppReportModalOpen, setWhatsAppReportModalOpen] = useState(false);
  const [whatsAppReportData, setWhatsAppReportData] = useState<{
    sentCount: number;
    failedCount: number;
    results: Array<{
      employeeId: string;
      name: string;
      phone: string;
      success: boolean;
      error?: string;
      waLink?: string;
    }>;
  } | null>(null);

  // Auto-load plan into edit mode when planId is provided in URL
  useEffect(() => {
    const qPlanId = searchParams.get("planId");
    if (!qPlanId || loadedPlanIdRef.current === qPlanId) return;

    const loadPlanForEditing = async () => {
      const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
      if (!token) return;

      try {
        let plan = allCreatedPlans.find((p: any) => p.id === qPlanId);

        // If not yet in memory, fetch directly from backend API
        if (!plan) {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/${qPlanId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.ok) {
            plan = await res.json();
          }
        }

        if (!plan) return;

        loadedPlanIdRef.current = plan.id;
        isEditingRef.current = true;
        setActivePlanningTab("plan");
        setPlanId(plan.id);

        if (plan.date) {
          const pDateStr = new Date(plan.date).toISOString().split("T")[0];
          setDate(pDateStr);
        }

        const empIds = plan.assignedEmployees?.map((e: any) => e.id) || [];
        setAssignedEmployeeIds(empIds);
        applyShiftString(plan.shift || "Frühschicht");
        setTreffpunktTime(plan.treffpunktTime || "05:30");
        setTreffpunkt(plan.treffpunkt || "");
        setNotes(plan.notes || "");
        setAssignedContainerNumbers(plan.assignedContainers?.map((c: any) => c.containerNumber || c.id) || []);

        // Load segments
        const segMap: Record<string, EmployeePlanSegmentItem[]> = {};
        if (plan.employeeSegments && Array.isArray(plan.employeeSegments) && plan.employeeSegments.length > 0) {
          plan.employeeSegments.forEach((seg: any) => {
            if (!segMap[seg.employeeId]) segMap[seg.employeeId] = [];
            segMap[seg.employeeId].push({
              id: seg.id,
              employeeId: seg.employeeId,
              treffpunkt: seg.treffpunkt,
              treffpunktTime: seg.treffpunktTime || "",
              startTime: seg.startTime,
              endTime: seg.endTime || "",
              notes: seg.notes || "",
              order: seg.order || 0,
            });
          });
        }
        // Initialize default segment for assigned employees without segments
        empIds.forEach((id: string) => {
          if (!segMap[id] || segMap[id].length === 0) {
            segMap[id] = [
              {
                employeeId: id,
                treffpunkt: plan.treffpunkt || "",
                treffpunktTime: plan.treffpunktTime || "05:30",
                startTime: plan.startTime ? new Date(plan.startTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "06:00",
                endTime: plan.endTime ? new Date(plan.endTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "14:00",
                notes: "",
                order: 0,
              },
            ];
          }
        });
        setEmployeeSegments(segMap);

        if (plan.locations && Array.isArray(plan.locations) && plan.locations.length > 0) {
          setSelectedLocations(plan.locations.map((l: any) => ({
            warehouseId: l.warehouseId || l.warehouse?.id || "",
            hallId: l.hallId || l.hall?.id || "",
            startTime: l.startTime || (plan.startTime ? new Date(plan.startTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "06:00"),
            endTime: l.endTime || (plan.endTime ? new Date(plan.endTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "14:00"),
            isOpenEnd: Boolean(l.isOpenEnd),
            notes: l.notes || "",
          })));
        } else if (plan.warehouseId && plan.hallId) {
          setSelectedLocations([{
            warehouseId: plan.warehouseId,
            hallId: plan.hallId,
            startTime: plan.startTime ? new Date(plan.startTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "06:00",
            endTime: plan.endTime ? new Date(plan.endTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "14:00",
            isOpenEnd: false,
            notes: "",
          }]);
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        console.error("Auto-edit load error:", err);
      }
    };

    loadPlanForEditing();
  }, [searchParams, allCreatedPlans]);

  const [isResendingEmailForPlanId, setIsResendingEmailForPlanId] = useState<string | null>(null);

  const handleResendPlanNotification = async (targetPlanId: string) => {
    const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (!token) return;

    setIsResendingEmailForPlanId(targetPlanId);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/${targetPlanId}/notify`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || tx("planning636"));
      }
      showAlert({
        title: tx("planning637"),
        message: tx("planning638"),
        type: "success",
      });
    } catch (err: any) {
      showAlert({
        title: tx("planning639"),
        message: err.message || tx("planning640"),
        type: "error",
      });
    } finally {
      setIsResendingEmailForPlanId(null);
    }
  };

  const handleSendPlanWhatsApp = async (targetPlanId: string) => {
    const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (!token) return;

    setIsSendingWhatsAppForPlanId(targetPlanId);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/${targetPlanId}/notify-whatsapp`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || tx("planning641"));
      }

      if (data.failedCount === 0 && data.sentCount > 0) {
        showAlert({
          title: tx("planning642"),
          message: tx("planningWhatsAppSent").replace("{count}", String(data.sentCount)),
          type: "success",
        });
      } else {
        // Open report modal with results and 1-click wa.me direct links
        setWhatsAppReportData(data);
        setWhatsAppReportModalOpen(true);
      }
    } catch (err: any) {
      showAlert({
        title: tx("planning643"),
        message: err.message || tx("planning644"),
        type: "error",
      });
    } finally {
      setIsSendingWhatsAppForPlanId(null);
    }
  };

  const fetchExistingPlanManual = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    try {
      const [resPlans, resAbs] = await Promise.all([
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/query?date=${date}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/absences?date=${date}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);
      if (resPlans.ok) {
        const plans = await resPlans.json();
        setAllCreatedPlans(plans);
      }
      if (resAbs.ok) {
        const abs = await resAbs.json();
        setAbsences(abs);
      }
    } catch (e) {}
  };

  useEffect(() => {
    const handleFocus = () => {
      fetchExistingPlanManual();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [date]);

  const toggleLocation = (warehouseId: string, hallId: string) => {
    setSelectedLocations((prev) => {
      const exists = prev.some((loc) => loc.hallId === hallId && loc.warehouseId === warehouseId);
      if (exists) {
        return prev.filter((loc) => !(loc.hallId === hallId && loc.warehouseId === warehouseId));
      } else {
        return [
          ...prev,
          {
            warehouseId,
            hallId,
            startTime: startTime || "06:00",
            endTime: endTimeOpen ? "" : (endTime || "14:00"),
            isOpenEnd: Boolean(endTimeOpen),
          },
        ];
      }
    });
  };

  const updateLocationSchedule = (
    warehouseId: string,
    hallId: string,
    field: "startTime" | "endTime" | "isOpenEnd" | "notes",
    val: any
  ) => {
    setSelectedLocations((prev) =>
      prev.map((loc) => {
        if (loc.warehouseId === warehouseId && loc.hallId === hallId) {
          const updated = { ...loc, [field]: val };
          if (field === "isOpenEnd" && val === true) {
            updated.endTime = "";
          } else if (field === "isOpenEnd" && val === false && !updated.endTime) {
            updated.endTime = "14:00";
          }
          return updated;
        }
        return loc;
      })
    );
  };

  const toggleEmployee = (empId: string) => {
    // Check if employee is absent
    const isAbsent = absences.some((a) => a.employeeId === empId);
    if (!assignedEmployeeIds.includes(empId) && isAbsent) {
      const absRecord = absences.find((a) => a.employeeId === empId);
      showAlert({
        title: tx("planning645"),
        message: tx("planningAbsentWarning").replace("{date}", date).replace("{status}", absRecord?.status === "KRANK" ? tx("planning646") : absRecord?.status === "NICHT_GEARBEITET" ? tx("planning647") : tx("planning648")),
        type: "warning",
      });
    }

    setAssignedEmployeeIds((prev) => {
      const isCurrentlyAssigned = prev.includes(empId);
      if (isCurrentlyAssigned) {
        // Remove employee and their segments
        setEmployeeSegments((segMap) => {
          const next = { ...segMap };
          delete next[empId];
          return next;
        });
        return prev.filter((id) => id !== empId);
      } else {
        // Add employee and initialize default segment
        const emp = employees.find((e) => e.id === empId);
        const defaultStart = startTime || "08:00";
        const defaultEnd = endTimeOpen ? "" : (endTime || "14:00");
        const defaultPickup = getDefaultPickupTime(defaultStart, 15);
        setEmployeeSegments((segMap) => ({
          ...segMap,
          [empId]: segMap[empId] && segMap[empId].length > 0
            ? segMap[empId]
            : [
                {
                  employeeId: empId,
                  treffpunkt: "Büro",
                  treffpunktTime: defaultPickup,
                  startTime: defaultStart,
                  endTime: defaultEnd,
                  notes: "",
                  order: 0,
                },
              ],
        }));
        return [...prev, empId];
      }
    });
  };

  const handleAddSegmentForEmployee = (empId: string) => {
    const currentSegs = employeeSegments[empId] || [];
    const lastSeg = currentSegs[currentSegs.length - 1];
    const newStart = lastSeg?.endTime || (startTime || "10:00");
    const newEnd = endTimeOpen ? "" : (endTime || "14:00");
    const newPickup = getDefaultPickupTime(newStart, 15);

    // Pick a suggestion for Treffpunkt from selected locations or "Baustelle A"
    let defaultLocName = "Baustelle A";
    if (selectedLocations.length > 0) {
      const matchedHall = halls.find((h) => h.id === selectedLocations[0].hallId);
      if (matchedHall) defaultLocName = matchedHall.name;
    }

    const newSeg: EmployeePlanSegmentItem = {
      employeeId: empId,
      treffpunkt: defaultLocName,
      treffpunktTime: newPickup,
      startTime: newStart,
      endTime: newEnd,
      notes: "",
      order: currentSegs.length,
    };

    setEmployeeSegments((prev) => ({
      ...prev,
      [empId]: [...(prev[empId] || []), newSeg],
    }));
  };

  const handleUpdateSegment = (
    empId: string,
    segIdx: number,
    field: keyof EmployeePlanSegmentItem,
    value: any
  ) => {
    setEmployeeSegments((prev) => {
      const segs = [...(prev[empId] || [])];
      if (segs[segIdx]) {
        segs[segIdx] = { ...segs[segIdx], [field]: value };
      }
      return { ...prev, [empId]: segs };
    });
  };

  const handleRemoveSegment = (empId: string, segIdx: number) => {
    setEmployeeSegments((prev) => {
      const segs = (prev[empId] || []).filter((_, i) => i !== segIdx);
      return { ...prev, [empId]: segs };
    });
  };

  const handleCancelEdit = () => {
    isEditingRef.current = false;
    setPlanId(null);
    setNotes("");
    setAssignedEmployeeIds([]);
    setEmployeeSegments({});
    setAssignedContainerNumbers([]);
    setContainerCountInput("");
    applyShiftString("Frühschicht");
    showAlert({
      title: tx("planning652"),
      message: tx("planning653"),
      type: "info",
    });
  };

  const handleDeletePlan = async (idToDelete: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    showAlert({
      title: tx("planning654"),
      message: tx("planning655"),
      type: "warning",
      confirmText: tx("planning656"),
      cancelText: tx("ui336"),
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        if (!token) return;

        setIsLoading(true);
        try {
          const res = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/${idToDelete}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.message || tx("planning657"));
            }

          setAllCreatedPlans((prev) => prev.filter((p: any) => p.id !== idToDelete));
          if (planId === idToDelete) {
            handleCancelEdit();
          }

          showAlert({
            title: tx("planning658"),
            message: tx("planning659"),
            type: "success",
          });
        } catch (err: any) {
          showAlert({
            title: tx("ui526"),
            message: err.message || tx("planning660"),
            type: "error",
          });
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleSavePlan = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    // CLIENT-SIDE VALIDATION
    if (selectedLocations.length === 0) {
      showAlert({
        title: tx("planning661"),
        message: tx("planning662"),
        type: "error",
      });
      return;
    }
    if (!date) {
      showAlert({
        title: tx("planning663"),
        message: tx("planning664"),
        type: "error",
      });
      return;
    }
    if (shiftPreset === "Benutzerdefiniert" && (!startTime || (!endTimeOpen && !endTime))) {
      showAlert({
        title: tx("planning665"),
        message: tx("planningValidTimes"),
        type: "error",
      });
      return;
    }

    // Overlap validation across employee segments
    for (const empId of assignedEmployeeIds) {
      const segs = employeeSegments[empId] || [];
      const overlapErr = checkEmployeeOverlap(segs);
      if (overlapErr) {
        const empName = employees.find((e) => e.id === empId)?.name || empId;
        showAlert({
          title: tx("planningOverlapTitle").replace("{name}", empName),
          message: overlapErr + ". " + tx("planningOverlapHelp"),
          type: "error",
        });
        return;
      }
    }

    const executeSavePlan = async () => {
      setIsLoading(true);
      const formattedShift = getFormattedShift();

      // Flatten employee segments
      const allSegments: EmployeePlanSegmentItem[] = [];
      assignedEmployeeIds.forEach((empId) => {
        const segs = employeeSegments[empId] && employeeSegments[empId].length > 0
          ? employeeSegments[empId]
          : [
              {
                employeeId: empId,
                treffpunkt: treffpunkt || "Büro",
                treffpunktTime: treffpunktTime || "05:30",
                startTime: startTime || "06:00",
                endTime: endTimeOpen ? "" : (endTime || "14:00"),
                notes: "",
                order: 0,
              },
            ];
        segs.forEach((s, idx) => {
          allSegments.push({
            employeeId: empId,
            treffpunkt: s.treffpunkt || treffpunkt || "Büro",
            treffpunktTime: s.treffpunktTime || null as any,
            startTime: s.startTime || startTime || "06:00",
            endTime: s.endTime || (endTimeOpen ? null as any : endTime),
            notes: s.notes || null as any,
            order: idx,
          });
        });
      });

      const primaryLocation = selectedLocations[0];
      const payload = {
        date,
        warehouseId: primaryLocation?.warehouseId,
        hallId: primaryLocation?.hallId,
        locations: selectedLocations.map((loc) => ({
          warehouseId: loc.warehouseId,
          hallId: loc.hallId,
          startTime: loc.startTime || startTime || "06:00",
          endTime: loc.isOpenEnd ? "" : (loc.endTime || (endTimeOpen ? "" : endTime || "14:00")),
          isOpenEnd: Boolean(loc.isOpenEnd),
          notes: loc.notes || "",
        })),
        assignedEmployeeIds,
        assignedContainerNumbers,
        shift: formattedShift,
        treffpunkt,
        treffpunktTime,
        notes,
        employeeSegments: allSegments,
      };

      try {
        let res;
        if (planId) {
          res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/${planId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
        } else {
          res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || tx("planning666"));
        }

        const savedPlanId = data.id || planId;
        setLastSavedPlanId(savedPlanId);
        setFilterWarehouseId("ALL");

        const qRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/query?date=${date}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (qRes.ok) {
          const freshPlans = await qRes.json();
          setAllCreatedPlans(freshPlans);
        }

        isEditingRef.current = false;
        setPlanId(null);
        setNotes("");
        setAssignedEmployeeIds([]);
        setEmployeeSegments({});
        setAssignedContainerNumbers([]);
        setContainerCountInput("");

        showAlert({
          title: tx("planning667"),
          message: planId ? tx("planning668") : tx("planning669"),
          type: "success",
        });

        setTimeout(() => {
          createdPlansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
      } catch (err: any) {
        showAlert({
          title: tx("planning670"),
          message: err.message || tx("planning671"),
          type: "error",
        });
      } finally {
        setIsLoading(false);
      }
    };

    executeSavePlan();
  };

  // ── Absence Management Helpers ──
  const openAbsenceModal = (emp: Employee, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedEmployeeForAbsence(emp);
    const existing = absences.find((a) => a.employeeId === emp.id);
    if (existing) {
      setAbsenceStatusInput(existing.status);
      if (existing.status === "ABWESEND_GRUND") {
        const commonReasons = ["Arzttermin", "Privater Termin", "Behördentermin", "Urlaub", "Sonstiger Grund"];
        if (commonReasons.includes(existing.reason || "")) {
          setAbsenceReasonCategory(existing.reason || "Arzttermin");
          setAbsenceCustomReason("");
        } else {
          setAbsenceReasonCategory("Sonstiger Grund");
          setAbsenceCustomReason(existing.reason || "");
        }
      }
      setAbsenceNotesInput(existing.notes || "");
    } else {
      setAbsenceStatusInput("NICHT_GEARBEITET");
      setAbsenceReasonCategory("Arzttermin");
      setAbsenceCustomReason("");
      setAbsenceNotesInput("");
    }
    setAbsenceModalOpen(true);
  };

  const handleSaveAbsence = async () => {
    if (!selectedEmployeeForAbsence) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setIsSavingAbsence(true);
    const reason = absenceStatusInput === "ABWESEND_GRUND"
      ? (absenceReasonCategory === "Sonstiger Grund" && absenceCustomReason ? absenceCustomReason : absenceReasonCategory)
      : null;

    const payload = {
      employeeId: selectedEmployeeForAbsence.id,
      date,
      status: absenceStatusInput,
      reason,
      notes: absenceNotesInput || null,
    };

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/absences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || tx("planning676"));
      }

      const saved = await res.json();
      setAbsences((prev) => {
        const filtered = prev.filter((a) => a.employeeId !== selectedEmployeeForAbsence.id);
        return [...filtered, saved];
      });

      setAbsenceModalOpen(false);
      showAlert({
        title: tx("planning677"),
        message: tx("planningAbsenceSaved").replace("{name}", selectedEmployeeForAbsence.name),
        type: "success",
      });
    } catch (err: any) {
      showAlert({
        title: tx("ui526"),
        message: err.message || tx("planning678"),
        type: "error",
      });
    } finally {
      setIsSavingAbsence(false);
    }
  };

  const handleDeleteAbsence = async () => {
    if (!selectedEmployeeForAbsence) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setIsSavingAbsence(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/absences?employeeId=${selectedEmployeeForAbsence.id}&date=${date}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || tx("planning679"));
      }

      setAbsences((prev) => prev.filter((a) => a.employeeId !== selectedEmployeeForAbsence.id));
      setAbsenceModalOpen(false);
      showAlert({
        title: tx("planning680"),
        message: tx("planningAbsenceRemoved").replace("{name}", selectedEmployeeForAbsence.name),
        type: "success",
      });
    } catch (err: any) {
      showAlert({
        title: tx("ui526"),
        message: err.message || tx("planning681"),
        type: "error",
      });
    } finally {
      setIsSavingAbsence(false);
    }
  };

  // Helper stats
  const uniqueScheduledEmployeeIds = new Set<string>();
  let totalContainersToday = 0;
  allCreatedPlans.forEach((p) => {
    p.assignedEmployees?.forEach((emp: any) => uniqueScheduledEmployeeIds.add(emp.id));
    if (p.assignedContainers) totalContainersToday += p.assignedContainers.length;
  });
  const totalEmployeesCount = employees.length;
  const unscheduledEmployeesCount = Math.max(0, totalEmployeesCount - uniqueScheduledEmployeeIds.size);

  const displayedPlans = filterWarehouseId === "ALL" 
    ? allCreatedPlans 
    : allCreatedPlans.filter((p) => {
        if (p.locations && Array.isArray(p.locations) && p.locations.length > 0) {
          return p.locations.some((l: any) => (l.warehouseId || l.warehouse?.id) === filterWarehouseId);
        }
        return p.warehouseId === filterWarehouseId;
      });

  // Open an existing plan in the upper editor with full multi-location and employee segment support
  const handleStartEditPlan = (plan: any) => {
    isEditingRef.current = true;
    loadedPlanIdRef.current = plan.id;
    setPlanId(plan.id);
    const empIds = plan.assignedEmployees?.map((e: any) => e.id) || [];
    setAssignedEmployeeIds(empIds);
    applyShiftString(plan.shift || "Frühschicht");
    setTreffpunktTime(plan.treffpunktTime || "05:30");
    setTreffpunkt(plan.treffpunkt || "");
    setNotes(plan.notes || "");
    setAssignedContainerNumbers(plan.assignedContainers?.map((c: any) => c.containerNumber || c.id) || []);

    // Load employee segments
    const segMap: Record<string, EmployeePlanSegmentItem[]> = {};
    if (plan.employeeSegments && Array.isArray(plan.employeeSegments) && plan.employeeSegments.length > 0) {
      plan.employeeSegments.forEach((seg: any) => {
        if (!segMap[seg.employeeId]) segMap[seg.employeeId] = [];
        segMap[seg.employeeId].push({
          id: seg.id,
          employeeId: seg.employeeId,
          treffpunkt: seg.treffpunkt,
          treffpunktTime: seg.treffpunktTime || "",
          startTime: seg.startTime,
          endTime: seg.endTime || "",
          notes: seg.notes || "",
          order: seg.order || 0,
        });
      });
    }
    empIds.forEach((id: string) => {
      if (!segMap[id] || segMap[id].length === 0) {
        segMap[id] = [
          {
            employeeId: id,
            treffpunkt: plan.treffpunkt || "Büro",
            treffpunktTime: plan.treffpunktTime || "05:30",
            startTime: plan.startTime ? new Date(plan.startTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "06:00",
            endTime: plan.endTime ? new Date(plan.endTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "14:00",
            notes: "",
            order: 0,
          },
        ];
      }
    });
    setEmployeeSegments(segMap);

    if (plan.locations && Array.isArray(plan.locations) && plan.locations.length > 0) {
      setSelectedLocations(plan.locations.map((l: any) => ({
        warehouseId: l.warehouseId || l.warehouse?.id || "",
        hallId: l.hallId || l.hall?.id || "",
        startTime: l.startTime || (plan.startTime ? new Date(plan.startTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "06:00"),
        endTime: l.endTime || (plan.endTime ? new Date(plan.endTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "14:00"),
        isOpenEnd: Boolean(l.isOpenEnd),
        notes: l.notes || "",
      })));
    } else if (plan.warehouseId && plan.hallId) {
      setSelectedLocations([{
        warehouseId: plan.warehouseId,
        hallId: plan.hallId,
        startTime: plan.startTime ? new Date(plan.startTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "06:00",
        endTime: plan.endTime ? new Date(plan.endTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "14:00",
        isOpenEnd: false,
        notes: "",
      }]);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6 animate-fadeIn text-[#0f172a]">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h3 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Layers className="w-7 h-7 text-blue-600" />
            {tx("planning682")}</h3>
          <p className="text-slate-600 text-xs mt-1">
            {tx("planning683")}</p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200 shadow-inner shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActivePlanningTab("plan")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activePlanningTab === "plan"
                ? "bg-white text-blue-700 shadow-sm border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{tx("planning684")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePlanningTab("confirmations")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activePlanningTab === "confirmations"
                ? "bg-white text-emerald-700 shadow-sm border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>{tx("planning685")}</span>
          </button>
        </div>
      </div>

      {activePlanningTab === "confirmations" ? (
        <ShiftConfirmationList initialDate={date} />
      ) : (
        <>



      {/* Daily Statistics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{tx("planning686")}</p>
            <p className="text-lg font-extrabold text-slate-800">{allCreatedPlans.length}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{tx("planning687")}</p>
            <p className="text-lg font-extrabold text-slate-800">{uniqueScheduledEmployeeIds.size} / {totalEmployeesCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{tx("planning688")}</p>
            <p className="text-lg font-extrabold text-slate-800">{unscheduledEmployeesCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{tx("planning689")}</p>
            <p className="text-lg font-extrabold text-slate-800">{totalContainersToday}</p>
          </div>
        </div>
      </div>

      {/* Edit Mode Active Banner */}
      {planId && (
        <div className="bg-blue-50/90 border-2 border-blue-300 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-sm">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-blue-950 flex items-center gap-2">
                {tx("planning690")}<span className="text-[10px] font-mono bg-blue-200 text-blue-900 px-2 py-0.5 rounded font-bold">
                  {tx("planning691")}{planId}
                </span>
              </h4>
              <p className="text-xs text-blue-700 mt-0.5">
                {tx("planning692")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {tx("planning693")}</button>
            <button
              type="button"
              onClick={() => handleDeletePlan(planId)}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> {tx("planning694")}</button>
          </div>
        </div>
      )}

      {/* Configuration Bar & Multi-Select Locations */}
      <div className="bg-white border border-slate-100 p-6 rounded-xl shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Date Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              {tx("planning695")}</label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-colors shadow-sm"
              />
            </div>
          </div>

          {/* Shift Preset & Exact Time Section */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              {tx("planning696")}</label>
            <select
              value={shiftPreset}
              onChange={(e) => {
                const val = e.target.value;
                setShiftPreset(val);
                if (val === "Frühschicht") { setStartTime("06:00"); setEndTime("14:00"); setEndTimeOpen(false); }
                else if (val === "Spätschicht") { setStartTime("14:00"); setEndTime("22:00"); setEndTimeOpen(false); }
                else if (val === "Nachtschicht") { setStartTime("22:00"); setEndTime("06:00"); setEndTimeOpen(false); }
              }}
              dir="ltr" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-colors shadow-sm"
            >
              <option value="Frühschicht">{tx("planning697")}</option>
              <option value="Spätschicht">{tx("planning698")}</option>
              <option value="Nachtschicht">{tx("planning699")}</option>
              <option value="Benutzerdefiniert">{tx("planning700")}</option>
            </select>
          </div>
        </div>

        {/* Multi-Location Selection */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <WarehouseIcon className="w-3.5 h-3.5 text-blue-600" />
              {tx("planning701")}</label>
            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              {selectedLocations.length} {tx("planning702")}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {warehouses.map((wh) => {
              const whHalls = halls.filter((h) => h.warehouseId === wh.id);
              return (
                <div key={wh.id} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2">
                  <p className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <WarehouseIcon className="w-3.5 h-3.5 text-slate-600" />
                    {wh.name}
                  </p>
                  <div className="space-y-1.5">
                    {whHalls.map((hall) => {
                      const isSelected = selectedLocations.some(
                        (loc) => loc.warehouseId === wh.id && loc.hallId === hall.id
                      );
                      return (
                        <div
                          key={hall.id}
                          onClick={() => toggleLocation(wh.id, hall.id)}
                          className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                              : "bg-white border-slate-200 text-slate-700 hover:border-blue-300"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: hall.color || "#3b82f6" }}
                            />
                            <span>{hall.name}</span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Level 1: Official Plan Master Working Time Window */}
        <div className="space-y-3 bg-linear-to-r from-blue-50/70 to-slate-50 p-5 rounded-2xl border-2 border-blue-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200/60 pb-2.5">
            <div>
              <p className="text-xs font-extrabold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                {tx("planning703")}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {tx("planning704")}</p>
            </div>
            <span className={`text-xs font-mono font-extrabold px-3 py-1 rounded-full border shadow-2xs shrink-0 ${
              endTimeOpen ? "bg-amber-100 text-amber-950 border-amber-300" : "bg-blue-600 text-white border-blue-700"
            }`}>
              {tx("planning705")}<bdi dir="ltr">{displayShift(getFormattedShift())}</bdi>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{tx("planning706")}</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setShiftPreset("Benutzerdefiniert");
                }}
                className="bg-white border-2 border-slate-300 rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-900 outline-none focus:border-blue-600 shadow-2xs font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{tx("planning707")}</span>
              {endTimeOpen ? (
                <span className="px-3.5 py-1.5 bg-amber-100 text-amber-950 border-2 border-amber-300 rounded-xl text-xs font-extrabold font-mono shadow-2xs">
                  {tx("planning708")}</span>
              ) : (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setShiftPreset("Benutzerdefiniert");
                  }}
                  className="bg-white border-2 border-slate-300 rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-900 outline-none focus:border-blue-600 shadow-2xs font-mono"
                />
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none bg-white border-2 border-slate-200 rounded-xl px-3.5 py-1.5 hover:border-blue-300 transition-colors shadow-2xs">
              <input
                type="checkbox"
                checked={endTimeOpen}
                onChange={(e) => {
                  setEndTimeOpen(e.target.checked);
                  if (e.target.checked) {
                    setShiftPreset("Benutzerdefiniert");
                  } else {
                    setEndTime("14:00");
                  }
                }}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-700">{tx("planning709")}</span>
            </label>
          </div>
        </div>

        {/* Level 2: Hall-Specific Working Time Window */}
        <div className="space-y-3 bg-linear-to-r from-emerald-50/70 to-slate-50 p-5 rounded-2xl border-2 border-emerald-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
            <div>
              <p className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                {tx("planning710")}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {tx("planning711")}</p>
            </div>
            {selectedLocations.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedLocations((prev) =>
                    prev.map((loc) => ({
                      ...loc,
                      startTime: startTime || "06:00",
                      endTime: endTimeOpen ? "" : (endTime || "14:00"),
                      isOpenEnd: Boolean(endTimeOpen),
                    }))
                  );
                }}
                className="text-[11px] font-bold bg-white text-emerald-800 hover:bg-emerald-100/70 px-3 py-1 rounded-xl border border-emerald-300 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                {tx("planning712")}</button>
            )}
          </div>

          {selectedLocations.length === 0 ? (
            <div className="bg-white/80 border border-dashed border-emerald-300 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-600">
                {tx("planning713")}<strong>{tx("planning714")}</strong> {tx("planning715")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {selectedLocations.map((loc, idx) => {
                const wObj = warehouses.find((w) => w.id === loc.warehouseId);
                const hObj = halls.find((h) => h.id === loc.hallId);
                const hallColor = hObj?.color || "#10b981";
                const locStart = loc.startTime || startTime || "06:00";
                const locEnd = loc.endTime || (endTimeOpen ? "" : endTime || "14:00");
                const locOpen = Boolean(loc.isOpenEnd);
                const locHours = locOpen ? null : calculateSegmentHours(locStart, locEnd);

                return (
                  <div
                    key={`${loc.warehouseId}-${loc.hallId}`}
                    className="bg-white border-2 border-emerald-100 rounded-xl p-3.5 shadow-2xs space-y-3"
                    style={{ borderLeft: `4px solid ${hallColor}` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hallColor }} />
                        <span className="text-xs font-extrabold text-slate-900">
                          {hObj?.name || "Halle"}
                        </span>
                        <span className="text-[11px] text-slate-600">
                          ({wObj?.name || "Lager"})
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {locOpen ? tx("planning717") : `${locHours?.toFixed(1)} h`}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-600">{tx("planning718")}</span>
                        <input
                          type="time"
                          value={locStart}
                          onChange={(e) =>
                            updateLocationSchedule(loc.warehouseId, loc.hallId, "startTime", e.target.value)
                          }
                          className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-600 shadow-2xs"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-600">{tx("planning719")}</span>
                        {locOpen ? (
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-xs font-mono font-bold shadow-2xs">
                            {tx("planning720")}</span>
                        ) : (
                          <input
                            type="time"
                            value={locEnd}
                            onChange={(e) =>
                              updateLocationSchedule(loc.warehouseId, loc.hallId, "endTime", e.target.value)
                            }
                            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-600 shadow-2xs"
                          />
                        )}
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer select-none bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 hover:border-emerald-300 transition-colors">
                        <input
                          type="checkbox"
                          checked={locOpen}
                          onChange={(e) =>
                            updateLocationSchedule(loc.warehouseId, loc.hallId, "isOpenEnd", e.target.checked)
                          }
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="text-[11px] font-bold text-slate-700">{tx("planning717")}</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Notes TextArea */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
            {tx("planning721")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={tx("planning722")}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-colors resize-none shadow-2xs"
          />
        </div>
      </div>

      {/* Container Input Section */}
      <div className="bg-white border border-slate-100 p-6 rounded-xl shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            {tx("planning723")}</label>
          {assignedContainerNumbers.length > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded-full text-[11px] font-bold">
              <Package className="w-3.5 h-3.5" />
              {assignedContainerNumbers.length} {tx("planning724")}</span>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-blue-500" />
            {tx("planning725")}</p>
          <p className="text-[10px] text-slate-600">
            {tx("planning726")}</p>
          <div className="flex gap-2 max-w-xs">
            <input
              type="number"
              min="1"
              max="999"
              placeholder={tx("planning727")}
              value={containerCountInput}
              onChange={(e) => setContainerCountInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const count = parseInt(containerCountInput, 10);
                  if (!isNaN(count) && count > 0 && count <= 999) {
                    const existing = assignedContainerNumbers.filter((n) => n.startsWith("PLAN-"));
                    const startIdx = existing.length + 1;
                    const newNums = Array.from({ length: count }, (_, i) =>
                      `PLAN-${String(startIdx + i).padStart(3, "0")}`
                    ).filter((n) => !assignedContainerNumbers.includes(n));
                    setAssignedContainerNumbers((prev) => [...prev, ...newNums]);
                    setContainerCountInput("");
                  }
                }
              }}
              className="w-28 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-500 transition-colors shadow-2xs text-center font-bold"
            />
            <button
              type="button"
              onClick={() => {
                const count = parseInt(containerCountInput, 10);
                if (!isNaN(count) && count > 0 && count <= 999) {
                  const existing = assignedContainerNumbers.filter((n) => n.startsWith("PLAN-"));
                  const startIdx = existing.length + 1;
                  const newNums = Array.from({ length: count }, (_, i) =>
                    `PLAN-${String(startIdx + i).padStart(3, "0")}`
                  ).filter((n) => !assignedContainerNumbers.includes(n));
                  setAssignedContainerNumbers((prev) => [...prev, ...newNums]);
                  setContainerCountInput("");
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Package className="w-3.5 h-3.5" />
              {tx("planning728")}</button>
          </div>
        </div>

        {/* Manual Container Number Entry */}
        <div>
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
            {tx("planning729")}</p>
          <div className="flex flex-col sm:flex-row gap-2 max-w-lg min-w-0">
            <input
              type="text"
              placeholder={tx("planning730")}
              value={typedContainerNumber}
              onChange={(e) => setTypedContainerNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = typedContainerNumber.trim().toUpperCase();
                  if (val && !assignedContainerNumbers.includes(val)) {
                    setAssignedContainerNumbers((prev) => [...prev, val]);
                  }
                  setTypedContainerNumber("");
                }
              }}
              className="flex-1 min-w-0 w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-blue-500 transition-colors shadow-2xs"
            />
            <button
              type="button"
              onClick={() => {
                const val = typedContainerNumber.trim().toUpperCase();
                if (val && !assignedContainerNumbers.includes(val)) {
                  setAssignedContainerNumbers((prev) => [...prev, val]);
                }
                setTypedContainerNumber("");
              }}
              className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              {tx("planning731")}</button>
          </div>
        </div>

        {assignedContainerNumbers.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              {tx("ui346")}{assignedContainerNumbers.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {assignedContainerNumbers.map((cNum) => (
                <div
                  key={cNum}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-800 rounded-full text-xs font-semibold border border-slate-200 shadow-2xs"
                >
                  <span className="font-mono font-bold">{cNum}</span>
                  <button
                    type="button"
                    onClick={() => setAssignedContainerNumbers((prev) => prev.filter((num) => num !== cNum))}
                    className="text-slate-600 hover:text-red-600 transition-colors p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Ebene 2: Individual Employee Segments & Treffpunkte Editor ── */}
      {assignedEmployeeIds.length > 0 && (
        <div className="bg-white border-2 border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                {tx("planning732")}{assignedEmployeeIds.length})
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                {tx("planning733")}<strong className="text-slate-800 font-mono"><bdi dir="ltr">{displayShift(getFormattedShift())}</bdi></strong>
              </p>
            </div>
            <span className="text-xs bg-amber-100 text-amber-950 border border-amber-300 px-3 py-1.5 rounded-xl font-bold shadow-2xs shrink-0">
              {tx("planning734")}<strong>{tx("planning735")}</strong>
            </span>
          </div>

          <div className="space-y-5">
            {assignedEmployeeIds.map((empId) => {
              const emp = employees.find((e) => e.id === empId);
              if (!emp) return null;
              const segs = employeeSegments[empId] || [];
              const totalHours = segs.reduce(
                (sum, s) => sum + calculateSegmentHours(s.startTime, s.endTime),
                0
              );
              const overlapWarning = checkEmployeeOverlap(segs);
              const hasOutOfPlanSegment = segs.some(
                (s) => !isSegmentWithinOfficialPlan(s.startTime, s.endTime, startTime, endTime, endTimeOpen)
              );

              return (
                <div
                  key={emp.id}
                  className={`border-2 rounded-2xl p-4 sm:p-5 transition-all space-y-4 shadow-sm ${
                    overlapWarning
                      ? "border-red-300 bg-red-50/50"
                      : hasOutOfPlanSegment
                      ? "border-amber-300 bg-amber-50/40"
                      : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm shadow-xs">
                        {emp.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-extrabold text-slate-900">{emp.name}</p>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider font-mono ${
                              emp.role === "TEAM_LEADER"
                                ? "bg-amber-100 text-amber-950 border border-amber-300"
                                : "bg-slate-200 text-slate-800"
                            }`}
                          >
                            {emp.role === "TEAM_LEADER" ? tx("planning736") : tx("roleEmployee")}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-mono mt-0.5"><bdi dir="ltr">{emp.phone || tx("planning737")}</bdi></p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                          {tx("netHours")}</span>
                        <span className="text-sm font-mono font-extrabold text-blue-950 bg-blue-100/90 px-3 py-1 rounded-xl border border-blue-300 inline-block mt-0.5">
                          {totalHours.toFixed(2)} {tx("planning738")}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleEmployee(emp.id)}
                        className="text-slate-600 hover:text-red-600 p-2 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                        title={tx("planning739")}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Overlap Error Banner */}
                  {overlapWarning && (
                    <div className="bg-red-100 text-red-900 border-2 border-red-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{overlapWarning}</span>
                    </div>
                  )}

                  {/* Out of Official Plan Range Warning */}
                  {hasOutOfPlanSegment && !overlapWarning && (
                    <div className="bg-amber-100/90 text-amber-950 border border-amber-300 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        {tx("planning740")}<bdi dir="ltr">{displayShift(getFormattedShift())}</bdi>{tx("planning741")}</span>
                    </div>
                  )}

                  {/* Segments Table */}
                  <div className="overflow-x-auto">
                    <div className="min-w-[680px] space-y-2">
                      {/* Table Column Headers */}
                      <div className="grid grid-cols-[36px_140px_1fr_110px_110px_90px_40px] gap-2 px-2 py-1 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider items-center">
                        <div className="text-center">#</div>
                        <div className="text-amber-800">{tx("planning742")}</div>
                        <div>{tx("planning743")}</div>
                        <div>{tx("planning744")}</div>
                        <div>{tx("planning745")}</div>
                        <div className="text-right">{tx("planning746")}</div>
                        <div className="text-center">{tx("ui295")}</div>
                      </div>

                      {segs.map((seg, idx) => {
                        const segHours = calculateSegmentHours(seg.startTime, seg.endTime);
                        const isOut = !isSegmentWithinOfficialPlan(seg.startTime, seg.endTime, startTime, endTime, endTimeOpen);
                        return (
                          <div
                            key={idx}
                            className={`bg-white border rounded-xl p-2.5 grid grid-cols-[36px_140px_1fr_110px_110px_90px_40px] gap-2 items-center text-xs shadow-2xs transition-colors ${
                              isOut ? "border-amber-300 bg-amber-50/20" : "border-slate-200 hover:border-blue-200"
                            }`}
                          >
                            {/* # Index */}
                            <div className="flex justify-center">
                              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center font-extrabold text-[11px] font-mono border border-slate-200">
                                {idx + 1}
                              </span>
                            </div>

                            {/* Treffzeit (Non-working Pickup) */}
                            <div>
                              <input
                                type="time"
                                value={seg.treffpunktTime || ""}
                                onChange={(e) => handleUpdateSegment(emp.id, idx, "treffpunktTime", e.target.value)}
                                className="w-full bg-amber-50/80 border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-950 outline-none focus:border-amber-500 focus:bg-white font-mono"
                                title={tx("planning747")}
                              />
                            </div>

                            {/* Treffpunkt */}
                            <div className="relative">
                              <input
                                type="text"
                                placeholder={tx("planning748")}
                                value={seg.treffpunkt}
                                onChange={(e) => handleUpdateSegment(emp.id, idx, "treffpunkt", e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                              />
                            </div>

                            {/* Arbeitsbeginn */}
                            <div>
                              <input
                                type="time"
                                value={seg.startTime}
                                onChange={(e) => handleUpdateSegment(emp.id, idx, "startTime", e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white font-mono"
                              />
                            </div>

                            {/* Arbeitsende */}
                            <div>
                              <input
                                type="time"
                                value={seg.endTime || ""}
                                onChange={(e) => handleUpdateSegment(emp.id, idx, "endTime", e.target.value)}
                                placeholder="offen"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white font-mono"
                              />
                            </div>

                            {/* Duration Badge */}
                            <div className="text-right">
                              <span className="font-mono font-extrabold text-xs bg-slate-100 text-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 inline-block">
                                {segHours.toFixed(1)} {tx("ui277")}</span>
                            </div>

                            {/* Remove Action */}
                            <div className="flex justify-center">
                              {segs.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSegment(emp.id, idx)}
                                  className="text-slate-600 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                  title={tx("planning749")}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Segment Button & Location Shortcuts */}
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddSegmentForEmployee(emp.id)}
                      className="text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-300 px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> {tx("planning750")}</button>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-600">{tx("planning751")}</span>
                      {["Büro", "Baustelle A", "Baustelle B"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            const lastIdx = segs.length - 1;
                            if (lastIdx >= 0) {
                              handleUpdateSegment(emp.id, lastIdx, "treffpunkt", preset);
                            }
                          }}
                          className="px-2 py-0.5 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 rounded-md text-[10px] font-medium transition-colors cursor-pointer"
                        >
                          {preset === "Büro" ? tx("planning649") : preset === "Baustelle A" ? tx("planning650") : tx("planning651")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Employees Directory List with Absence Tracking */}
      <div className="bg-white border border-slate-100 rounded-xl flex flex-col shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
          <div>
            <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" /> {tx("planning752")}</h5>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {tx("planning753")}</p>
          </div>
          <span className="font-mono text-xs bg-blue-50 text-blue-800 px-3 py-1 rounded-full font-bold border border-blue-200 self-start sm:self-auto">
            {assignedEmployeeIds.length} {tx("planning702")}</span>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={tx("planning754")}
              value={employeeSearchTerm}
              onChange={(e) => setEmployeeSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-colors shadow-2xs"
            />
          </div>
        </div>

        <div className="overflow-y-auto max-h-[440px] divide-y divide-slate-100 p-3 space-y-1 bg-slate-50/20">
          {(() => {
            const sortedFiltered = employees
              .filter((emp) =>
                emp.name.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
                (emp.phone && emp.phone.includes(employeeSearchTerm)) ||
                emp.role.toLowerCase().includes(employeeSearchTerm.toLowerCase())
              )
              .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));

            if (sortedFiltered.length === 0) {
              return (
                <div className="text-center py-8 text-slate-600 text-xs italic">
                  {tx("planning755")}{employeeSearchTerm}{tx("planning756")}</div>
              );
            }

            return sortedFiltered.map((emp) => {
              const isAssigned = assignedEmployeeIds.includes(emp.id);
              const absenceRecord = absences.find((a) => a.employeeId === emp.id);

              const existingShiftsForEmp = allCreatedPlans
                .filter((p) => p.id !== planId && p.assignedEmployees?.some((ae: any) => ae.id === emp.id))
                .map((p) => p.shift || "Schicht");

              return (
                <div
                  key={emp.id}
                  onClick={() => toggleEmployee(emp.id)}
                  className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl cursor-pointer transition-all border ${
                    isAssigned
                      ? "bg-blue-50/70 border-blue-200 shadow-2xs"
                      : "bg-white hover:bg-slate-50 border-transparent hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${isAssigned ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-slate-50"}`}>
                      {isAssigned && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-xs font-bold ${isAssigned ? "text-blue-800" : "text-slate-800"}`}>
                          {emp.name}
                        </p>

                        {/* Absence Badge */}
                        {absenceRecord && (
                          <span
                            onClick={(e) => openAbsenceModal(emp, e)}
                            className={`text-[10px] px-2.5 py-0.5 font-bold rounded-full border flex items-center gap-1 shadow-2xs hover:opacity-80 transition-opacity ${
                              absenceRecord.status === "KRANK"
                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                : absenceRecord.status === "NICHT_GEARBEITET"
                                ? "bg-red-100 text-red-900 border-red-300"
                                : "bg-blue-100 text-blue-900 border-blue-300"
                            }`}
                          >
                            {absenceRecord.status === "KRANK" ? (
                              <>
                                <HeartPulse className="w-3 h-3 text-amber-700" />
                                <span>{tx("planning758")}</span>
                              </>
                            ) : absenceRecord.status === "NICHT_GEARBEITET" ? (
                              <>
                                <UserX className="w-3 h-3 text-red-700" />
                                <span>{tx("planning759")}</span>
                              </>
                            ) : (
                              <>
                                <HelpCircle className="w-3 h-3 text-blue-700" />
                                <span>{tx("planning760")}{absenceRecord.reason || tx("planning761")})</span>
                              </>
                            )}
                          </span>
                        )}

                        {existingShiftsForEmp.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 font-bold rounded-full flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-amber-600" />
                            {tx("planning762")}{existingShiftsForEmp.join(", ")})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 font-mono mt-0.5"><bdi dir="ltr">{emp.phone || tx("planning737")}</bdi></p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Status/Absence Action Button */}
                    <button
                      type="button"
                      onClick={(e) => openAbsenceModal(emp, e)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs transition-colors flex items-center gap-1"
                      title={tx("planning763")}
                    >
                      <UserX className="w-3 h-3 text-slate-600" />
                      <span>{absenceRecord ? tx("planning764") : tx("planningStatusAbsent")}</span>
                    </button>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider font-mono border ${
                        emp.role === "TEAM_LEADER"
                          ? "bg-amber-100/80 text-amber-900 border-amber-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {emp.role === "TEAM_LEADER" ? tx("planning736") : tx("roleEmployee")}
                    </span>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Save Button Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-800 text-white p-6 rounded-xl shadow-lg">
        <div>
          <p className="text-sm font-extrabold text-white flex items-center gap-2">
            {planId ? tx("planning765") : tx("planning766")}
          </p>
          <p className="text-xs text-slate-200 mt-1">
            {selectedLocations.length} {tx("planning767")}{assignedEmployeeIds.length} {tx("planning768")}</p>
        </div>

        <div className="flex items-center gap-3">
          {planId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold px-5 py-2.5 rounded-lg transition-all cursor-pointer"
            >
              {tx("ui336")}</button>
          )}
          <button
            onClick={handleSavePlan}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-extrabold px-7 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{planId ? tx("planning769") : tx("planning770")}</span>
          </button>
        </div>
      </div>

      {/* ── Created Plans Section ── */}
      <div ref={createdPlansSectionRef} className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h4 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              {tx("planning771")}{date} ({displayedPlans.length})
            </h4>
            <p className="text-slate-600 text-xs mt-0.5">
              {tx("planning772")}</p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 w-full sm:w-auto">
            <span className="text-xs font-bold text-slate-600 shrink-0">{tx("planning773")}</span>
            <select
              value={filterWarehouseId}
              onChange={(e) => setFilterWarehouseId(e.target.value)}
              className="min-w-0 w-full sm:w-auto sm:max-w-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
            >
              <option value="ALL">{tx("planning774")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>

        {displayedPlans.length === 0 ? (
          <div className="p-8 text-center text-slate-600 text-xs italic bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
            {tx("planning775")}</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {displayedPlans.map((plan: any) => {
              const isSelected = plan.id === planId;
              const planLocations = plan.locations && Array.isArray(plan.locations) && plan.locations.length > 0 
                ? plan.locations 
                : [{ warehouseId: plan.warehouseId, hallId: plan.hallId }];

              return (
                <div
                  key={plan.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between overflow-hidden ${
                    plan.id === lastSavedPlanId
                      ? "bg-green-50/40 border-green-300 shadow-md ring-2 ring-green-400"
                      : isSelected
                      ? "bg-blue-50/40 border-blue-300 shadow-sm ring-2 ring-blue-400"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-md"
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header: Locations Tags + Shift Badge */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                      <div className="flex flex-wrap items-center gap-1.5 flex-1">
                        {planLocations.map((loc: any, i: number) => {
                          const wName = warehouses.find((w) => w.id === (loc.warehouseId || loc.warehouse?.id))?.name || "Lager";
                          const locHall = halls.find((h) => h.id === (loc.hallId || loc.hall?.id));
                          const hName = locHall?.name || loc.hallName || "Halle";
                          const hColor = locHall?.color || loc.hall?.color || "#2563eb";
                          return (
                            <span
                              key={i}
                              className="text-xs font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5 shadow-2xs"
                              style={{ borderLeft: `3px solid ${hColor}` }}
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hColor }} />
                              <WarehouseIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>{wName} — <strong className="text-slate-950">{hName}</strong></span>
                            </span>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 bg-blue-50 text-blue-900 px-3 py-1.5 rounded-lg border border-blue-200 shadow-2xs font-mono">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span><bdi dir="ltr">{displayShift(plan.shift || tx("planning757"))}</bdi></span>
                        </span>
                      </div>
                    </div>

                    {/* Shift & Master Time Info */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 bg-blue-50 text-blue-900 px-3 py-1.5 rounded-lg border border-blue-200 shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        {tx("planning776")}<bdi dir="ltr">{displayShift(plan.shift || tx("planning757"))}</bdi>
                      </span>

                      {plan.treffpunktTime && (
                        <span className="px-3 py-1.5 bg-amber-50 text-amber-900 font-mono text-xs font-bold rounded-lg border border-amber-200 shadow-2xs">
                          {tx("planning777")}{plan.treffpunktTime}
                        </span>
                      )}
                      {plan.treffpunkt && (
                        <span className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 flex items-center gap-1.5 shadow-2xs">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{plan.treffpunkt}</span>
                        </span>
                      )}
                    </div>

                    {/* Level 2: Hall-Specific Working Times */}
                    {planLocations && planLocations.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-emerald-600" />
                          {tx("planning778")}{planLocations.length}):
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {planLocations.map((loc: any, lIdx: number) => {
                            const wName = warehouses.find((w) => w.id === (loc.warehouseId || loc.warehouse?.id))?.name || "Lager";
                            const locHall = halls.find((h) => h.id === (loc.hallId || loc.hall?.id));
                            const hName = locHall?.name || loc.hallName || "Halle";
                            const hColor = locHall?.color || loc.hall?.color || "#10b981";
                            const lStart = loc.startTime || (plan.startTime ? new Date(plan.startTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "06:00");
                            const lEnd = loc.isOpenEnd ? tx("planning720") : (loc.endTime || (plan.endTime ? new Date(plan.endTime).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' }) : "14:00"));
                            const lHours = loc.isOpenEnd ? null : calculateSegmentHours(lStart, lEnd);

                            return (
                              <div
                                key={lIdx}
                                className="bg-emerald-50/50 border border-emerald-200/80 rounded-lg p-2 text-xs flex items-center justify-between gap-2 shadow-2xs"
                                style={{ borderLeft: `3px solid ${hColor}` }}
                              >
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hColor }} />
                                  <span className="font-extrabold text-slate-900 truncate">{hName}</span>
                                  <span className="text-[10px] text-slate-600 truncate">({wName})</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono text-[11px] font-bold text-emerald-950 bg-white px-2 py-0.5 rounded border border-emerald-200">
                                    {lStart} – {lEnd}
                                  </span>
                                  {lHours !== null && lHours > 0 && (
                                    <span className="text-[10px] font-mono text-emerald-700">({lHours.toFixed(1)}{tx("ui362")}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Employees with Segments Breakdown Table */}
                    <div className="space-y-2 pt-1">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                        {tx("planning779")}{plan.assignedEmployees?.length || 0}):
                      </p>
                      <div className="space-y-2">
                        {plan.assignedEmployees && plan.assignedEmployees.length > 0 ? (
                          plan.assignedEmployees.map((emp: any) => {
                            const empSegs = (plan.employeeSegments || []).filter((s: any) => s.employeeId === emp.id);
                            const totalEmpHours = empSegs.reduce(
                              (sum: number, s: any) => sum + calculateSegmentHours(s.startTime, s.endTime),
                              0
                            );
                            return (
                              <div
                                key={emp.id}
                                className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 text-xs space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-slate-900">{emp.name}</span>
                                    <span className="text-[10px] font-mono text-slate-600"><bdi dir="ltr">{emp.phone || ""}</bdi></span>
                                    {emp.phone && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWhatsAppTargetEmp({ name: emp.name, phone: emp.phone });
                                          setWhatsAppModalOpen(true);
                                        }}
                                        className="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold rounded-md transition flex items-center gap-1 cursor-pointer"
                                        title={tx("planning780")}
                                      >
                                        {tx("planning781")}</button>
                                    )}
                                  </div>
                                  <span className="text-[11px] font-bold font-mono text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded-lg border border-blue-200">
                                    {tx("planning782")}{totalEmpHours > 0 ? `${totalEmpHours.toFixed(1)} h` : (plan.shift || "Master")}
                                  </span>
                                </div>
                                {empSegs.length > 0 ? (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[11px] border border-slate-200 rounded-lg overflow-hidden bg-white">
                                      <thead>
                                        <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                          <th className="py-1 px-2.5">{tx("planning784")}</th>
                                          <th className="py-1 px-2.5">{tx("ui331")}</th>
                                          <th className="py-1 px-2.5">{tx("ui330")}</th>
                                          <th className="py-1 px-2.5 text-right">{tx("planning785")}</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {empSegs.map((seg: any, sIdx: number) => {
                                          const h = calculateSegmentHours(seg.startTime, seg.endTime);
                                          return (
                                            <tr key={sIdx} className="hover:bg-slate-50/80">
                                              <td className="py-1 px-2.5 font-mono text-amber-900 font-bold">
                                                {seg.treffpunktTime ? `⏰ ${seg.treffpunktTime}` : "—"}
                                              </td>
                                              <td className="py-1 px-2.5 font-semibold text-slate-800">
                                                {seg.treffpunkt || "Büro"}
                                              </td>
                                              <td className="py-1 px-2.5 font-mono font-bold text-blue-900">
                                                {seg.startTime} – {seg.endTime || "offen"}
                                              </td>
                                              <td className="py-1 px-2.5 font-mono font-bold text-right text-slate-800">
                                                {h > 0 ? `${h.toFixed(1)} h` : "—"}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-600 italic">{tx("planning786")}</span>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-slate-600 italic text-[11px]">{tx("planning787")}</span>
                        )}
                      </div>
                    </div>

                    {/* Containers */}
                    {plan.assignedContainers && plan.assignedContainers.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                          <Package className="w-3 h-3 text-slate-600" />
                          {tx("planning788")}{plan.assignedContainers.length}):
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {plan.assignedContainers.map((cont: any) => (
                            <span key={cont.id || cont.containerNumber} className="px-2.5 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 font-mono text-[10px] font-bold rounded-md">
                              {cont.containerNumber}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {plan.notes && (
                      <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                        <p className="text-[11px] font-semibold text-slate-600 italic">
                          "{plan.notes}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Dedicated Card Footer Action Toolbar */}
                  <div className="pt-3.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 mt-4 bg-slate-50/70 -mx-5 -mb-5 p-4 rounded-b-2xl">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>{plan.assignedEmployees?.length || 0} {tx("ui318")}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Prominent Edit Button */}
                      <button
                        type="button"
                        onClick={() => handleStartEditPlan(plan)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                        title={tx("planning789")}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{tx("ui320")}</span>
                      </button>

                      {/* WhatsApp to all button */}
                      <button
                        type="button"
                        disabled={isSendingWhatsAppForPlanId === plan.id}
                        onClick={() => handleSendPlanWhatsApp(plan.id)}
                        className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                        title={tx("planning790")}
                      >
                        {isSendingWhatsAppForPlanId === plan.id ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            <span>{tx("planning791")}</span>
                          </>
                        ) : (
                          <>
                            <span>{tx("planning792")}</span>
                          </>
                        )}
                      </button>

                      {/* Shift Confirmations List button */}
                      <button
                        type="button"
                        onClick={() => {
                          const targetDate = plan.date ? new Date(plan.date).toLocaleDateString("en-CA") : date;
                          setDate(targetDate);
                          setActivePlanningTab("confirmations");
                        }}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200/80 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        title={tx("planningOpenResponses")}
                      >
                        <UserCheck className="w-3.5 h-3.5 text-indigo-700" />
                        <span>{tx("ui319")}</span>
                      </button>

                      {/* Resend Email button */}
                      <button
                        type="button"
                        disabled={isResendingEmailForPlanId === plan.id}
                        onClick={() => handleResendPlanNotification(plan.id)}
                        title={tx("planning793")}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        {isResendingEmailForPlanId === plan.id ? (
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-slate-700" />
                        ) : (
                          <Mail className="w-3.5 h-3.5 text-slate-600" />
                        )}
                        <span>{tx("email")}</span>
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={(e) => handleDeletePlan(plan.id, e)}
                        title={tx("planning794")}
                        className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer ml-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {/* ── Modal for Setting Employee Absence / Status ── */}
      {absenceModalOpen && selectedEmployeeForAbsence && (
        <div className="responsive-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  {tx("planning795")}</h4>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  {tx("planning796")}<strong className="text-slate-800">{selectedEmployeeForAbsence.name}</strong> {tx("planning797")}<strong>{date}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbsenceModalOpen(false)}
                className="text-slate-600 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                {tx("planning798")}</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAbsenceStatusInput("NICHT_GEARBEITET")}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    absenceStatusInput === "NICHT_GEARBEITET"
                      ? "bg-red-50 border-red-500 text-red-900 ring-2 ring-red-400"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <UserX className="w-5 h-5 text-red-600" />
                  <span>{tx("planning647")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAbsenceStatusInput("KRANK")}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    absenceStatusInput === "KRANK"
                      ? "bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-400"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <HeartPulse className="w-5 h-5 text-amber-600" />
                  <span>{tx("planning646")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAbsenceStatusInput("ABWESEND_GRUND")}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    absenceStatusInput === "ABWESEND_GRUND"
                      ? "bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <HelpCircle className="w-5 h-5 text-blue-600" />
                  <span>{tx("planning799")}</span>
                </button>
              </div>
            </div>

            {/* Reason Selection if ABWESEND_GRUND */}
            {absenceStatusInput === "ABWESEND_GRUND" && (
              <div className="space-y-3 p-3.5 bg-blue-50/50 rounded-xl border border-blue-200/80 animate-fadeIn">
                <label className="text-[11px] font-bold text-blue-950 uppercase tracking-wider block">
                  {tx("planning800")}</label>
                <select
                  value={absenceReasonCategory}
                  onChange={(e) => setAbsenceReasonCategory(e.target.value)}
                  className="w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="Arzttermin">{tx("planning631")}</option>
                  <option value="Privater Termin">{tx("planning672")}</option>
                  <option value="Behördentermin">{tx("planning673")}</option>
                  <option value="Urlaub">{tx("planning674")}</option>
                  <option value="Sonstiger Grund">{tx("planning801")}</option>
                </select>

                {absenceReasonCategory === "Sonstiger Grund" && (
                  <input
                    type="text"
                    placeholder={tx("planning802")}
                    value={absenceCustomReason}
                    onChange={(e) => setAbsenceCustomReason(e.target.value)}
                    className="w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  />
                )}
              </div>
            )}

            {/* Notes Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                {tx("planning803")}</label>
              <textarea
                rows={2}
                value={absenceNotesInput}
                onChange={(e) => setAbsenceNotesInput(e.target.value)}
                placeholder={tx("planning804")}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-2">
              {absences.some((a) => a.employeeId === selectedEmployeeForAbsence.id) ? (
                <button
                  type="button"
                  onClick={handleDeleteAbsence}
                  disabled={isSavingAbsence}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {tx("planning805")}</button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAbsenceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  {tx("ui336")}</button>
                <button
                  type="button"
                  onClick={handleSaveAbsence}
                  disabled={isSavingAbsence}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingAbsence ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{tx("planning806")}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Centered Popup Alert Modal */}
      <CustomAlertModal
        {...alertConfig}
        onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* WhatsApp Message & Interactive Button Modal */}
      {whatsAppModalOpen && whatsAppTargetEmp && (
        <WhatsAppModal
          isOpen={whatsAppModalOpen}
          onClose={() => {
            setWhatsAppModalOpen(false);
            setWhatsAppTargetEmp(null);
          }}
          recipientName={whatsAppTargetEmp.name}
          recipientPhone={whatsAppTargetEmp.phone}
        />
      )}

      {/* WhatsApp Delivery Report Modal with Direct 1-Click WhatsApp Links */}
      {whatsAppReportModalOpen && whatsAppReportData && (
        <div className="responsive-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>{tx("planning807")}</span>
                  {whatsAppReportData.sentCount > 0 && (
                    <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                      {whatsAppReportData.sentCount} {tx("planning808")}</span>
                  )}
                  {whatsAppReportData.failedCount > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-bold">
                      {whatsAppReportData.failedCount} {tx("planning809")}</span>
                  )}
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  {tx("planning810")}</p>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppReportModalOpen(false)}
                className="text-slate-600 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {whatsAppReportData.results.map((r, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50/60">
                  <div className="flex flex-col">
                    <span className="text-xs font-extrabold text-slate-900">{r.name}</span>
                    <span className="text-[11px] font-mono text-slate-600">{r.phone || "Keine Nummer"}</span>
                    {r.error && (
                      <span className="text-[10px] text-amber-700 font-medium">{r.error}</span>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {r.success ? (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                        {tx("planning812")}</span>
                    ) : r.waLink ? (
                      <a
                        href={r.waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5"
                      >
                        <span>WhatsApp Web</span>
                      </a>
                    ) : (
                      <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-1 rounded">
                        {tx("planning811")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setWhatsAppReportModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                {tx("close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlanningPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    }>
      <PlanningPageContent />
    </Suspense>
  );
}
