"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Grid,
  Warehouse as WarehouseIcon,
  Users,
  Package,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

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

interface Container {
  id: string;
  containerNumber: string;
  status: "FULL" | "EMPTY";
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
  const [containers, setContainers] = useState<Container[]>([]);

  // Selection states for planning
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>([]);
  const [assignedContainerIds, setAssignedContainerIds] = useState<string[]>([]);

  const [planId, setPlanId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
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

        // Fetch employees
        const empRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees`, { headers });
        const empJson = empRes.ok ? await empRes.json() : null;
        const empData = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
        setEmployees(empData.filter((u: any) => u.role !== "ADMIN"));

        // Fetch containers
        const containerRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers`, { headers });
        const containerJson = containerRes.ok ? await containerRes.json() : null;
        const containerData = containerJson && Array.isArray(containerJson.data) ? containerJson.data : (Array.isArray(containerJson) ? containerJson : []);
        setContainers(containerData);

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
        ];
        const mockContainers = [
          { id: "c-1", containerNumber: "MSCU1284920", status: "FULL" as const },
          { id: "c-2", containerNumber: "HLXU8472910", status: "EMPTY" as const },
          { id: "c-3", containerNumber: "MAEU5829104", status: "FULL" as const },
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
        setContainers(mockContainers);
      } finally {
        setHasInitializedFromQuery(true);
      }
    };

    loadMetadata();
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
      setAssignedContainerIds([]);

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/planning/query?date=${date}&warehouseId=${selectedWarehouseId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.ok) {
          const plans = await res.json();
          // Find if there is a plan for this specific hall
          const hallPlan = plans.find((p: any) => p.hallId === selectedHallId);
          if (hallPlan) {
            setPlanId(hallPlan.id);
            setAssignedEmployeeIds(hallPlan.assignedEmployees.map((e: any) => e.id));
            setAssignedContainerIds(hallPlan.assignedContainers.map((c: any) => c.id));
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

  const toggleEmployee = (empId: string) => {
    setAssignedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const toggleContainer = (containerId: string) => {
    setAssignedContainerIds((prev) =>
      prev.includes(containerId) ? prev.filter((id) => id !== containerId) : [...prev, containerId]
    );
  };

  const handleSavePlan = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setIsLoading(true);
    setMessage({ text: "", type: "" });

    if (isOffline) {
      // Offline mock save
      setTimeout(() => {
        setPlanId("mock-plan-id");
        setMessage({ text: "Daily plan saved successfully in mock mode!", type: "success" });
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
            assignedContainerIds,
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
            assignedContainerIds,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save plan");
      }

      setPlanId(data.id);
      setMessage({ text: "Daily plan updated successfully! SMS alerts broadcasted.", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to save plan.", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredHalls = halls.filter((h) => h.warehouseId === selectedWarehouseId);

  return (
    <div className="space-y-stack-lg animate-fadeIn">
      {/* Title */}
      <div>
        <h3 className="font-headline-lg font-bold text-on-surface">Daily Shift Planning</h3>
        <p className="text-on-surface-variant font-body-sm">
          Select date and warehouse hall to assign employees and import containers.
        </p>
      </div>

      {isOffline && (
        <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-2.5 rounded-lg flex items-center gap-2 text-label-md">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline mode active. Modifications will be preserved locally in mock states.</span>
        </div>
      )}

      {/* Configuration Bar */}
      <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm grid grid-cols-1 md:grid-cols-3 gap-stack-md">
        
        {/* Date Selector */}
        <div className="space-y-1.5">
          <label className="text-label-md font-bold text-outline uppercase tracking-wider text-[10px]">
            Shift Date
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 text-body-sm text-on-surface outline-none"
            />
          </div>
        </div>

        {/* Warehouse Selector */}
        <div className="space-y-1.5">
          <label className="text-label-md font-bold text-outline uppercase tracking-wider text-[10px]">
            Warehouse
          </label>
          <div className="relative">
            <WarehouseIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 text-body-sm text-on-surface outline-none appearance-none"
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
          <label className="text-label-md font-bold text-outline uppercase tracking-wider text-[10px]">
            Warehouse Hall
          </label>
          <div className="relative">
            <Grid className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <select
              value={selectedHallId}
              onChange={(e) => setSelectedHallId(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 text-body-sm text-on-surface outline-none appearance-none"
            >
              {filteredHalls.length === 0 ? (
                <option value="">No halls available</option>
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
      </div>

      {/* Main Assignment UI */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-stack-md">
        
        {/* Employees Assignment */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg flex flex-col h-[400px]">
          <div className="p-stack-md border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
            <h5 className="font-bold text-body-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-secondary" /> Assigned Employees
            </h5>
            <span className="font-mono text-label-md bg-secondary-container text-white px-2 py-0.5 rounded font-bold">
              {assignedEmployeeIds.length} Selected
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-outline-variant p-2">
            {employees.length === 0 ? (
              <div className="text-center py-8 text-outline text-body-sm">
                No active employee directory loaded.
              </div>
            ) : (
              employees.map((emp) => {
                const isAssigned = assignedEmployeeIds.includes(emp.id);
                return (
                  <div
                    key={emp.id}
                    onClick={() => toggleEmployee(emp.id)}
                    className={`p-3.5 flex justify-between items-center rounded-lg cursor-pointer transition-all hover:bg-surface-bright ${
                      isAssigned ? "bg-secondary-container/10 border-l-4 border-secondary" : ""
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-body-sm text-on-surface">{emp.name}</p>
                      <p className="text-[12px] text-outline font-mono mt-0.5">{emp.phone}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider font-mono ${
                        emp.role === "TEAM_LEADER"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {emp.role.replace("_", " ")}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Containers Assignment */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg flex flex-col h-[400px]">
          <div className="p-stack-md border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
            <h5 className="font-bold text-body-lg flex items-center gap-2">
              <Package className="w-5 h-5 text-secondary" /> Container Inventory Allocation
            </h5>
            <span className="font-mono text-label-md bg-secondary-container text-white px-2 py-0.5 rounded font-bold">
              {assignedContainerIds.length} Allocated
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-outline-variant p-2">
            {containers.length === 0 ? (
              <div className="text-center py-8 text-outline text-body-sm">
                No container inventory found. Import container listings first.
              </div>
            ) : (
              containers.map((c) => {
                const isAssigned = assignedContainerIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={() => toggleContainer(c.id)}
                    className={`p-3.5 flex justify-between items-center rounded-lg cursor-pointer transition-all hover:bg-surface-bright ${
                      isAssigned ? "bg-secondary-container/10 border-l-4 border-secondary" : ""
                    }`}
                  >
                    <div>
                      <p className="font-bold text-body-sm font-mono text-on-surface">
                        {c.containerNumber}
                      </p>
                      <p className="text-[11px] text-outline mt-0.5 flex items-center gap-1">
                        <Info className="w-3 h-3" /> Double tap to select
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                        c.status === "FULL"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Save Button Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm">
        <div>
          <p className="text-body-sm text-on-surface-variant font-medium">
            {planId ? "Modifying existing daily plan record" : "No plan created yet for this slot"}
          </p>
          <p className="text-[12px] text-outline">
            Confirming changes will automatically alert assigned team leaders via Telegram updates.
          </p>
        </div>

        <button
          onClick={handleSavePlan}
          disabled={isLoading}
          className="bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer self-end sm:self-auto"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <Save className="w-5 h-5" />
          )}
          <span>Save Plan Assignments</span>
        </button>
      </div>

      {/* Notification Toast */}
      {message.text && (
        <div
          className={`p-4 rounded-lg flex items-start gap-2.5 text-body-sm shadow-md animate-slideUp max-w-xl ${
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
