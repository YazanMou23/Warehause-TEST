"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Grid,
  Warehouse as WarehouseIcon,
  Users,
  Save,
  CheckCircle,
  AlertTriangle,
  X,
  Search,
  Edit2,
  Package,
  Clock,
  CheckCircle2,
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
}

interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
}

function PlanningPageContent() {
  const [date, setDate] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [halls, setHalls] = useState<Hall[]>([]);
  const [selectedHallId, setSelectedHallId] = useState("");
  const searchParams = useSearchParams();
  const [hasInitializedFromQuery, setHasInitializedFromQuery] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");

  // Selection states for planning
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>([]);
  const [shift, setShift] = useState("Frühschicht");
  const [notes, setNotes] = useState("");
  const [assignedContainerNumbers, setAssignedContainerNumbers] = useState<string[]>([]);
  const [typedContainerNumber, setTypedContainerNumber] = useState("");

  const [planId, setPlanId] = useState<string | null>(null);
  const [allCreatedPlans, setAllCreatedPlans] = useState<any[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

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
        setDate(new Date().toLocaleDateString('en-CA'));
      }

      try {
        const headers = { Authorization: `Bearer ${token}` };

        // Fetch warehouses
        const whRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, { headers });
        const whJson = whRes.ok ? await whRes.json() : null;
        const whData = whJson && Array.isArray(whJson.data) ? whJson.data : (Array.isArray(whJson) ? whJson : []);
        setWarehouses(whData);
        
        if (qWh && whData.some((w: any) => w.id === qWh)) {
          setSelectedWarehouseId(qWh);
        } else if (whData.length > 0) {
          setSelectedWarehouseId(whData[0].id);
        }

        // Fetch halls
        const hallRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, { headers });
        const hallJson = hallRes.ok ? await hallRes.json() : null;
        const hallData = hallJson && Array.isArray(hallJson.data) ? hallJson.data : (Array.isArray(hallJson) ? hallJson : []);
        setHalls(hallData);

        if (qHall && hallData.some((h: any) => h.id === qHall)) {
          setSelectedHallId(qHall);
        }

        // Fetch all employees (limit=10000 to prevent pagination hiding employees)
        const empRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees?limit=10000`, { headers });
        const empJson = empRes.ok ? await empRes.json() : null;
        const empData = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
        setEmployees(empData.filter((u: any) => u.role !== "ADMIN"));

        setIsOffline(false);
      } catch (err) {
        setIsOffline(true);
        // Load fallback mock metadata
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
        if (qWh && mockWH.some((w: any) => w.id === qWh)) {
          setSelectedWarehouseId(qWh);
        } else {
          setSelectedWarehouseId(mockWH[0].id);
        }
        setHalls(mockHalls);
        if (qHall && mockHalls.some((h: any) => h.id === qHall)) {
          setSelectedHallId(qHall);
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

  // Set default hall when warehouse changes
  useEffect(() => {
    if (!hasInitializedFromQuery) return;
    const filteredHalls = halls.filter((h) => h.warehouseId === selectedWarehouseId);
    if (filteredHalls.length > 0) {
      setSelectedHallId(filteredHalls[0].id);
    } else {
      setSelectedHallId("");
    }
  }, [selectedWarehouseId, halls, hasInitializedFromQuery]);

  // Fetch plan when date, warehouse, or hall changes
  useEffect(() => {
    if (!selectedWarehouseId || !selectedHallId || !date) return;

    const fetchExistingPlan = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token || isOffline) return;

      setIsLoading(true);
      setPlanId(null);
      setAssignedEmployeeIds([]);
      setShift("Frühschicht");
      setNotes("");

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/query?date=${date}&warehouseId=${selectedWarehouseId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.ok) {
          const plans = await res.json();
          setAllCreatedPlans(plans);
          const hallPlan = plans.find((p: any) => p.hallId === selectedHallId);
          if (hallPlan) {
            setPlanId(hallPlan.id);
            setAssignedEmployeeIds(hallPlan.assignedEmployees.map((e: any) => e.id));
            setShift(hallPlan.shift || "Frühschicht");
            setNotes(hallPlan.notes || "");
            setAssignedContainerNumbers(hallPlan.assignedContainers?.map((c: any) => c.containerNumber) || []);
          } else {
            setAssignedContainerNumbers([]);
          }
        }
      } catch (err) {
        console.warn("Could not query plans from API");
      } finally {
        setIsLoading(false);
      }
    };

    fetchExistingPlan();
  }, [date, selectedWarehouseId, selectedHallId, isOffline]);

  const fetchExistingPlanManual = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token || isOffline) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/query?date=${date}&warehouseId=${selectedWarehouseId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const plans = await res.json();
        setAllCreatedPlans(plans);
      }
    } catch (e) {}
  };

  const toggleEmployee = (empId: string) => {
    setAssignedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleSavePlan = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setIsLoading(true);

    if (isOffline) {
      setTimeout(() => {
        setPlanId("mock-plan-id");
        showAlert({
          title: "Schichtplan gespeichert",
          message: "Tagesplan wurde im Offline-Modus erfolgreich simuliert!",
          type: "success",
        });
        setIsLoading(false);
      }, 500);
      return;
    }

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
          body: JSON.stringify({
            assignedEmployeeIds,
            assignedContainerNumbers,
            shift,
            notes,
          }),
        });
      } else {
        // Create new plan
        res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            date,
            warehouseId: selectedWarehouseId,
            hallId: selectedHallId,
            assignedEmployeeIds,
            assignedContainerNumbers,
            shift,
            notes,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save plan");
      }

      setPlanId(data.id);
      showAlert({
        title: "Schichtplan erfolgreich erstellt!",
        message: `Der Schichtplan für ${shift} wurde erfolgreich gespeichert. ${assignedEmployeeIds.length} Mitarbeiter wurden benachrichtigt.`,
        type: "success",
      });
      fetchExistingPlanManual();
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

  const filteredHalls = halls.filter((h) => h.warehouseId === selectedWarehouseId);

  return (
    <div className="space-y-6 animate-fadeIn text-[#0f172a]">
      {/* Title */}
      <div>
        <h3 className="text-2xl font-extrabold text-slate-800 tracking-tight">Schichtplanung (Shift Planning)</h3>
        <p className="text-slate-500 text-xs mt-1">
          Erstellen und verwalten Sie die täglichen Personaleinsatzpläne für Hallen und Schichten.
        </p>
      </div>

      {isOffline && (
        <div className="bg-amber-50 text-amber-800 border border-amber-200 px-4 py-3 rounded-xl flex items-center gap-3 text-xs font-semibold">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline-Modus aktiv. Planänderungen werden lokal simuliert.</span>
        </div>
      )}

      {/* Configuration Bar */}
      <div className="bg-white border border-slate-100 p-5 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Date Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Datum (Shift Date)
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 transition-colors"
            />
          </div>
        </div>

        {/* Warehouse Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Lager (Warehouse)
          </label>
          <div className="relative">
            <WarehouseIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 transition-colors appearance-none"
            >
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Hall Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Halle (Warehouse Hall)
          </label>
          <div className="relative">
            <Grid className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedHallId}
              onChange={(e) => setSelectedHallId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 transition-colors appearance-none"
            >
              {filteredHalls.length === 0 ? (
                <option value="">Keine Hallen verfügbar</option>
              ) : (
                filteredHalls.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Shift Selection */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Schicht (Shift)
          </label>
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 transition-colors"
          >
            <option value="Frühschicht">Frühschicht (Early Shift)</option>
            <option value="Spätschicht">Spätschicht (Late Shift)</option>
            <option value="Nachtschicht">Nachtschicht (Night Shift)</option>
          </select>
        </div>

        {/* Notes TextArea */}
        <div className="space-y-1.5 col-span-1 md:col-span-4">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Notizen / Anweisungen (Notes)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Besondere Anweisungen oder Notizen für diese Schicht eintragen..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 transition-colors resize-none"
          />
        </div>
      </div>

      {/* Container Input Section */}
      <div className="bg-white border border-slate-100 p-5 rounded-xl shadow-sm space-y-4">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Geplante Container (Planned Containers)
          </label>
          <div className="flex gap-2">
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
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 transition-colors"
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
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm shadow-blue-500/10 cursor-pointer"
            >
              Hinzufügen
            </button>
          </div>
        </div>

        {assignedContainerNumbers.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Hinzugefügte Container ({assignedContainerNumbers.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {assignedContainerNumbers.map((cNum) => (
                <div
                  key={cNum}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold border border-slate-200"
                >
                  <span className="font-mono">{cNum}</span>
                  <button
                    type="button"
                    onClick={() => setAssignedContainerNumbers((prev) => prev.filter((num) => num !== cNum))}
                    className="text-slate-400 hover:text-slate-650 transition-colors p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
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
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Eingeteilte Mitarbeiter ({assignedEmployeeIds.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {assignedEmployeeIds.map((empId) => {
              const emp = employees.find((e) => e.id === empId);
              if (!emp) return null;
              return (
                <div
                  key={emp.id}
                  className="flex items-center gap-1.5 px-3 py-1 bg-[#1d4ed8] text-white rounded-full text-xs font-bold shadow-sm shadow-[#1d4ed8]/20 transition-all hover:bg-blue-700"
                >
                  <span>{emp.name}</span>
                  <button
                    onClick={() => toggleEmployee(emp.id)}
                    className="text-blue-100 hover:text-white transition-colors p-0.5 rounded-full hover:bg-white/10 cursor-pointer"
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
      <div className="bg-white border border-slate-100 rounded-xl flex flex-col shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center rounded-t-xl">
          <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" /> Mitarbeiter-Zuweisung (Assign Employees)
          </h5>
          <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-bold">
            {assignedEmployeeIds.length} ausgewählt
          </span>
        </div>

        {/* Search Bar for Mitarbeiter */}
        <div className="p-3 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Mitarbeiter direkt suchen (Name, Telefon)..."
              value={employeeSearchTerm}
              onChange={(e) => setEmployeeSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-y-auto max-h-[400px] divide-y divide-slate-100 p-3 space-y-1">
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
              return (
                <div
                  key={emp.id}
                  onClick={() => toggleEmployee(emp.id)}
                  className={`p-3 flex justify-between items-center rounded-xl cursor-pointer transition-all border border-transparent ${
                    isAssigned
                      ? "bg-blue-50/40 border-blue-100 shadow-sm"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <p className={`text-xs font-bold ${isAssigned ? "text-blue-700" : "text-slate-800"}`}>
                      {emp.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{emp.phone || "Keine Telefonnummer"}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider font-mono ${
                      emp.role === "TEAM_LEADER"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-600"
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-slate-100 p-5 rounded-xl shadow-sm">
        <div>
          <p className="text-xs font-bold text-slate-700 leading-none">
            {planId ? "Bestehender Schichtplan wird aktualisiert" : "Neuer Schichtplan-Entwurf"}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Mitarbeiter können auch später hinzugefügt oder entfernt werden.
          </p>
        </div>

        <button
          onClick={handleSavePlan}
          disabled={isLoading}
          className="bg-[#1d4ed8] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-6 py-2.5 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-4.5 w-4.5 border-b-2 border-white"></div>
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>Plan speichern</span>
        </button>
      </div>

      {/* ── Created Plans Section ── */}
      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Erstellte Schichtpläne ({allCreatedPlans.length})
            </h4>
            <p className="text-slate-400 text-xs mt-0.5">
              Übersicht der bereits angelegten Schichtpläne für das ausgewählte Datum & Lager
            </p>
          </div>
        </div>

        {allCreatedPlans.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            Noch keine Schichtpläne für dieses Datum / Lager erstellt.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allCreatedPlans.map((plan: any) => {
              const hName = halls.find((h) => h.id === plan.hallId)?.name || "Halle";
              const isSelected = plan.id === planId;
              return (
                <div
                  key={plan.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isSelected
                      ? "bg-blue-50/30 border-blue-300 shadow-sm ring-1 ring-blue-300"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {hName}
                      </span>
                      <h5 className="font-bold text-slate-800 text-xs mt-1.5 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {plan.shift || "Schicht"}
                      </h5>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedHallId(plan.hallId);
                        setPlanId(plan.id);
                        setAssignedEmployeeIds(plan.assignedEmployees?.map((e: any) => e.id) || []);
                        setShift(plan.shift || "Frühschicht");
                        setNotes(plan.notes || "");
                        setAssignedContainerNumbers(plan.assignedContainers?.map((c: any) => c.containerNumber) || []);
                      }}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" /> Bearbeiten
                    </button>
                  </div>

                  {/* Employees */}
                  <div className="mt-3 text-xs space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Eingeteilte Mitarbeiter ({plan.assignedEmployees?.length || 0}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {plan.assignedEmployees && plan.assignedEmployees.length > 0 ? (
                        plan.assignedEmployees.map((emp: any) => (
                          <span key={emp.id} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold">
                            {emp.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Keine zugewiesen</span>
                      )}
                    </div>
                  </div>

                  {/* Containers */}
                  {plan.assignedContainers && plan.assignedContainers.length > 0 && (
                    <div className="mt-2 text-xs space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Container ({plan.assignedContainers.length}):
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {plan.assignedContainers.map((cont: any) => (
                          <span key={cont.id || cont.containerNumber} className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-100 font-mono text-[10px] font-bold rounded">
                            {cont.containerNumber}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {plan.notes && (
                    <p className="mt-2 text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded border border-slate-100">
                      "{plan.notes}"
                    </p>
                  )}
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    }>
      <PlanningPageContent />
    </Suspense>
  );
}
