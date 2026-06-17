"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Warehouse as WarehouseIcon,
  AlertTriangle,
  MapPin,
  Layers,
  Plus,
  Grid,
  Percent,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Activity,
  Users,
  Trash2,
  X,
  TrendingUp,
  Sliders,
  Sparkles,
} from "lucide-react";

interface UserCompact {
  id: string;
  name: string;
  role: string;
}

interface HallItem {
  id: string;
  name: string;
  capacity: number | null;
  containers: any[];
  users: UserCompact[];
}

interface WarehouseItem {
  id: string;
  name: string;
  halls?: HallItem[];
  containers?: any[];
  users?: UserCompact[];
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  
  // Selected warehouse for breakdown details
  const [selectedWh, setSelectedWh] = useState<WarehouseItem | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newWhName, setNewWhName] = useState("");
  const [initialHallName, setInitialHallName] = useState("Hall A");
  const [initialHallCapacity, setInitialHallCapacity] = useState("100");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const router = useRouter();

  // Load user details and warehouses
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    // Decode role
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUserRole(payload.role || null);
    } catch (e) {
      console.error("Failed to decode token", e);
    }

    fetchData();
  }, [router]);

  const fetchData = async () => {
    setLoading(true);
    const token = localStorage.getItem("accessToken");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, { headers });
      const whJson = res.ok ? await res.json() : null;
      const whList = whJson && Array.isArray(whJson.data) ? whJson.data : (Array.isArray(whJson) ? whJson : []);
      
      setWarehouses(whList);
      setIsOffline(false);
      
      // If a warehouse was already selected, update its reference in local state
      if (selectedWh) {
        const updatedWh = whList.find((w: WarehouseItem) => w.id === selectedWh.id);
        if (updatedWh) {
          setSelectedWh(updatedWh);
        }
      }
    } catch (err) {
      setIsOffline(true);
      // Premium Fallback Mock Database
      const mockList: WarehouseItem[] = [
        {
          id: "wh-1",
          name: "Duisburg Port Hub",
          containers: Array(28).fill({}),
          users: [
            { id: "u1", name: "Lars Leader", role: "TEAM_LEADER" },
            { id: "u2", name: "Emil Employee", role: "EMPLOYEE" },
            { id: "u3", name: "Elsa Employee", role: "EMPLOYEE" },
          ],
          halls: [
            {
              id: "hall-1",
              name: "Hall A",
              capacity: 100,
              containers: Array(18).fill({}),
              users: [{ id: "u2", name: "Emil Employee", role: "EMPLOYEE" }],
            },
            {
              id: "hall-2",
              name: "Hall B",
              capacity: 100,
              containers: Array(10).fill({}),
              users: [{ id: "u3", name: "Elsa Employee", role: "EMPLOYEE" }],
            },
          ],
        },
        {
          id: "wh-2",
          name: "Wesel NRW-North",
          containers: Array(45).fill({}),
          users: [
            { id: "u4", name: "Lena Leader", role: "TEAM_LEADER" },
            { id: "u5", name: "Erik Employee", role: "EMPLOYEE" },
          ],
          halls: [
            {
              id: "hall-3",
              name: "Hall A",
              capacity: 100,
              containers: Array(30).fill({}),
              users: [{ id: "u5", name: "Erik Employee", role: "EMPLOYEE" }],
            },
            {
              id: "hall-4",
              name: "Hall B",
              capacity: 100,
              containers: Array(15).fill({}),
              users: [],
            },
          ],
        },
        {
          id: "wh-3",
          name: "Gelsenkirchen Zone",
          containers: Array(12).fill({}),
          users: [{ id: "u6", name: "Egon Employee", role: "EMPLOYEE" }],
          halls: [
            {
              id: "hall-5",
              name: "Hall A",
              capacity: 100,
              containers: Array(12).fill({}),
              users: [{ id: "u6", name: "Egon Employee", role: "EMPLOYEE" }],
            },
          ],
        },
        {
          id: "wh-4",
          name: "Hückelhoven South",
          containers: Array(8).fill({}),
          users: [],
          halls: [
            {
              id: "hall-6",
              name: "Hall A",
              capacity: 50,
              containers: Array(8).fill({}),
              users: [],
            },
          ],
        },
      ];
      setWarehouses(mockList);
      if (selectedWh) {
        const updatedWh = mockList.find((w: WarehouseItem) => w.id === selectedWh.id);
        if (updatedWh) {
          setSelectedWh(updatedWh);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Create warehouse call
  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhName.trim()) return;

    setCreateLoading(true);
    setCreateError("");
    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      const mockWhId = "mock-wh-" + Date.now();
      const mockHalls: HallItem[] = initialHallName.trim()
        ? [
            {
              id: "mock-hall-" + Date.now(),
              name: initialHallName,
              capacity: parseInt(initialHallCapacity, 10) || 100,
              containers: [],
              users: [],
            },
          ]
        : [];
      
      const newWh: WarehouseItem = {
        id: mockWhId,
        name: newWhName,
        halls: mockHalls,
        containers: [],
        users: [],
      };

      setWarehouses((prev) => [...prev, newWh]);
      setNewWhName("");
      setInitialHallName("Hall A");
      setInitialHallCapacity("100");
      setCreateModalOpen(false);
      setCreateLoading(false);
      return;
    }

    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: newWhName }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || "Failed to create warehouse");
      }

      const whData = await res.json();

      // If they provided an initial hall, let's create it!
      if (initialHallName.trim()) {
        const hallRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: initialHallName,
            warehouseId: whData.id,
            capacity: parseInt(initialHallCapacity, 10) || 100,
          }),
        });
        if (!hallRes.ok) {
          console.warn("Failed to create initial hall");
        }
      }

      setNewWhName("");
      setInitialHallName("Hall A");
      setInitialHallCapacity("100");
      setCreateModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setCreateError(err.message || "Network error occurred.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Deactivate warehouse call
  const handleDeactivateWarehouse = async () => {
    if (!confirmDeleteId) return;

    setDeleteLoading(true);
    const token = localStorage.getItem("accessToken");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses/${confirmDeleteId}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        if (selectedWh && selectedWh.id === confirmDeleteId) {
          setSelectedWh(null);
        }
        setConfirmDeleteId(null);
        await fetchData();
      }
    } catch (err) {
      console.error("Delete warehouse failed", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSelectWarehouse = (wh: WarehouseItem) => {
    setSelectedWh(wh);
    setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    );
  }

  // Calculate overall metrics for statistics
  const totalHallsCount = warehouses.reduce((acc, wh) => acc + (wh.halls?.length || 0), 0);
  const totalContainersCount = warehouses.reduce((acc, wh) => acc + (wh.containers?.length || 0), 0);
  const totalStaffCount = warehouses.reduce((acc, wh) => acc + (wh.users?.length || 0), 0);

  return (
    <div className="space-y-stack-lg animate-fadeIn text-on-background">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-stack-md">
        <div>
          <h2 className="font-headline-lg font-bold tracking-tight text-on-surface">
            Warehouse Infrastructure
          </h2>
          <p className="text-on-surface-variant font-body-sm">
            Monitoring real-time performance and hall configurations across active depots.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {userRole === "ADMIN" && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-lg font-label-md uppercase tracking-wider flex items-center gap-2 hover:bg-neutral-800 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add New Depot
            </button>
          )}
        </div>
      </div>

      {isOffline && (
        <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-2.5 rounded-lg flex items-center gap-2 text-label-md">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline mock active. Displaying local depot listings.</span>
        </div>
      )}

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-stack-md bg-surface-container-low border border-outline-variant p-stack-md rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary/10 text-secondary flex items-center justify-center rounded-lg">
            <WarehouseIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-outline uppercase tracking-wider font-semibold">Total Depots</p>
            <h4 className="text-body-lg font-black font-mono">{warehouses.length}</h4>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-outline-variant pt-3 sm:pt-0 sm:pl-6">
          <div className="w-10 h-10 bg-secondary/10 text-secondary flex items-center justify-center rounded-lg">
            <Grid className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-outline uppercase tracking-wider font-semibold">Total Hall Zones</p>
            <h4 className="text-body-lg font-black font-mono">{totalHallsCount}</h4>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-outline-variant pt-3 sm:pt-0 sm:pl-6">
          <div className="w-10 h-10 bg-secondary/10 text-secondary flex items-center justify-center rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-outline uppercase tracking-wider font-semibold">Active Floor Staff</p>
            <h4 className="text-body-lg font-black font-mono">{totalStaffCount}</h4>
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-stack-md">
        {warehouses.map((wh) => {
          // Calculations
          const halls = wh.halls || [];
          const containers = wh.containers || [];
          const users = wh.users || [];
          
          const totalCapacity = halls.reduce((sum, h) => sum + (h.capacity || 100), 0);
          const utilization = totalCapacity > 0 ? Math.round((containers.length / totalCapacity) * 100) : 0;
          
          // Determine status badge
          let statusLabel = "Optimal";
          let badgeColor = "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400";
          
          if (utilization > 80) {
            statusLabel = "Heavy Load";
            badgeColor = "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400";
          } else if (users.length < 2 && halls.length > 0) {
            statusLabel = "Understaffed";
            badgeColor = "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400";
          }

          const isSelected = selectedWh?.id === wh.id;

          return (
            <div
              key={wh.id}
              onClick={() => handleSelectWarehouse(wh)}
              className={`group bg-white border rounded-xl p-stack-md cursor-pointer transition-all duration-300 flex flex-col justify-between ${
                isSelected
                  ? "border-secondary ring-1 ring-secondary/50 shadow-md bg-secondary-container/[0.02]"
                  : "border-outline-variant hover:shadow-md hover:border-secondary/50"
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center group-hover:bg-secondary-container group-hover:text-white transition-colors">
                    <WarehouseIcon className="w-6 h-6 text-secondary group-hover:text-white" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2.5 py-0.5 rounded font-label-md text-[10px] uppercase font-bold tracking-wider ${badgeColor}`}>
                      {statusLabel}
                    </span>
                    {userRole === "ADMIN" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(wh.id);
                        }}
                        className="p-1 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded transition-colors"
                        title="Deactivate Depot"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <h4 className="font-bold text-body-lg text-on-surface group-hover:text-secondary transition-colors mb-1 flex items-center gap-1.5">
                  {wh.name}
                </h4>
                <p className="text-outline text-[12px] flex items-center gap-1 mb-4">
                  <MapPin className="w-3.5 h-3.5" /> Duisburg, Germany
                </p>

                {/* Stat Breakdown Grid */}
                <div className="grid grid-cols-2 gap-stack-md py-3 border-y border-outline-variant mb-4">
                  <div>
                    <span className="text-[10px] text-outline uppercase tracking-wider block">Halls</span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">{halls.length}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-outline uppercase tracking-wider block">Containers</span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">{containers.length}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-outline uppercase tracking-wider block">Active Staff</span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">{users.length}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-outline uppercase tracking-wider block">Utilization</span>
                    <span className="font-mono text-body-lg font-bold text-secondary">{utilization}%</span>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-3 mt-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] font-semibold text-on-surface-variant">
                    <span>Floor Capacity</span>
                    <span className="font-mono">{containers.length} / {totalCapacity} Units</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        utilization > 80
                          ? "bg-error"
                          : utilization > 60
                          ? "bg-amber-500"
                          : "bg-secondary"
                      }`}
                      style={{ width: `${Math.min(utilization, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectWarehouse(wh);
                  }}
                  className="w-full py-2 text-secondary font-label-md uppercase tracking-wider border border-secondary rounded-lg hover:bg-secondary hover:text-white transition-colors flex items-center justify-center gap-1.5"
                >
                  Configure Halls
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed View / Hall Breakdown Log */}
      {selectedWh && (
        <div
          ref={detailsRef}
          className="bg-white border border-outline-variant rounded-xl p-stack-md shadow-sm space-y-stack-md animate-in slide-in-from-bottom duration-500"
        >
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedWh(null)}
                className="p-2 text-on-surface hover:bg-surface-container-high rounded-full transition-all"
                title="Back to Grid"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="font-bold text-body-lg text-on-surface">
                  {selectedWh.name} Zone Layout
                </h3>
                <p className="text-on-surface-variant text-[12px]">
                  Real-time occupancy status and floor staff allocation per hall.
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedWh(null)}
              className="p-1.5 text-on-surface hover:bg-surface-container-high rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {!selectedWh.halls || selectedWh.halls.length === 0 ? (
              <div className="py-stack-lg text-center text-outline">
                <Grid className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-body-sm">No active halls configured for this facility.</p>
                {userRole === "ADMIN" && (
                  <button
                    onClick={() => router.push("/halls")}
                    className="mt-3 px-4 py-2 bg-secondary text-white rounded-lg text-label-md hover:bg-secondary-container transition-colors"
                  >
                    Configure Halls page
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant font-label-md text-[11px] uppercase tracking-wider">
                    <th className="p-4">Hall ID / Name</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Staff Count</th>
                    <th className="p-4">Shift Supervisor</th>
                    <th className="p-4">Occupancy</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant text-body-sm">
                  {selectedWh.halls.map((hall) => {
                    const occupancyPct = hall.capacity
                      ? Math.round((hall.containers.length / hall.capacity) * 100)
                      : 0;

                    let statusDot = "bg-green-500";
                    let statusLabel = "Active";
                    if (occupancyPct > 80) {
                      statusDot = "bg-amber-500";
                      statusLabel = "Busy";
                    } else if (hall.containers.length === 0) {
                      statusDot = "bg-outline";
                      statusLabel = "Idle";
                    }

                    // Find Supervisor (Role TEAM_LEADER)
                    const supervisor = hall.users.find(u => u.role === "TEAM_LEADER")?.name || 
                                     hall.users[0]?.name || 
                                     "None Assigned";

                    return (
                      <tr key={hall.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-4 font-bold text-on-surface flex items-center gap-2">
                          <Grid className="w-4 h-4 text-outline" />
                          {hall.name}
                        </td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
                            <span className={`w-2 h-2 rounded-full ${statusDot}`}></span>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-medium">{hall.users.length}</td>
                        <td className="p-4 text-on-surface-variant">{supervisor}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs w-16">{occupancyPct}%</span>
                            <div className="w-24 h-1.5 bg-surface-container-high rounded-full overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full ${
                                  occupancyPct > 80 ? "bg-error" : "bg-secondary"
                                }`}
                                style={{ width: `${Math.min(occupancyPct, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-[10px] text-outline font-mono">
                              ({hall.containers.length} / {hall.capacity || 100} units)
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => router.push(`/halls?warehouseId=${selectedWh.id}`)}
                            className="text-secondary hover:underline font-bold text-[12px] uppercase tracking-wider"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Atmospheric bottom card with predictive insight */}
      <div className="relative rounded-xl overflow-hidden shadow-md group bg-neutral-950 border border-outline-variant p-stack-lg text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(0,88,190,0.15),rgba(255,255,255,0))]"></div>
        <div className="relative z-10 max-w-3xl space-y-3">
          <span className="bg-secondary text-[10px] px-2.5 py-1 rounded font-bold uppercase tracking-widest text-white inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            System Optimization Intelligence
          </span>
          <h4 className="font-bold text-headline-md tracking-tight">Duisburg Port Container Flow Optimization</h4>
          <p className="text-neutral-400 font-body-sm leading-relaxed">
            Historical data patterns suggest a 22% increase in container throughput for the Duisburg facility over the next 48 hours. We recommend routing non-urgent cargo shipments directly to the Wesel NRW-North facility.
          </p>
          <div className="pt-2">
            <button
              onClick={() => router.push("/planning")}
              className="bg-white text-primary px-5 py-2.5 rounded-lg font-label-md uppercase tracking-wider hover:bg-secondary-fixed transition-colors text-xs font-bold"
            >
              Review Shift Plans
            </button>
          </div>
        </div>
      </div>

      {/* Modal - Create Warehouse */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-md w-full p-stack-md shadow-2xl relative">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-body-lg text-on-surface mb-1">Add New Logistics Depot</h3>
            <p className="text-on-surface-variant text-xs mb-4">
              Register a new warehouse hub location inside LogiFlow.
            </p>

            <form onSubmit={handleCreateWarehouse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                  Depot Name / Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Düsseldorf Center"
                  value={newWhName}
                  onChange={(e) => setNewWhName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low"
                  required
                />
              </div>

              {/* Initial default hall config */}
              <div className="p-4 bg-surface-container-low border border-outline-variant rounded-lg space-y-3">
                <span className="text-[10px] text-outline font-bold uppercase tracking-wider block">
                  Optional Initial Hall Configuration
                </span>
                
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Hall Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Hall A"
                    value={initialHallName}
                    onChange={(e) => setInitialHallName(e.target.value)}
                    className="w-full bg-white border border-outline-variant focus:border-secondary rounded-lg px-3 py-1.5 text-body-sm text-on-surface outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Hall Capacity
                  </label>
                  <input
                    type="number"
                    placeholder="100"
                    min="10"
                    value={initialHallCapacity}
                    onChange={(e) => setInitialHallCapacity(e.target.value)}
                    className="w-full bg-white border border-outline-variant focus:border-secondary rounded-lg px-3 py-1.5 text-body-sm text-on-surface outline-none"
                  />
                </div>
              </div>

              {createError && (
                <div className="bg-error-container text-on-error-container px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant hover:bg-surface-container-high rounded-lg text-label-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 bg-secondary text-white hover:bg-secondary-container rounded-lg text-label-md transition-colors font-bold disabled:opacity-50"
                >
                  {createLoading ? "Saving..." : "Create Depot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Confirm Deactivate */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-sm w-full p-stack-md shadow-2xl relative">
            <h3 className="font-bold text-body-lg text-on-surface mb-2 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              Deactivate Depot?
            </h3>
            <p className="text-on-surface-variant text-xs mb-4">
              This action soft-deactivates the warehouse depot and deactivates all halls associated with it. Staff members will be unassigned.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 border border-outline-variant hover:bg-surface-container-high rounded-lg text-label-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivateWarehouse}
                disabled={deleteLoading}
                className="px-4 py-2 bg-error text-white hover:bg-red-700 rounded-lg text-label-md transition-colors font-bold disabled:opacity-50"
              >
                {deleteLoading ? "Processing..." : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
