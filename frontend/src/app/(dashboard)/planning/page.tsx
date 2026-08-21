"use client";

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
} from "lucide-react";
import CustomAlertModal, { CustomAlertOptions } from "../../components/CustomAlertModal";

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

  const [planId, setPlanId] = useState<string | null>(null);
  const [lastSavedPlanId, setLastSavedPlanId] = useState<string | null>(null);
  const [allCreatedPlans, setAllCreatedPlans] = useState<any[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const createdPlansSectionRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);
  const autoEditDone = useRef(false);

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
          return `Überlappung zwischen Abschnitt ${i + 1} (${segments[i].startTime}-${segments[i].endTime}) und Abschnitt ${j + 1} (${segments[j].startTime}-${segments[j].endTime})`;
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

          if (qWh && qHall && hallsData.some((h: any) => h.id === qHall)) {
            setSelectedLocations([{ warehouseId: qWh, hallId: qHall }]);
          } else if (whData.length > 0) {
            const firstWhHalls = hallsData.filter((h: any) => h.warehouseId === whData[0].id);
            if (firstWhHalls.length > 0) {
              setSelectedLocations([{ warehouseId: whData[0].id, hallId: firstWhHalls[0].id }]);
            }
          }
        } else {
          throw new Error("API failed");
        }
        setIsOffline(false);
      } catch (err) {
        setIsOffline(true);
        const mockWH = [
          { id: "wh-1", name: "Duisburg Port Hub" },
          { id: "wh-2", name: "Rhein-Ruhr Logistics" },
        ];
        const mockHalls = [
          { id: "hall-a", name: "Hall A - Cold Storage", warehouseId: "wh-1" },
          { id: "hall-b", name: "Hall B - General Cargo", warehouseId: "wh-1" },
          { id: "hall-c", name: "Hall C - Hazmat", warehouseId: "wh-2" },
        ];
        const mockEmployees = [
          { id: "emp-1", name: "Johannes Müller", phone: "+491704444444", role: "EMPLOYEE" },
          { id: "emp-2", name: "Dieter Schmidt", phone: "+491705555555", role: "EMPLOYEE" },
          { id: "emp-3", name: "Anna Weber", phone: "+491706666666", role: "TEAM_LEADER" },
          { id: "emp-4", name: "Lukas Wagner", phone: "+491707777777", role: "EMPLOYEE" },
          { id: "emp-5", name: "Sarah Meyer", phone: "+491708888888", role: "EMPLOYEE" },
        ];

        setWarehouses(mockWH);
        setHalls(mockHalls);
        if (qWh && qHall && mockHalls.some((h: any) => h.id === qHall)) {
          setSelectedLocations([{ warehouseId: qWh, hallId: qHall }]);
        } else {
          setSelectedLocations([{ warehouseId: mockWH[0].id, hallId: mockHalls[0].id }]);
        }
        setEmployees(mockEmployees);
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
      if (!token || isOffline) return;

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
  }, [date, isOffline]);

  // Auto-load plan into edit mode when planId is provided in URL
  useEffect(() => {
    if (autoEditDone.current) return;
    if (!hasInitializedFromQuery) return;
    if (allCreatedPlans.length === 0) return;

    const qPlanId = searchParams.get("planId");
    if (!qPlanId) return;

    const plan = allCreatedPlans.find((p: any) => p.id === qPlanId);
    if (!plan) return;

    autoEditDone.current = true;
    isEditingRef.current = true;
    setPlanId(plan.id);
    const empIds = plan.assignedEmployees?.map((e: any) => e.id) || [];
    setAssignedEmployeeIds(empIds);
    applyShiftString(plan.shift || "Frühschicht");
    setTreffpunktTime(plan.treffpunktTime || "05:30");
    setTreffpunkt(plan.treffpunkt || "");
    setNotes(plan.notes || "");
    setAssignedContainerNumbers(plan.assignedContainers?.map((c: any) => c.containerNumber) || []);

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
    // For any assigned employees without explicit segments, initialize default segment
    empIds.forEach((id: string) => {
      if (!segMap[id] || segMap[id].length === 0) {
        segMap[id] = [
          {
            employeeId: id,
            treffpunkt: plan.treffpunkt || "",
            treffpunktTime: plan.treffpunktTime || "05:30",
            startTime: plan.startTime ? new Date(plan.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "06:00",
            endTime: plan.endTime ? new Date(plan.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "14:00",
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
        startTime: l.startTime || (plan.startTime ? new Date(plan.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "06:00"),
        endTime: l.endTime || (plan.endTime ? new Date(plan.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "14:00"),
        isOpenEnd: Boolean(l.isOpenEnd),
        notes: l.notes || "",
      })));
    } else if (plan.warehouseId && plan.hallId) {
      setSelectedLocations([{
        warehouseId: plan.warehouseId,
        hallId: plan.hallId,
        startTime: startTime || "06:00",
        endTime: endTimeOpen ? "" : (endTime || "14:00"),
        isOpenEnd: Boolean(endTimeOpen),
      }]);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [allCreatedPlans, hasInitializedFromQuery, searchParams]);

  const [isResendingEmailForPlanId, setIsResendingEmailForPlanId] = useState<string | null>(null);

  const handleResendPlanNotification = async (targetPlanId: string) => {
    const token = localStorage.getItem("accessToken");
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
        throw new Error(data.message || "Fehler beim Versenden der Benachrichtigungen");
      }
      showAlert({
        title: "E-Mails erfolgreich versendet",
        message: "Die vollständigen Dienstplan-Benachrichtigungen (inkl. Master-, Hallen- und Mitarbeiter-Zeiten) wurden erfolgreich an alle eingeteilten Mitarbeiter verschickt.",
        type: "success",
      });
    } catch (err: any) {
      showAlert({
        title: "Fehler beim Versand",
        message: err.message || "Benachrichtigungs-E-Mails konnten nicht gesendet werden.",
        type: "error",
      });
    } finally {
      setIsResendingEmailForPlanId(null);
    }
  };

  const fetchExistingPlanManual = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token || isOffline) return;
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
  }, [date, isOffline]);

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
        title: "⚠️ Mitarbeiter als abwesend markiert",
        message: `Dieser Mitarbeiter ist am ${date} als "${absRecord?.status === 'KRANK' ? 'Krank' : absRecord?.status === 'NICHT_GEARBEITET' ? 'Nicht gearbeitet' : 'Abwesend'}" markiert. Möchten Sie ihn dennoch einplanen?`,
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
      title: "Bearbeitung beendet",
      message: "Der Editor wurde auf den Neuanlage-Modus zurückgesetzt.",
      type: "info",
    });
  };

  const handleDeletePlan = async (idToDelete: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    showAlert({
      title: "Plan löschen?",
      message: "Möchten Sie diesen Schichtplan wirklich unwiderruflich löschen?",
      type: "warning",
      confirmText: "Ja, Plan löschen",
      cancelText: "Abbrechen",
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        if (!token) return;

        setIsLoading(true);
        try {
          if (!isOffline) {
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/${idToDelete}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.message || "Fehler beim Löschen des Plans");
            }
          }

          setAllCreatedPlans((prev) => prev.filter((p: any) => p.id !== idToDelete));
          if (planId === idToDelete) {
            handleCancelEdit();
          }

          showAlert({
            title: "Plan gelöscht",
            message: "Der Schichtplan wurde erfolgreich entfernt.",
            type: "success",
          });
        } catch (err: any) {
          showAlert({
            title: "Fehler",
            message: err.message || "Plan konnte nicht gelöscht werden",
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
        title: "⚠️ Keine Halle ausgewählt",
        message: "Bitte wählen Sie mindestens ein Lager und eine Halle für diesen Schichtplan aus.",
        type: "error",
      });
      return;
    }
    if (!date) {
      showAlert({
        title: "⚠️ Kein Datum gewählt",
        message: "Bitte wählen Sie ein gültiges Datum für den Schichtplan.",
        type: "error",
      });
      return;
    }
    if (shiftPreset === "Benutzerdefiniert" && (!startTime || (!endTimeOpen && !endTime))) {
      showAlert({
        title: "⚠️ Unvollständige Arbeitszeit",
        message: "Bitte geben Sie gültige Uhrzeiten (Von / Bis) für Ihre benutzerdefinierte Schicht an.",
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
          title: `⚠️ Zeitüberschneidung bei ${empName}`,
          message: `${overlapErr}. Bitte passen Sie die Arbeitszeiten der Abschnitte so an, dass sie sich nicht überschneiden.`,
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

      if (isOffline) {
        setTimeout(() => {
          const primaryLoc = selectedLocations[0] || { warehouseId: "", hallId: "" };
          const mockPlan = {
            id: planId || `mock-plan-${Date.now()}`,
            date,
            shift: formattedShift,
            treffpunktTime,
            treffpunkt,
            notes,
            warehouseId: primaryLoc.warehouseId,
            hallId: primaryLoc.hallId,
            locations: selectedLocations,
            assignedEmployees: employees.filter((e) => assignedEmployeeIds.includes(e.id)),
            assignedContainers: assignedContainerNumbers.map((c) => ({ containerNumber: c })),
            employeeSegments: allSegments,
          };
          setAllCreatedPlans((prev) => {
            const exists = prev.some((p: any) => p.id === mockPlan.id);
            return exists ? prev.map((p: any) => (p.id === mockPlan.id ? mockPlan : p)) : [mockPlan, ...prev];
          });
          setLastSavedPlanId(mockPlan.id);
          setFilterWarehouseId("ALL");
          isEditingRef.current = false;
          setPlanId(null);
          setNotes("");
          setAssignedEmployeeIds([]);
          setEmployeeSegments({});
          setAssignedContainerNumbers([]);
          showAlert({
            title: "Schichtplan gespeichert",
            message: "Tagesplan wurde im Offline-Modus erfolgreich simuliert!",
            type: "success",
          });
          setIsLoading(false);
          setTimeout(() => {
            createdPlansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 300);
        }, 500);
        return;
      }

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
          throw new Error(data.message || "Fehler beim Speichern des Schichtplans");
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
          title: "Erfolg!",
          message: planId ? "Schichtplan wurde erfolgreich aktualisiert." : "Neuer Schichtplan wurde erfolgreich erstellt!",
          type: "success",
        });

        setTimeout(() => {
          createdPlansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
      } catch (err: any) {
        showAlert({
          title: "Fehler beim Speichern",
          message: err.message || "Es ist ein unerwarteter Fehler aufgetreten.",
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
        throw new Error(err.message || "Fehler beim Speichern der Abwesenheit");
      }

      const saved = await res.json();
      setAbsences((prev) => {
        const filtered = prev.filter((a) => a.employeeId !== selectedEmployeeForAbsence.id);
        return [...filtered, saved];
      });

      setAbsenceModalOpen(false);
      showAlert({
        title: "Status gespeichert",
        message: `Abwesenheitsstatus für ${selectedEmployeeForAbsence.name} wurde erfolgreich aktualisiert.`,
        type: "success",
      });
    } catch (err: any) {
      showAlert({
        title: "Fehler",
        message: err.message || "Status konnte nicht gespeichert werden.",
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
        throw new Error(err.message || "Fehler beim Entfernen der Abwesenheit");
      }

      setAbsences((prev) => prev.filter((a) => a.employeeId !== selectedEmployeeForAbsence.id));
      setAbsenceModalOpen(false);
      showAlert({
        title: "Status entfernt",
        message: `Abwesenheit für ${selectedEmployeeForAbsence.name} wurde aufgehoben.`,
        type: "success",
      });
    } catch (err: any) {
      showAlert({
        title: "Fehler",
        message: err.message || "Abwesenheit konnte nicht gelöscht werden.",
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

  return (
    <div className="space-y-6 animate-fadeIn text-[#0f172a]">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Layers className="w-7 h-7 text-blue-600" />
            Schichtplanung & Treffpunkte (Logistics Shift Planning)
          </h3>
          <p className="text-slate-500 text-xs mt-1">
            Individuelle Treffpunkte, segmentierte Arbeitszeiten pro Mitarbeiter und lückenlose Abwesenheitserfassung.
          </p>
        </div>
      </div>

      {isOffline && (
        <div className="bg-amber-50 text-amber-800 border border-amber-200 px-4 py-3 rounded-xl flex items-center gap-3 text-xs font-semibold shadow-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline-Modus aktiv. Planänderungen werden lokal simuliert und validiert.</span>
        </div>
      )}

      {/* Daily Statistics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Aktive Schichten</p>
            <p className="text-lg font-extrabold text-slate-800">{allCreatedPlans.length}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Eingeplante Mit.</p>
            <p className="text-lg font-extrabold text-slate-800">{uniqueScheduledEmployeeIds.size} / {totalEmployeesCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Verfügbare Mit.</p>
            <p className="text-lg font-extrabold text-slate-800">{unscheduledEmployeesCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Container am Tag</p>
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
                Bearbeitungsmodus aktiv: Schichtplan wird geändert
                <span className="text-[10px] font-mono bg-blue-200 text-blue-900 px-2 py-0.5 rounded font-bold">
                  ID: {planId}
                </span>
              </h4>
              <p className="text-xs text-blue-700 mt-0.5">
                Sie ändern einen bereits gebuchten Schichtplan. Wenn Sie abbrechen, wird der Editor auf eine Neuanlage zurückgesetzt.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Neu erstellen / Abbrechen
            </button>
            <button
              type="button"
              onClick={() => handleDeletePlan(planId)}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Plan löschen
            </button>
          </div>
        </div>
      )}

      {/* Configuration Bar & Multi-Select Locations */}
      <div className="bg-white border border-slate-100 p-6 rounded-xl shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Date Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Datum (Shift Date) *
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Standard-Schichtvorlage (Preset) *
            </label>
            <select
              value={shiftPreset}
              onChange={(e) => {
                const val = e.target.value;
                setShiftPreset(val);
                if (val === "Frühschicht") { setStartTime("06:00"); setEndTime("14:00"); setEndTimeOpen(false); }
                else if (val === "Spätschicht") { setStartTime("14:00"); setEndTime("22:00"); setEndTimeOpen(false); }
                else if (val === "Nachtschicht") { setStartTime("22:00"); setEndTime("06:00"); setEndTimeOpen(false); }
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-colors shadow-sm"
            >
              <option value="Frühschicht">Frühschicht (06:00 - 14:00 Uhr)</option>
              <option value="Spätschicht">Spätschicht (14:00 - 22:00 Uhr)</option>
              <option value="Nachtschicht">Nachtschicht (22:00 - 06:00 Uhr)</option>
              <option value="Benutzerdefiniert">Benutzerdefiniert (Eigene Zeiten)</option>
            </select>
          </div>
        </div>

        {/* Multi-Location Selection */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <WarehouseIcon className="w-3.5 h-3.5 text-blue-600" />
              Einsatz-Standorte / Hallen auswählen (Multi-Location Selection) *
            </label>
            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              {selectedLocations.length} ausgewählt
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {warehouses.map((wh) => {
              const whHalls = halls.filter((h) => h.warehouseId === wh.id);
              return (
                <div key={wh.id} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2">
                  <p className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <WarehouseIcon className="w-3.5 h-3.5 text-slate-500" />
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
                Ebene 1: Offizieller Schichtplan — Master-Arbeitszeit
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Definiert den offiziellen Haupt-Zeitrahmen für diesen Tag. Individuelle Treffpunkte und Arbeitszeit-Abschnitte werden direkt pro Mitarbeiter zugeordnet.
              </p>
            </div>
            <span className={`text-xs font-mono font-extrabold px-3 py-1 rounded-full border shadow-2xs shrink-0 ${
              endTimeOpen ? "bg-amber-100 text-amber-950 border-amber-300" : "bg-blue-600 text-white border-blue-700"
            }`}>
              Offiziell: {getFormattedShift()}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Plan-Beginn:</span>
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
              <span className="text-xs font-bold text-slate-700">Plan-Ende:</span>
              {endTimeOpen ? (
                <span className="px-3.5 py-1.5 bg-amber-100 text-amber-950 border-2 border-amber-300 rounded-xl text-xs font-extrabold font-mono shadow-2xs">
                  Offen (Open End)
                </span>
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
              <span className="text-xs font-bold text-slate-700">Offenes Schichtende (Open End)</span>
            </label>
          </div>
        </div>

        {/* Level 2: Hall-Specific Working Time Window */}
        <div className="space-y-3 bg-linear-to-r from-emerald-50/70 to-slate-50 p-5 rounded-2xl border-2 border-emerald-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
            <div>
              <p className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                Ebene 2: Hallen-Arbeitszeiten & Schichtfenster pro Halle
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Jede Halle kann einen eigenen Einsatzzeitraum haben (z. B. Halle X: 08:00–12:00, Halle Y: 12:00–13:00). Überschreibt nicht die Master-Arbeitszeit.
              </p>
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
                Master-Zeiten auf alle Hallen anwenden
              </button>
            )}
          </div>

          {selectedLocations.length === 0 ? (
            <div className="bg-white/80 border border-dashed border-emerald-300 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500">
                Wählen Sie oben im Bereich <strong>Einsatzorte</strong> mindestens eine Halle aus, um hallenspezifische Arbeitszeiten festzulegen.
              </p>
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
                        <span className="text-[11px] text-slate-500">
                          ({wObj?.name || "Lager"})
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {locOpen ? "Offenes Ende" : `${locHours?.toFixed(1)} h`}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-600">Von:</span>
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
                        <span className="text-[11px] font-bold text-slate-600">Bis:</span>
                        {locOpen ? (
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-xs font-mono font-bold shadow-2xs">
                            Offen
                          </span>
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
                        <span className="text-[11px] font-bold text-slate-700">Offenes Ende</span>
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
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Notizen / Anweisungen (Notes & Special Instructions)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Besondere Anweisungen, Sicherheitsbestimmungen oder Hinweise eintragen..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-colors resize-none shadow-2xs"
          />
        </div>
      </div>

      {/* Container Input Section */}
      <div className="bg-white border border-slate-100 p-6 rounded-xl shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Geplante Container (Planned Containers)
          </label>
          {assignedContainerNumbers.length > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded-full text-[11px] font-bold">
              <Package className="w-3.5 h-3.5" />
              {assignedContainerNumbers.length} Container zugewiesen
            </span>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-blue-500" />
            Schnellzuweisung: Anzahl Container
          </p>
          <p className="text-[10px] text-slate-400">
            Geben Sie die Anzahl an — Platzhalter-IDs werden automatisch generiert (z. B. PLAN-001, PLAN-002 …)
          </p>
          <div className="flex gap-2 max-w-xs">
            <input
              type="number"
              min="1"
              max="999"
              placeholder="z.B. 5"
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
              Generieren
            </button>
          </div>
        </div>

        {/* Manual Container Number Entry */}
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            Manuelle Eingabe (Container-Nummer)
          </p>
          <div className="flex gap-2 max-w-lg">
            <input
              type="text"
              placeholder="z.B. MSCU1284920 (Containernummer)"
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
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-blue-500 transition-colors shadow-2xs"
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
              Hinzufügen
            </button>
          </div>
        </div>

        {assignedContainerNumbers.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Zugewiesene Container ({assignedContainerNumbers.length})
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
                    className="text-slate-400 hover:text-red-600 transition-colors p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
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
                Ebene 2: Mitarbeiter-Einsatzplanung — Individuelle Treffpunkte & Abschnitte ({assignedEmployeeIds.length})
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Jeder Mitarbeiter kann einen oder mehrere Treffpunkte & Arbeitszeit-Abschnitte haben. Offizieller Plan: <strong className="text-slate-800 font-mono">{getFormattedShift()}</strong>
              </p>
            </div>
            <span className="text-xs bg-amber-100 text-amber-950 border border-amber-300 px-3 py-1.5 rounded-xl font-bold shadow-2xs shrink-0">
              ⚠️ Treffzeit (Abholung) ist <strong>keine Arbeitszeit</strong>
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
                            {emp.role === "TEAM_LEADER" ? "Vorarbeiter" : "Mitarbeiter"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{emp.phone || "Keine Telefonnummer"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Netto-Arbeitszeit
                        </span>
                        <span className="text-sm font-mono font-extrabold text-blue-950 bg-blue-100/90 px-3 py-1 rounded-xl border border-blue-300 inline-block mt-0.5">
                          {totalHours.toFixed(2)} h (Treffzeit exkl.)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleEmployee(emp.id)}
                        className="text-slate-400 hover:text-red-600 p-2 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                        title="Mitarbeiter aus Schichtplan entfernen"
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
                        Hinweis: Einzelne Abschnitte weichen vom offiziellen Plan-Zeitrahmen ({getFormattedShift()}) ab.
                      </span>
                    </div>
                  )}

                  {/* Segments Table */}
                  <div className="overflow-x-auto">
                    <div className="min-w-[680px] space-y-2">
                      {/* Table Column Headers */}
                      <div className="grid grid-cols-[36px_140px_1fr_110px_110px_90px_40px] gap-2 px-2 py-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider items-center">
                        <div className="text-center">#</div>
                        <div className="text-amber-800">⏰ Treffzeit</div>
                        <div>📍 Treffpunkt / Einsatzort</div>
                        <div>Von (Arbeit)</div>
                        <div>Bis (Arbeit)</div>
                        <div className="text-right">Netto (h)</div>
                        <div className="text-center">Aktion</div>
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
                                title="Treffzeit (wird nicht zur Arbeitszeit gezählt)"
                              />
                            </div>

                            {/* Treffpunkt */}
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="z.B. Büro, Baustelle A, Hall X..."
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
                                {segHours.toFixed(1)} h
                              </span>
                            </div>

                            {/* Remove Action */}
                            <div className="flex justify-center">
                              {segs.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSegment(emp.id, idx)}
                                  className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Abschnitt löschen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-slate-200 text-xs">—</span>
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
                      <Plus className="w-3.5 h-3.5" /> + Treffpunkt / Arbeitszeit hinzufügen
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-400">Schnell-Treffpunkte:</span>
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
                          {preset}
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
              <Users className="w-4 h-4 text-blue-600" /> Mitarbeiter-Zuweisung & Status-Erfassung
            </h5>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Wählen Sie Mitarbeiter aus oder erfassen Sie Abwesenheiten (Nicht gearbeitet / Krank / Abwesend).
            </p>
          </div>
          <span className="font-mono text-xs bg-blue-50 text-blue-800 px-3 py-1 rounded-full font-bold border border-blue-200 self-start sm:self-auto">
            {assignedEmployeeIds.length} ausgewählt
          </span>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Mitarbeiter suchen (Name, Telefon, Rolle)..."
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
                <div className="text-center py-8 text-slate-400 text-xs italic">
                  Keine Mitarbeiter für "{employeeSearchTerm}" gefunden.
                </div>
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
                                <span>🟡 Krank</span>
                              </>
                            ) : absenceRecord.status === "NICHT_GEARBEITET" ? (
                              <>
                                <UserX className="w-3 h-3 text-red-700" />
                                <span>🔴 Nicht gearbeitet</span>
                              </>
                            ) : (
                              <>
                                <HelpCircle className="w-3 h-3 text-blue-700" />
                                <span>🔵 Abwesend ({absenceRecord.reason || "Grund"})</span>
                              </>
                            )}
                          </span>
                        )}

                        {existingShiftsForEmp.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 font-bold rounded-full flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-amber-600" />
                            Bereits heute eingeplant ({existingShiftsForEmp.join(", ")})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">{emp.phone || "Keine Telefonnummer"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Status/Absence Action Button */}
                    <button
                      type="button"
                      onClick={(e) => openAbsenceModal(emp, e)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs transition-colors flex items-center gap-1"
                      title="Abwesenheitsstatus für diesen Mitarbeiter erfassen"
                    >
                      <UserX className="w-3 h-3 text-slate-500" />
                      <span>{absenceRecord ? "Status bearbeiten" : "Status / Abwesend"}</span>
                    </button>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider font-mono border ${
                        emp.role === "TEAM_LEADER"
                          ? "bg-amber-100/80 text-amber-900 border-amber-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {emp.role === "TEAM_LEADER" ? "Vorarbeiter" : "Mitarbeiter"}
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
            {planId ? "Bestehender Schichtplan wird aktualisiert" : "Neuer Schichtplan-Entwurf wird angelegt"}
          </p>
          <p className="text-xs text-slate-300 mt-1">
            {selectedLocations.length} Standort(e) und {assignedEmployeeIds.length} Mitarbeiter sind für diese Schicht ausgewählt.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {planId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold px-5 py-2.5 rounded-lg transition-all cursor-pointer"
            >
              Abbrechen
            </button>
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
            <span>{planId ? "Änderungen speichern" : "Plan speichern & benachrichtigen"}</span>
          </button>
        </div>
      </div>

      {/* ── Created Plans Section ── */}
      <div ref={createdPlansSectionRef} className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h4 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Erstellte Schichtpläne am {date} ({displayedPlans.length})
            </h4>
            <p className="text-slate-500 text-xs mt-0.5">
              Übersicht aller aktiven Schichtpläne mit zugeordneten Hallen, Mitarbeitern und individuellen Treffpunkten
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 shrink-0">Filter Lager:</span>
            <select
              value={filterWarehouseId}
              onChange={(e) => setFilterWarehouseId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
            >
              <option value="ALL">Alle Lager zeigen</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>

        {displayedPlans.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
            Noch keine Schichtpläne für dieses Datum und den gewählten Filter erstellt.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {displayedPlans.map((plan: any) => {
              const isSelected = plan.id === planId;
              const planLocations = plan.locations && Array.isArray(plan.locations) && plan.locations.length > 0 
                ? plan.locations 
                : [{ warehouseId: plan.warehouseId, hallId: plan.hallId }];

              return (
                <div
                  key={plan.id}
                  className={`p-5 rounded-xl border transition-all flex flex-col justify-between ${
                    plan.id === lastSavedPlanId
                      ? "bg-green-50/50 border-green-300 shadow-md ring-2 ring-green-400"
                      : isSelected
                      ? "bg-blue-50/40 border-blue-300 shadow-sm ring-2 ring-blue-300"
                      : "bg-white border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-sm"
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header: Locations Tags + Actions */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {planLocations.map((loc: any, i: number) => {
                          const wName = warehouses.find((w) => w.id === (loc.warehouseId || loc.warehouse?.id))?.name || "Lager";
                          const locHall = halls.find((h) => h.id === (loc.hallId || loc.hall?.id));
                          const hName = locHall?.name || loc.hallName || "Halle";
                          const hColor = locHall?.color || loc.hall?.color || "#1d4ed8";
                          return (
                            <span
                              key={i}
                              className="text-[11px] font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 flex items-center gap-1.5 shadow-2xs"
                              style={{ borderLeft: `3px solid ${hColor}` }}
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hColor }} />
                              <WarehouseIcon className="w-3 h-3 text-blue-600 shrink-0" />
                              <span>{wName} — <strong className="text-blue-950">{hName}</strong></span>
                            </span>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isResendingEmailForPlanId === plan.id}
                          onClick={() => handleResendPlanNotification(plan.id)}
                          title="Dienstplan-E-Mails an alle Mitarbeiter erneut senden"
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                        >
                          {isResendingEmailForPlanId === plan.id ? (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-700" />
                          ) : (
                            <Mail className="w-3.5 h-3.5 text-blue-700" />
                          )}
                          <span>E-Mail senden</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            isEditingRef.current = true;
                            setPlanId(plan.id);
                            const empIds = plan.assignedEmployees?.map((e: any) => e.id) || [];
                            setAssignedEmployeeIds(empIds);
                            applyShiftString(plan.shift || "Frühschicht");
                            setTreffpunktTime(plan.treffpunktTime || "05:30");
                            setTreffpunkt(plan.treffpunkt || "");
                            setNotes(plan.notes || "");
                            setAssignedContainerNumbers(plan.assignedContainers?.map((c: any) => c.containerNumber) || []);
                            
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
                                    startTime: plan.startTime ? new Date(plan.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "06:00",
                                    endTime: plan.endTime ? new Date(plan.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "14:00",
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
                                startTime: l.startTime || (plan.startTime ? new Date(plan.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "06:00"),
                                endTime: l.endTime || (plan.endTime ? new Date(plan.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "14:00"),
                                isOpenEnd: Boolean(l.isOpenEnd),
                                notes: l.notes || "",
                              })));
                            } else if (plan.warehouseId && plan.hallId) {
                              setSelectedLocations([{
                                warehouseId: plan.warehouseId,
                                hallId: plan.hallId,
                                startTime: plan.startTime ? new Date(plan.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "06:00",
                                endTime: plan.endTime ? new Date(plan.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "14:00",
                                isOpenEnd: false,
                                notes: "",
                              }]);
                            }
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeletePlan(plan.id, e)}
                          title="Schichtplan löschen"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Shift & Master Time Info */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 bg-blue-50 text-blue-900 px-3 py-1 rounded-lg border border-blue-200 shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        Offizielle Arbeitszeit: {plan.shift || "Schicht"}
                      </span>

                      {plan.treffpunktTime && (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-900 font-mono text-xs font-bold rounded-lg border border-amber-200 shadow-2xs">
                          ⏰ Standard-Treff: {plan.treffpunktTime}
                        </span>
                      )}
                      {plan.treffpunkt && (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 flex items-center gap-1 shadow-2xs">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          {plan.treffpunkt}
                        </span>
                      )}
                    </div>

                    {/* Level 2: Hall-Specific Working Times */}
                    {planLocations && planLocations.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-emerald-600" />
                          Hallen-Arbeitszeiten ({planLocations.length}):
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {planLocations.map((loc: any, lIdx: number) => {
                            const wName = warehouses.find((w) => w.id === (loc.warehouseId || loc.warehouse?.id))?.name || "Lager";
                            const locHall = halls.find((h) => h.id === (loc.hallId || loc.hall?.id));
                            const hName = locHall?.name || loc.hallName || "Halle";
                            const hColor = locHall?.color || loc.hall?.color || "#10b981";
                            const lStart = loc.startTime || (plan.startTime ? new Date(plan.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "06:00");
                            const lEnd = loc.isOpenEnd ? "Offen" : (loc.endTime || (plan.endTime ? new Date(plan.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "14:00"));
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
                                  <span className="text-[10px] text-slate-500 truncate">({wName})</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono text-[11px] font-bold text-emerald-950 bg-white px-2 py-0.5 rounded border border-emerald-200">
                                    {lStart} – {lEnd}
                                  </span>
                                  {lHours !== null && lHours > 0 && (
                                    <span className="text-[10px] font-mono text-emerald-700">({lHours.toFixed(1)}h)</span>
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
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                        Mitarbeiter-Einsätze & Treffpunkte ({plan.assignedEmployees?.length || 0}):
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
                                    <span className="text-[10px] font-mono text-slate-500">{emp.phone || ""}</span>
                                  </div>
                                  <span className="text-[11px] font-bold font-mono text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded-lg border border-blue-200">
                                    Gesamt: {totalEmpHours > 0 ? `${totalEmpHours.toFixed(1)} h` : (plan.shift || "Master")}
                                  </span>
                                </div>
                                {empSegs.length > 0 ? (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[11px] border border-slate-200 rounded-lg overflow-hidden bg-white">
                                      <thead>
                                        <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                          <th className="py-1 px-2.5">Treffzeit</th>
                                          <th className="py-1 px-2.5">Treffpunkt</th>
                                          <th className="py-1 px-2.5">Arbeitszeit</th>
                                          <th className="py-1 px-2.5 text-right">Netto-Stunden</th>
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
                                  <span className="text-[10px] text-slate-400 italic">Folgt der offiziellen Master-Schichtzeit</span>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Keine Mitarbeiter zugewiesen</span>
                        )}
                      </div>
                    </div>

                    {/* Containers */}
                    {plan.assignedContainers && plan.assignedContainers.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Package className="w-3 h-3 text-slate-400" />
                          Container ({plan.assignedContainers.length}):
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal for Setting Employee Absence / Status ── */}
      {absenceModalOpen && selectedEmployeeForAbsence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  Status & Abwesenheit erfassen
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Für: <strong className="text-slate-800">{selectedEmployeeForAbsence.name}</strong> am <strong>{date}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbsenceModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Status auswählen *
              </label>
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
                  <span>Nicht gearbeitet</span>
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
                  <span>Krank</span>
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
                  <span>Abwesend (Grund)</span>
                </button>
              </div>
            </div>

            {/* Reason Selection if ABWESEND_GRUND */}
            {absenceStatusInput === "ABWESEND_GRUND" && (
              <div className="space-y-3 p-3.5 bg-blue-50/50 rounded-xl border border-blue-200/80 animate-fadeIn">
                <label className="text-[11px] font-bold text-blue-950 uppercase tracking-wider block">
                  Grund der Abwesenheit *
                </label>
                <select
                  value={absenceReasonCategory}
                  onChange={(e) => setAbsenceReasonCategory(e.target.value)}
                  className="w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="Arzttermin">Arzttermin</option>
                  <option value="Privater Termin">Privater Termin</option>
                  <option value="Behördentermin">Behördentermin</option>
                  <option value="Urlaub">Urlaub</option>
                  <option value="Sonstiger Grund">Sonstiger Grund (Manuelle Angabe)</option>
                </select>

                {absenceReasonCategory === "Sonstiger Grund" && (
                  <input
                    type="text"
                    placeholder="Spezifischen Grund eingeben..."
                    value={absenceCustomReason}
                    onChange={(e) => setAbsenceCustomReason(e.target.value)}
                    className="w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  />
                )}
              </div>
            )}

            {/* Notes Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Zusätzliche Notizen / Bemerkung
              </label>
              <textarea
                rows={2}
                value={absenceNotesInput}
                onChange={(e) => setAbsenceNotesInput(e.target.value)}
                placeholder="Optionale Notiz zur Abwesenheit..."
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
                  <Trash2 className="w-3.5 h-3.5" /> Abwesenheit entfernen
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAbsenceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Abbrechen
                </button>
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
                  <span>Status speichern</span>
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
