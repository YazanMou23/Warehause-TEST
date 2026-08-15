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
        const headers = { Authorization: `Bearer ${token}` };

        // Fetch warehouses
        const whRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, { headers });
        const whJson = whRes.ok ? await whRes.json() : null;
        const whData = whJson && Array.isArray(whJson.data) ? whJson.data : (Array.isArray(whJson) ? whJson : []);
        setWarehouses(whData);

        // Fetch halls
        const hallRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, { headers });
        const hallJson = hallRes.ok ? await hallRes.json() : null;
        const hallData = hallJson && Array.isArray(hallJson.data) ? hallJson.data : (Array.isArray(hallJson) ? hallJson : []);
        setHalls(hallData);

        if (qWh && qHall && hallData.some((h: any) => h.id === qHall)) {
          setSelectedLocations([{ warehouseId: qWh, hallId: qHall }]);
        } else if (hallData.length > 0) {
          setSelectedLocations([{ warehouseId: hallData[0].warehouseId, hallId: hallData[0].id }]);
        }

        // Fetch all employees (limit=10000 to prevent pagination hiding employees)
        const empRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees?limit=10000`, { headers });
        const empJson = empRes.ok ? await empRes.json() : null;
        const empData = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
        setEmployees(empData.filter((u: any) => u.role !== "ADMIN"));

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

  // Fetch all plans for the selected date whenever date changes
  useEffect(() => {
    if (!date) return;
    const fetchExistingPlans = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token || isOffline) return;

      setIsLoading(true);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/query?date=${date}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.ok) {
          const plans = await res.json();
          setAllCreatedPlans(plans);
        }
      } catch (err) {
        console.warn("Could not query plans from API");
      } finally {
        setIsLoading(false);
      }
    };

    fetchExistingPlans();
  }, [date, isOffline]);

  // Auto-load plan into edit mode when planId is provided in the URL (e.g. from Dashboard "Plan verwalten")
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
    setAssignedEmployeeIds(plan.assignedEmployees?.map((e: any) => e.id) || []);
    applyShiftString(plan.shift || "Frühschicht");
    setTreffpunktTime(plan.treffpunktTime || "05:30");
    setTreffpunkt(plan.treffpunkt || "");
    setNotes(plan.notes || "");
    setAssignedContainerNumbers(plan.assignedContainers?.map((c: any) => c.containerNumber) || []);

    if (plan.locations && Array.isArray(plan.locations) && plan.locations.length > 0) {
      setSelectedLocations(plan.locations.map((l: any) => ({
        warehouseId: l.warehouseId || l.warehouse?.id || "",
        hallId: l.hallId || l.hall?.id || "",
      })));
    } else if (plan.warehouseId && plan.hallId) {
      setSelectedLocations([{ warehouseId: plan.warehouseId, hallId: plan.hallId }]);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [allCreatedPlans, hasInitializedFromQuery, searchParams]);

  const fetchExistingPlanManual = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token || isOffline) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/query?date=${date}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const plans = await res.json();
        setAllCreatedPlans(plans);
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
        return [...prev, { warehouseId, hallId }];
      }
    });
  };

  const toggleEmployee = (empId: string) => {
    setAssignedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleCancelEdit = () => {
    isEditingRef.current = false;
    setPlanId(null);
    setNotes("");
    setAssignedEmployeeIds([]);
    setAssignedContainerNumbers([]);
    setContainerCountInput("");
    applyShiftString("Frühschicht");
    showAlert({
      title: "Bearbeiten abgebrochen",
      message: "Sie erstellen nun wieder einen neuen Schichtplan-Entwurf.",
      type: "info",
    });
  };

  const handleDeletePlan = async (targetPlanId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    showAlert({
      title: "Schichtplan löschen",
      message: "Möchten Sie diesen Schichtplan wirklich löschen/deaktivieren?",
      type: "warning",
      confirmText: "Löschen",
      cancelText: "Abbrechen",
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/${targetPlanId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || "Fehler beim Löschen des Schichtplans");
          }
          showAlert({
            title: "Schichtplan gelöscht",
            message: "Der Schichtplan wurde erfolgreich gelöscht.",
            type: "success",
          });
          if (planId === targetPlanId) {
            isEditingRef.current = false;
            setPlanId(null);
            setAssignedEmployeeIds([]);
            setAssignedContainerNumbers([]);
          }
          // Immediately update local state without waiting for page reload or network delay
          setAllCreatedPlans((prev) => prev.filter((p: any) => p.id !== targetPlanId));
          await fetchExistingPlanManual();
        } catch (err: any) {
          showAlert({
            title: "Fehler beim Löschen",
            message: err.message || "Plan konnte nicht gelöscht werden.",
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

    const executeSavePlan = async () => {
      setIsLoading(true);
      const formattedShift = getFormattedShift();

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
        // Backward compatible scalar fallback
        warehouseId: primaryLocation?.warehouseId,
        hallId: primaryLocation?.hallId,
        // Multi-location payload array for new backend
        locations: selectedLocations.map((loc) => ({
          warehouseId: loc.warehouseId,
          hallId: loc.hallId,
          notes: "",
        })),
        assignedEmployeeIds,
        assignedContainerNumbers,
        shift: formattedShift,
        treffpunkt,
        treffpunktTime,
        notes,
      };

      try {
        let res;
        if (planId) {
          // Update existing plan
          res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/${planId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
        } else {
          // Create new plan
          res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errText = data.message || "Failed to save plan";
          if (res.status === 409 || (typeof errText === "string" && (errText.toLowerCase().includes("overlap") || errText.toLowerCase().includes("conflict") || errText.toLowerCase().includes("überschreit")))) {
            throw new Error(
              `⚠️ SCHICHTÜBERSCHREITUNG ERKANNT\n\n` +
              `Ein oder mehrere der ausgewählten Mitarbeiter sind im gewählten Zeitraum bereits in einer anderen Schicht oder an einem anderen Standort eingeplant.\n\n` +
              `Details:\n• ${errText}\n\n` +
              `Bitte korrigieren Sie die Arbeitszeiten oder entfernen Sie überschneidende Mitarbeiter.`
            );
          }
          throw new Error(errText);
        }

        // Immediately update local state so newly created or updated plans appear in the last section instantly
        if (data && data.id) {
          setAllCreatedPlans((prev) => {
            const exists = prev.some((p: any) => p.id === data.id);
            if (exists) {
              return prev.map((p: any) => (p.id === data.id ? data : p));
            }
            return [data, ...prev];
          });
          setLastSavedPlanId(data.id);
          setFilterWarehouseId("ALL"); // Ensure the newly created or updated plan is visible in the filter
        }

        // Reset form out of edit mode after saving so user can clearly see the saved plan below or add a new one
        isEditingRef.current = false;
        setPlanId(null);
        setNotes("");
        setAssignedEmployeeIds([]);
        setAssignedContainerNumbers([]);
        setContainerCountInput("");

        showAlert({
          title: planId ? "Schichtplan aktualisiert!" : "Schichtplan erfolgreich gespeichert!",
          message: `Der Schichtplan (${data.shift || formattedShift}) an ${selectedLocations.length} Standort(en) wurde gespeichert. ${(data.assignedEmployees?.length || assignedEmployeeIds.length)} Mitarbeiter benachrichtigt.`,
          type: "success",
        });

        // Background re-fetch to ensure permanent database synchronization without page reload
        await fetchExistingPlanManual();
        setTimeout(() => {
          createdPlansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
      } catch (err: any) {
        showAlert({
          title: "Fehler beim Speichern",
          message: err.message || "Fehler beim Speichern des Schichtplans.",
          type: "error",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (assignedEmployeeIds.length === 0) {
      showAlert({
        title: "Keine Mitarbeiter zugewiesen",
        message: "Es wurden noch keine Mitarbeiter zu diesem Schichtplan zugewiesen. Möchten Sie den Plan trotzdem als leeren Entwurf speichern?",
        type: "warning",
        confirmText: "Trotzdem speichern",
        cancelText: "Abbrechen",
        onConfirm: () => {
          executeSavePlan();
        },
      });
      return;
    }

    executeSavePlan();
  };

  // Calculate quick stats for the selected date
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
            Schichtplanung (Multi-Warehouse Shift Planning)
          </h3>
          <p className="text-slate-500 text-xs mt-1">
            Erstellen und verwalten Sie einsatzübergreifende Schichtpläne mit exakter Zeit- und Kollisionsprüfung.
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
              Schichtvorlage (Preset) *
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
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-colors shadow-sm cursor-pointer"
            >
              <option value="Frühschicht">Frühschicht (06:00 - 14:00)</option>
              <option value="Spätschicht">Spätschicht (14:00 - 22:00)</option>
              <option value="Nachtschicht">Nachtschicht (22:00 - 06:00)</option>
              <option value="Benutzerdefiniert">Benutzerdefinierte Arbeitszeit...</option>
            </select>
          </div>
        </div>

        {/* Multi-Warehouse & Hall Selection UI */}
        <div className="bg-slate-50/90 border border-slate-200 p-5 rounded-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <WarehouseIcon className="w-4 h-4 text-blue-600" />
                Standort-Zuweisung (Lager & Hallen Mehrfachauswahl) *
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Klicken Sie auf eine oder mehrere Hallen, um sie diesem Schichtplan zuzuordnen.
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-3 py-1 rounded-full border border-blue-200">
              {selectedLocations.length} Standort{selectedLocations.length !== 1 ? "e" : ""} ausgewählt
            </span>
          </div>

          {/* Grouped by warehouse */}
          <div className="space-y-4">
            {warehouses.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Keine Lager verfügbar.</p>
            ) : (
              warehouses.map((wh) => {
                const whHalls = halls.filter((h) => h.warehouseId === wh.id);
                return (
                  <div key={wh.id} className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-2xs">
                    <p className="text-xs font-bold text-slate-700 mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      {wh.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {whHalls.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">Keine Hallen konfiguriert</span>
                      ) : (
                        whHalls.map((h) => {
                          const isSelected = selectedLocations.some(
                            (loc) => loc.warehouseId === wh.id && loc.hallId === h.id
                          );
                          const hColor = h.color || "#1d4ed8";
                          return (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => toggleLocation(wh.id, h.id)}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs border ${
                                isSelected
                                  ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/80 hover:border-slate-300"
                              }`}
                              style={
                                isSelected
                                  ? { borderLeft: `4px solid ${hColor}` }
                                  : {}
                              }
                            >
                              {isSelected ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/10"
                                  style={{ backgroundColor: hColor }}
                                />
                              )}
                              <span>{h.name}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selected Location Summary Tags */}
          {selectedLocations.length > 0 && (
            <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-2 items-center">
              <span className="text-[11px] font-bold text-slate-500 mr-1">Ausgewählt:</span>
              {selectedLocations.map((loc) => {
                const wName = warehouses.find((w) => w.id === loc.warehouseId)?.name || "Lager";
                const locHall = halls.find((h) => h.id === loc.hallId);
                const hName = locHall?.name || "Halle";
                const hColor = locHall?.color || "#3b82f6";
                return (
                  <div
                    key={`${loc.warehouseId}-${loc.hallId}`}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 text-white rounded-full text-xs font-medium shadow-2xs"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: hColor }}
                    />
                    <span className="text-slate-300 text-[10px]">{wName}:</span>
                    <span className="font-bold">{hName}</span>
                    <button
                      type="button"
                      onClick={() => toggleLocation(loc.warehouseId, loc.hallId)}
                      className="text-slate-400 hover:text-white transition-colors ml-1 p-0.5 rounded-full hover:bg-white/10 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Exact Start & End Time Inputs */}
        <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-bold text-slate-800">Exakte Arbeitszeit (Exact Shift Time Window):</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-600">Von:</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setShiftPreset("Benutzerdefiniert");
                }}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>

            <span className="text-slate-400 font-bold text-xs">--</span>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-600">Bis:</span>
              {endTimeOpen ? (
                <span className="bg-slate-100 border border-slate-300 rounded-lg px-3.5 py-1.5 text-xs font-bold text-slate-400 italic min-w-[90px] text-center">
                  offen
                </span>
              ) : (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setShiftPreset("Benutzerdefiniert");
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
                />
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-blue-300 transition-colors shadow-2xs">
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
                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-[11px] font-semibold text-slate-700">Offene Endzeit (Open End)</span>
            </label>

            <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full border shadow-2xs ${endTimeOpen ? "bg-amber-100 text-amber-900 border-amber-200" : "bg-blue-50 text-blue-800 border-blue-200"}`}>
              ⏰ {getFormattedShift()}
            </span>
          </div>
        </div>

        {/* Daily Treffzeit & Treffpunkt Section */}
        <div className="space-y-1.5 bg-amber-50/70 p-4 rounded-xl border border-amber-200/80 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="text-xs font-bold text-amber-950">Tägliche Treffzeit & Treffpunkt (Pick-up Details):</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-amber-900">Treffzeit:</span>
                <input
                  type="time"
                  value={treffpunktTime}
                  onChange={(e) => setTreffpunktTime(e.target.value)}
                  className="bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-amber-900">Treffpunkt:</span>
                <input
                  type="text"
                  placeholder="z.B. Hauptbahnhof Duisburg, Eingang Nord"
                  value={treffpunkt}
                  onChange={(e) => setTreffpunkt(e.target.value)}
                  className="bg-white border border-amber-300 rounded-lg px-3 py-1 text-xs text-slate-800 outline-none focus:border-amber-500 shadow-2xs min-w-[240px]"
                />
              </div>

              {treffpunktTime && (
                <span className="text-xs font-mono font-bold bg-amber-100 text-amber-950 px-3 py-1 rounded-full border border-amber-300 shadow-2xs">
                  📍 {treffpunkt || "Treffpunkt"} um ⏰ {treffpunktTime} Uhr
                </span>
              )}
            </div>
          </div>
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
        {/* Header */}
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

        {/* Quick-Add by Count */}
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

      {/* Selected Employees Chips Bar */}
      {assignedEmployeeIds.length > 0 && (
        <div className="bg-white border border-slate-100 p-5 rounded-xl shadow-sm space-y-2.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            Ausgewählte Mitarbeiter für diesen Schichtplan ({assignedEmployeeIds.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {assignedEmployeeIds.map((empId) => {
              const emp = employees.find((e) => e.id === empId);
              if (!emp) return null;
              return (
                <div
                  key={emp.id}
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold shadow-sm transition-all hover:bg-blue-700"
                >
                  <span>{emp.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleEmployee(emp.id)}
                    className="text-blue-200 hover:text-white transition-colors p-0.5 rounded-full hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Employees Directory List */}
      <div className="bg-white border border-slate-100 rounded-xl flex flex-col shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center">
          <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" /> Mitarbeiter-Zuweisung (Assign Personnel)
          </h5>
          <span className="font-mono text-xs bg-blue-50 text-blue-800 px-3 py-1 rounded-full font-bold border border-blue-200">
            {assignedEmployeeIds.length} ausgewählt
          </span>
        </div>

        {/* Search Bar for Mitarbeiter */}
        <div className="p-3 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Mitarbeiter direkt suchen (Name, Telefon, Rolle)..."
              value={employeeSearchTerm}
              onChange={(e) => setEmployeeSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-colors shadow-2xs"
            />
          </div>
        </div>

        <div className="overflow-y-auto max-h-[420px] divide-y divide-slate-100 p-3 space-y-1 bg-slate-50/20">
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
              // Check if employee is already booked in any other plan today
              const existingShiftsForEmp = allCreatedPlans
                .filter((p) => p.id !== planId && p.assignedEmployees?.some((ae: any) => ae.id === emp.id))
                .map((p) => p.shift || "Schicht");

              return (
                <div
                  key={emp.id}
                  onClick={() => toggleEmployee(emp.id)}
                  className={`p-3.5 flex justify-between items-center rounded-xl cursor-pointer transition-all border ${
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
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-bold ${isAssigned ? "text-blue-800" : "text-slate-800"}`}>
                          {emp.name}
                        </p>
                        {existingShiftsForEmp.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 font-bold rounded-full flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-amber-600" />
                            Bereits heute eingeplant ({existingShiftsForEmp.join(", ")})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">{emp.phone || "Keine Telefonnummer"}</p>
                    </div>
                  </div>
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
              Übersicht aller aktiven Schichtpläne mit zugeordneten Hallen, Mitarbeitern und Arbeitszeiten
            </p>
          </div>

          {/* Warehouse Filter for Plans List */}
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
                      ? "bg-green-50/50 border-green-300 shadow-md ring-2 ring-green-400 animate-pulse-once"
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

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            isEditingRef.current = true;
                            setPlanId(plan.id);
                            setAssignedEmployeeIds(plan.assignedEmployees?.map((e: any) => e.id) || []);
                            applyShiftString(plan.shift || "Frühschicht");
                            setTreffpunktTime(plan.treffpunktTime || "05:30");
                            setTreffpunkt(plan.treffpunkt || "");
                            setNotes(plan.notes || "");
                            setAssignedContainerNumbers(plan.assignedContainers?.map((c: any) => c.containerNumber) || []);
                            
                            // Load locations into state
                            if (plan.locations && Array.isArray(plan.locations) && plan.locations.length > 0) {
                              setSelectedLocations(plan.locations.map((l: any) => ({
                                warehouseId: l.warehouseId || l.warehouse?.id || "",
                                hallId: l.hallId || l.hall?.id || "",
                              })));
                            } else if (plan.warehouseId && plan.hallId) {
                              setSelectedLocations([{ warehouseId: plan.warehouseId, hallId: plan.hallId }]);
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

                    {/* Shift & Pick-up Info */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        {plan.shift || "Schicht"}
                      </span>

                      {plan.treffpunktTime && (
                        <span className="px-2.5 py-1 bg-amber-100/90 text-amber-950 font-mono text-xs font-bold rounded-md border border-amber-300/80">
                          ⏰ Treff: {plan.treffpunktTime} Uhr
                        </span>
                      )}
                      {plan.treffpunkt && (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-md border border-slate-200 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          {plan.treffpunkt}
                        </span>
                      )}
                    </div>

                    {/* Employees */}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-400" />
                        Eingeteilte Mitarbeiter ({plan.assignedEmployees?.length || 0}):
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {plan.assignedEmployees && plan.assignedEmployees.length > 0 ? (
                          plan.assignedEmployees.map((emp: any) => (
                            <span key={emp.id} className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md text-[11px] font-bold border border-slate-200 shadow-2xs">
                              {emp.name}
                            </span>
                          ))
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
