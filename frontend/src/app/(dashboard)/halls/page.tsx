"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Grid as GridIcon,
  AlertTriangle,
  Layers,
  Percent,
  Plus,
  Trash2,
  X,
  Warehouse as WarehouseIcon,
  Users,
  Activity,
  SlidersHorizontal,
  ChevronDown,
  Edit2,
  QrCode,
  Palette,
} from "lucide-react";
import QRCodeModal from "../../components/QRCodeModal";
import HallColorPicker, { getContrastTextColor } from "../../components/HallColorPicker";

interface UserCompact {
  id: string;
  name: string;
  role: string;
}

interface WarehouseItem {
  id: string;
  name: string;
}

interface HallItem {
  id: string;
  name: string;
  warehouseId: string;
  warehouse?: WarehouseItem;
  capacity: number | null;
  color?: string;
  containers?: any[];
  users?: UserCompact[];
}

function HallsPageContent() {
  const [halls, setHalls] = useState<HallItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Filters state
  const searchParams = useSearchParams();
  const initialWhId = searchParams.get("warehouseId") || "";
  const [selectedWhId, setSelectedWhId] = useState(initialWhId);
  const [capacityFilter, setCapacityFilter] = useState("all"); // all, small (<=100), medium (101-300), large (>300)

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newHallName, setNewHallName] = useState("");
  const [newHallWhId, setNewHallWhId] = useState("");
  const [newHallCapacity, setNewHallCapacity] = useState("100");
  const [newHallColor, setNewHallColor] = useState("#1d4ed8");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingHall, setEditingHall] = useState<HallItem | null>(null);
  const [editHallName, setEditHallName] = useState("");
  const [editHallWhId, setEditHallWhId] = useState("");
  const [editHallCapacity, setEditHallCapacity] = useState("100");
  const [editHallColor, setEditHallColor] = useState("#1d4ed8");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [selectedQrHall, setSelectedQrHall] = useState<HallItem | null>(null);

  // Quick Color Customizer Modal
  const [quickColorModalOpen, setQuickColorModalOpen] = useState(false);
  const [quickColorHall, setQuickColorHall] = useState<HallItem | null>(null);
  const [quickColorHex, setQuickColorHex] = useState("#1d4ed8");
  const [quickColorLoading, setQuickColorLoading] = useState(false);
  const [quickColorError, setQuickColorError] = useState("");
  const router = useRouter();

  // Decode user role and load initial data
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUserRole(payload.role || null);
    } catch (e) {
      console.error("Failed to decode token", e);
    }

    fetchWarehouses();
  }, [router]);

  // Fetch halls whenever warehouse filter changes
  useEffect(() => {
    fetchHalls();
  }, [selectedWhId]);

  const fetchWarehouses = async () => {
    const token = localStorage.getItem("accessToken");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses?limit=100`, { headers });
      const dataJson = res.ok ? await res.json() : null;
      const list = dataJson && Array.isArray(dataJson.data) ? dataJson.data : [];
      setWarehouses(list);
    } catch (e) {
      setWarehouses([
        { id: "wh-1", name: "Duisburg Port Hub" },
        { id: "wh-2", name: "Wesel NRW-North" },
        { id: "wh-3", name: "Gelsenkirchen Zone" },
        { id: "wh-4", name: "Hückelhoven South" },
      ]);
    }
  };

  const fetchHalls = async () => {
    setLoading(true);
    const token = localStorage.getItem("accessToken");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      let url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls?limit=100`;
      if (selectedWhId) {
        url += `&warehouseId=${selectedWhId}`;
      }
      
      const res = await fetch(url, { headers });
      const dataJson = res.ok ? await res.json() : null;
      const list = dataJson && Array.isArray(dataJson.data) ? dataJson.data : (Array.isArray(dataJson) ? dataJson : []);
      
      setHalls(list);
    } catch (err) {
      console.error("Failed to load halls:", err);
      setHalls([]);
    } finally {
      setLoading(false);
    }
  };

  // Create hall action
  const handleCreateHall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHallName.trim() || !newHallWhId) return;

    setCreateLoading(true);
    setCreateError("");
    const token = localStorage.getItem("accessToken");
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newHallName,
          warehouseId: newHallWhId,
          capacity: parseInt(newHallCapacity, 10),
          color: newHallColor,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        const msg = Array.isArray(errJson.message) ? errJson.message.join(", ") : errJson.message;
        throw new Error(msg || "Failed to create hall");
      }

      setNewHallName("");
      setNewHallColor("#1d4ed8");
      setCreateModalOpen(false);
      await fetchHalls();
    } catch (err: any) {
      setCreateError(err.message || "Network error occurred.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Edit hall action
  const handleEditHall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHall || !editHallName.trim() || !editHallWhId) return;

    setEditLoading(true);
    setEditError("");
    const token = localStorage.getItem("accessToken");
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls/${editingHall.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editHallName,
          warehouseId: editHallWhId,
          capacity: parseInt(editHallCapacity, 10),
          color: editHallColor,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        const msg = Array.isArray(errJson.message) ? errJson.message.join(", ") : errJson.message;
        throw new Error(msg || "Failed to update hall");
      }

      setEditModalOpen(false);
      setEditingHall(null);
      await fetchHalls();
    } catch (err: any) {
        setEditError(err.message || "Network error occurred.");
    } finally {
      setEditLoading(false);
    }
  };

  // Quick update color action
  const handleQuickUpdateColor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickColorHall) return;

    setQuickColorLoading(true);
    setQuickColorError("");
    const token = localStorage.getItem("accessToken");
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls/${quickColorHall.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            color: quickColorHex,
          }),
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to update hall color");
      }

      setQuickColorModalOpen(false);
      setQuickColorHall(null);
      await fetchHalls();
    } catch (err: any) {
        setQuickColorError(err.message || "Could not update hall color.");
    } finally {
      setQuickColorLoading(false);
    }
  };

  // Delete hall action
  const handleDeleteHall = async () => {
    if (!confirmDeleteId) return;

    setDeleteLoading(true);
    const token = localStorage.getItem("accessToken");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls/${confirmDeleteId}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        setConfirmDeleteId(null);
        await fetchHalls();
      }
    } catch (err) {
      console.error("Delete hall failed", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Local filtering based on capacity bounds
  const filteredHalls = halls.filter((hall) => {
    const cap = hall.capacity || 0;
    if (capacityFilter === "small") {
      return cap <= 100;
    }
    if (capacityFilter === "medium") {
      return cap > 100 && cap <= 300;
    }
    if (capacityFilter === "large") {
      return cap > 300;
    }
    return true;
  });

  return (
    <div className="space-y-stack-lg animate-fadeIn text-on-background">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-stack-md">
        <div>
          <h2 className="font-headline-lg font-bold tracking-tight text-on-surface">
            Warehouse Halls
          </h2>
          <p className="text-on-surface-variant font-body-sm">
            Configure logistics staging sectors, track utilization, and assign floor teams.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userRole === "ADMIN" && (
            <button
              onClick={() => {
                setNewHallWhId(selectedWhId || (warehouses[0]?.id || ""));
                setCreateModalOpen(true);
              }}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-lg font-label-md uppercase tracking-wider flex items-center gap-2 hover:bg-neutral-800 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Configure Staging Hall
            </button>
          )}
        </div>
      </div>



      {/* Filter Toolbar */}
      <div className="bg-white border border-outline-variant p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Warehouse Dropdown Filter */}
          <div className="relative">
            <label className="block text-[10px] text-outline uppercase tracking-wider font-bold mb-1">
              Filter by Facility
            </label>
            <div className="relative">
              <select
                value={selectedWhId}
                onChange={(e) => setSelectedWhId(e.target.value)}
                className="appearance-none bg-surface-container-low border border-outline-variant rounded-lg pl-3 pr-10 py-2 text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none text-on-surface font-medium cursor-pointer"
              >
                <option value="">All Facilities</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            </div>
          </div>

          {/* Capacity Filters */}
          <div>
            <label className="block text-[10px] text-outline uppercase tracking-wider font-bold mb-1">
              Staging Capacity
            </label>
            <div className="flex border border-outline-variant rounded-lg overflow-hidden bg-surface-container-low text-body-sm font-semibold">
              <button
                onClick={() => setCapacityFilter("all")}
                className={`px-3 py-2 border-r border-outline-variant last:border-0 transition-colors ${
                  capacityFilter === "all"
                    ? "bg-secondary text-white"
                    : "hover:bg-surface-container-high text-on-surface-variant"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setCapacityFilter("small")}
                className={`px-3 py-2 border-r border-outline-variant last:border-0 transition-colors ${
                  capacityFilter === "small"
                    ? "bg-secondary text-white"
                    : "hover:bg-surface-container-high text-on-surface-variant"
                }`}
                title="Capacity <= 100 units"
              >
                Small (≤100)
              </button>
              <button
                onClick={() => setCapacityFilter("medium")}
                className={`px-3 py-2 border-r border-outline-variant last:border-0 transition-colors ${
                  capacityFilter === "medium"
                    ? "bg-secondary text-white"
                    : "hover:bg-surface-container-high text-on-surface-variant"
                }`}
                title="Capacity 101 to 300 units"
              >
                Medium (101-300)
              </button>
              <button
                onClick={() => setCapacityFilter("large")}
                className={`px-3 py-2 border-r border-outline-variant last:border-0 transition-colors ${
                  capacityFilter === "large"
                    ? "bg-secondary text-white"
                    : "hover:bg-surface-container-high text-on-surface-variant"
                }`}
                title="Capacity > 300 units"
              >
                Large (&gt;300)
              </button>
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[11px] font-mono text-outline font-semibold uppercase tracking-wider">
            Showing {filteredHalls.length} of {halls.length} Zones
          </span>
        </div>
      </div>

      {/* Grid of Halls */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
        </div>
      ) : filteredHalls.length === 0 ? (
        <div className="bg-white border border-outline-variant rounded-xl p-stack-lg text-center text-outline">
          <GridIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <h5 className="font-bold text-on-surface text-body-lg mb-1">No Hall Zones Found</h5>
          <p className="text-body-sm">No staging halls match your filter selections.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-stack-md">
          {filteredHalls.map((hall) => {
            const containers = hall.containers || [];
            const users = hall.users || [];
            const capacity = hall.capacity || 100;
            const occupancyPct = Math.round((containers.length / capacity) * 100);

            // Staging status
            let statusLabel = "Active";
            let statusBadge = "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400";
            if (occupancyPct > 85) {
              statusLabel = "Full Load";
              statusBadge = "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400";
            } else if (users.length === 0) {
              statusLabel = "Unstaffed";
              statusBadge = "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400";
            } else if (containers.length === 0) {
              statusLabel = "Idle";
              statusBadge = "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-400";
            }

            const hallColor = hall.color || '#1d4ed8';
            const iconBg = hallColor.startsWith('#') && hallColor.length === 7 ? `${hallColor}18` : undefined;

             return (
              <div
                key={hall.id}
                className="bg-white border border-outline-variant rounded-xl p-stack-md shadow-sm hover:shadow-md hover:border-secondary/40 transition-all flex flex-col justify-between"
                style={{ borderTop: `4px solid ${hallColor}` }}
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div className="w-10 h-10 bg-secondary/10 text-secondary flex items-center justify-center rounded-lg" style={{ color: hallColor, backgroundColor: iconBg }}>
                      <GridIcon className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded font-label-md text-[9px] uppercase font-bold tracking-wider ${statusBadge}`}>
                        {statusLabel}
                      </span>
                      {(userRole === "ADMIN" || userRole === "MANAGER") && (
                        <button
                          onClick={() => setSelectedQrHall(hall)}
                          className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[10px] font-bold transition-all cursor-pointer border border-blue-200"
                          title="QR-Code für Ein- & Ausgang anzeigen"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>QR-Code</span>
                        </button>
                      )}
                      {userRole === "ADMIN" && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingHall(hall);
                              setEditHallName(hall.name);
                              setEditHallWhId(hall.warehouseId);
                              setEditHallCapacity(String(hall.capacity || 100));
                              setEditHallColor(hall.color || "#1d4ed8");
                              setEditModalOpen(true);
                            }}
                            className="p-1 text-on-surface-variant hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            title="Edit Hall"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(hall.id)}
                            className="p-1 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded transition-colors cursor-pointer"
                            title="Delete Hall"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-body-lg text-on-surface mb-0.5">{hall.name}</h4>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickColorHall(hall);
                        setQuickColorHex(hall.color || "#1d4ed8");
                        setQuickColorModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border transition-all hover:scale-105 cursor-pointer shadow-2xs shrink-0"
                      style={{
                        backgroundColor: `${hallColor}15`,
                        color: hallColor,
                        borderColor: `${hallColor}40`,
                      }}
                      title="Klicken, um Farbe anzupassen"
                    >
                      <span className="w-2.5 h-2.5 rounded-full shadow-2xs" style={{ backgroundColor: hallColor }}></span>
                      <span>{hallColor}</span>
                      <Palette className="w-3 h-3 opacity-70 ml-0.5" />
                    </button>
                  </div>
                  <p className="text-outline text-[12px] flex items-center gap-1 mb-4 font-semibold uppercase tracking-wider">
                    <WarehouseIcon className="w-3.5 h-3.5" />
                    {hall.warehouse?.name || "Duisburg Port Hub"}
                  </p>

                  {/* Hall Details */}
                  <div className="grid grid-cols-2 gap-4 py-3 border-y border-outline-variant mb-4 text-xs font-semibold">
                    <div>
                      <span className="text-[10px] text-outline uppercase tracking-wider block">Assigned Staff</span>
                      <span className="font-mono text-body-md text-on-surface flex items-center gap-1.5 mt-1">
                        <Users className="w-3.5 h-3.5 text-secondary" />
                        {users.length} Active
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline uppercase tracking-wider block">Containers</span>
                      <span className="font-mono text-body-md text-on-surface flex items-center gap-1.5 mt-1">
                        <Layers className="w-3.5 h-3.5 text-secondary" />
                        {containers.length} Cargo
                      </span>
                    </div>
                  </div>
                </div>

                {/* Staging level */}
                <div className="space-y-1 mt-2">
                  <div className="flex justify-between items-center text-[11px] font-semibold text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <Percent className="w-3.5 h-3.5 text-outline" /> Occupancy Level
                    </span>
                    <span className="font-mono">{containers.length} / {capacity} Units</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        occupancyPct > 85
                          ? "bg-error"
                          : occupancyPct > 60
                          ? "bg-amber-500"
                          : "bg-secondary"
                      }`}
                      style={{ width: `${Math.min(occupancyPct, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal - Create Hall */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-md w-full p-stack-md shadow-2xl relative animate-scaleIn">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-body-lg text-on-surface mb-1">Configure Hall Staging Sector</h3>
            <p className="text-on-surface-variant text-xs mb-4">
              Add a new staging sector to an operational warehouse facility.
            </p>

            <form onSubmit={handleCreateHall} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                  Staging Sector Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hall C - Cold Storage"
                  value={newHallName}
                  onChange={(e) => setNewHallName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                  Assign Warehouse Location
                </label>
                <select
                  value={newHallWhId}
                  onChange={(e) => setNewHallWhId(e.target.value)}
                  className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low font-medium cursor-pointer"
                  required
                >
                  <option value="" disabled>Select Depot...</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                  Maximum Container Capacity
                </label>
                <input
                  type="number"
                  placeholder="100"
                  min="10"
                  value={newHallCapacity}
                  onChange={(e) => setNewHallCapacity(e.target.value)}
                  className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low"
                  required
                />
              </div>

              <HallColorPicker
                color={newHallColor}
                onChange={setNewHallColor}
                label="Hallen-Farbsystem & Customizing"
              />

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
                  {createLoading ? "Saving..." : "Configure Sector"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Edit Hall */}
      {editModalOpen && editingHall && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-md w-full p-stack-md shadow-2xl relative animate-scaleIn">
            <button
              onClick={() => {
                setEditModalOpen(false);
                setEditingHall(null);
              }}
              className="absolute top-4 right-4 p-1 rounded-full text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-body-lg text-on-surface mb-1">Edit Hall Staging Sector</h3>
            <p className="text-on-surface-variant text-xs mb-4">
              Update staging sector configurations and custom color assignment.
            </p>

            <form onSubmit={handleEditHall} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                  Staging Sector Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hall C - Cold Storage"
                  value={editHallName}
                  onChange={(e) => setEditHallName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                  Assign Warehouse Location
                </label>
                <select
                  value={editHallWhId}
                  onChange={(e) => setEditHallWhId(e.target.value)}
                  className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low font-medium cursor-pointer"
                  required
                >
                  <option value="" disabled>Select Depot...</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                  Maximum Container Capacity
                </label>
                <input
                  type="number"
                  placeholder="100"
                  min="10"
                  value={editHallCapacity}
                  onChange={(e) => setEditHallCapacity(e.target.value)}
                  className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low"
                  required
                />
              </div>

              <HallColorPicker
                color={editHallColor}
                onChange={setEditHallColor}
                label="Hallen-Farbsystem & Customizing"
              />

              {editError && (
                <div className="bg-error-container text-on-error-container px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditingHall(null);
                  }}
                  className="px-4 py-2 border border-outline-variant hover:bg-surface-container-high rounded-lg text-label-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-secondary text-white hover:bg-secondary-container rounded-lg text-label-md transition-colors font-bold disabled:opacity-50 cursor-pointer"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Confirm Delete Hall */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-sm w-full p-stack-md shadow-2xl relative">
            <h3 className="font-bold text-body-lg text-on-surface mb-2 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              Remove Staging Sector?
            </h3>
            <p className="text-on-surface-variant text-xs mb-4">
              This action soft-deactivates the staging sector. Active employees assigned to this sector will be unassigned.
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
                onClick={handleDeleteHall}
                disabled={deleteLoading}
                className="px-4 py-2 bg-error text-white hover:bg-red-700 rounded-lg text-label-md transition-colors font-bold disabled:opacity-50"
              >
                {deleteLoading ? "Processing..." : "Deactivate Sector"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Color Customizer Modal */}
      {quickColorModalOpen && quickColorHall && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-md w-full p-stack-md shadow-2xl relative animate-scaleIn">
            <button
              onClick={() => {
                setQuickColorModalOpen(false);
                setQuickColorHall(null);
              }}
              className="absolute top-4 right-4 p-1 rounded-full text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-1">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shadow-2xs"
                style={{ backgroundColor: `${quickColorHex}20`, color: quickColorHex }}
              >
                <Palette className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-body-lg text-on-surface">Farbe für Halle anpassen</h3>
                <p className="text-on-surface-variant text-xs">{quickColorHall.name}</p>
              </div>
            </div>

            <form onSubmit={handleQuickUpdateColor} className="space-y-4 mt-4">
              <HallColorPicker
                color={quickColorHex}
                onChange={setQuickColorHex}
                label="Farbe auswählen oder neu gestalten"
              />

              {quickColorError && (
                <div className="bg-error-container text-on-error-container px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{quickColorError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuickColorModalOpen(false);
                    setQuickColorHall(null);
                  }}
                  className="px-4 py-2 border border-outline-variant hover:bg-surface-container-high rounded-lg text-label-md transition-colors cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={quickColorLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-label-md transition-colors font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Palette className="w-3.5 h-3.5" />
                  {quickColorLoading ? "Wird gespeichert..." : "Farbe anwenden"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hall QR Code Modal */}
      {selectedQrHall && (
        <QRCodeModal
          isOpen={!!selectedQrHall}
          onClose={() => setSelectedQrHall(null)}
          hall={{
            id: selectedQrHall.id,
            name: selectedQrHall.name,
            warehouseId: selectedQrHall.warehouseId,
            warehouseName: selectedQrHall.warehouse?.name,
          }}
        />
      )}
    </div>
  );
}

export default function HallsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    }>
      <HallsPageContent />
    </Suspense>
  );
}
