"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit2,
  X,
  CheckCircle,
  AlertTriangle,
  Warehouse,
  Grid,
} from "lucide-react";

interface Container {
  id: string;
  containerNumber: string;
  status: "FULL" | "EMPTY";
  warehouseId: string;
  warehouseName?: string;
  hallId: string;
  hallName?: string;
  arrivalDate: string;
}

interface WarehouseData {
  id: string;
  name: string;
}

interface HallData {
  id: string;
  name: string;
  warehouseId: string;
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [halls, setHalls] = useState<HallData[]>([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Create Container Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newContainerNumber, setNewContainerNumber] = useState("");
  const [newStatus, setNewStatus] = useState<"FULL" | "EMPTY">("EMPTY");
  const [newWarehouseId, setNewWarehouseId] = useState("");
  const [newHallId, setNewHallId] = useState("");
  const [inlineHallName, setInlineHallName] = useState("");
  const [inlineHallCapacity, setInlineHallCapacity] = useState("100");

  // Relocate Container Modal state
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [activeContainer, setActiveContainer] = useState<Container | null>(null);
  const [moveWarehouseId, setMoveWarehouseId] = useState("");
  const [moveHallId, setMoveHallId] = useState("");
  const [moveStatus, setMoveStatus] = useState<"FULL" | "EMPTY">("EMPTY");

  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const router = useRouter();

  const handleMoveWarehouseChange = (whId: string) => {
    setMoveWarehouseId(whId);
    const filtered = halls.filter((h) => h.warehouseId === whId);
    if (filtered.length > 0) {
      setMoveHallId(filtered[0].id);
    } else {
      setMoveHallId("");
    }
  };

  const handleMoveContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContainer) return;

    setSubmitting(true);
    setMessage({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    if (isOffline) {
      setContainers((prev) =>
        prev.map((c) =>
          c.id === activeContainer.id
            ? {
                ...c,
                status: moveStatus,
                warehouseId: moveWarehouseId,
                warehouseName: warehouses.find((w) => w.id === moveWarehouseId)?.name || "Local WH",
                hallId: moveHallId,
                hallName: halls.find((h) => h.id === moveHallId)?.name || "Local Hall",
              }
            : c
        )
      );
      setIsMoveModalOpen(false);
      setMessage({ text: "Container relocated successfully (Offline mock).", type: "success" });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers/${activeContainer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: moveStatus,
          warehouseId: moveWarehouseId,
          hallId: moveHallId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to relocate container");
      }

      setIsMoveModalOpen(false);
      setMessage({ text: "Container updated and relocated successfully!", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to relocate container.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const loadData = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch containers
      const containerRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers`, { headers });
      const containerJson = containerRes.ok ? await containerRes.json() : null;
      const containerList = containerJson && Array.isArray(containerJson.data) ? containerJson.data : (Array.isArray(containerJson) ? containerJson : []);

      // Fetch warehouses
      const whRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, { headers });
      const whJson = whRes.ok ? await whRes.json() : null;
      const whData = whJson && Array.isArray(whJson.data) ? whJson.data : (Array.isArray(whJson) ? whJson : []);
      setWarehouses(whData);
      if (whData.length > 0) setNewWarehouseId(whData[0].id);

      // Fetch halls
      const hallRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, { headers });
      const hallJson = hallRes.ok ? await hallRes.json() : null;
      const hallData = hallJson && Array.isArray(hallJson.data) ? hallJson.data : (Array.isArray(hallJson) ? hallJson : []);
      setHalls(hallData);

      setContainers(
        containerList.map((c: any) => ({
          ...c,
          warehouseName: c.warehouse?.name || "Global Hub",
          hallName: c.hall?.name || "Main Staging",
        }))
      );
      setIsOffline(false);
    } catch (err) {
      setIsOffline(true);
      // Fallback mocks
      const mockWH = [
        { id: "wh-1", name: "Duisburg Port Hub" },
        { id: "wh-2", name: "Rhein-Ruhr Logistics" },
      ];
      const mockHalls = [
        { id: "hall-a", name: "Hall A - Cold Storage", warehouseId: "wh-1" },
        { id: "hall-b", name: "Hall B - General Cargo", warehouseId: "wh-1" },
        { id: "hall-c", name: "Hall C - Hazmat", warehouseId: "wh-2" },
      ];
      const mockContainers: Container[] = [
        {
          id: "c-1",
          containerNumber: "MSCU1284920",
          status: "FULL",
          warehouseId: "wh-1",
          warehouseName: "Duisburg Port Hub",
          hallId: "hall-a",
          hallName: "Hall A - Cold Storage",
          arrivalDate: new Date().toISOString(),
        },
        {
          id: "c-2",
          containerNumber: "HLXU8472910",
          status: "EMPTY",
          warehouseId: "wh-1",
          warehouseName: "Duisburg Port Hub",
          hallId: "hall-b",
          hallName: "Hall B - General Cargo",
          arrivalDate: new Date().toISOString(),
        },
        {
          id: "c-3",
          containerNumber: "MAEU5829104",
          status: "FULL",
          warehouseId: "wh-2",
          warehouseName: "Rhein-Ruhr Logistics",
          hallId: "hall-c",
          hallName: "Hall C - Hazmat",
          arrivalDate: new Date().toISOString(),
        },
      ];

      setWarehouses(mockWH);
      setNewWarehouseId(mockWH[0].id);
      setHalls(mockHalls);
      setContainers(mockContainers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [router]);

  // Set default hall when warehouse changes
  useEffect(() => {
    const filtered = halls.filter((h) => h.warehouseId === newWarehouseId);
    if (filtered.length > 0) {
      setNewHallId(filtered[0].id);
    } else {
      setNewHallId("");
    }
  }, [newWarehouseId, halls]);

  const handleAddContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let targetHallId = newHallId;

    if (newHallId === "create_new") {
      if (!inlineHallName.trim()) {
        setMessage({ text: "Please provide a name for the new staging hall.", type: "error" });
        setSubmitting(false);
        return;
      }

      if (isOffline) {
        const mockHallId = "mock-hall-" + Date.now();
        const newHall: HallData = {
          id: mockHallId,
          name: inlineHallName,
          warehouseId: newWarehouseId,
        };
        setHalls((prev) => [...prev, newHall]);
        targetHallId = mockHallId;
      } else {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: inlineHallName,
              warehouseId: newWarehouseId,
              capacity: parseInt(inlineHallCapacity, 10) || 100,
            }),
          });
          const hallData = await res.json();
          if (!res.ok) {
            throw new Error(hallData.message || "Failed to create inline hall");
          }
          // Add to local state
          setHalls((prev) => [...prev, {
            id: hallData.id,
            name: hallData.name,
            warehouseId: hallData.warehouseId,
          }]);
          targetHallId = hallData.id;
        } catch (err: any) {
          setMessage({ text: err.message || "Failed to configure inline staging hall.", type: "error" });
          setSubmitting(false);
          return;
        }
      }
    }

    if (!targetHallId) {
      setMessage({ text: "Please select or configure a staging hall.", type: "error" });
      setSubmitting(false);
      return;
    }

    if (isOffline) {
      // Mock insert
      const newC: Container = {
        id: "mock-" + Date.now(),
        containerNumber: newContainerNumber.toUpperCase(),
        status: newStatus,
        warehouseId: newWarehouseId,
        warehouseName: warehouses.find((w) => w.id === newWarehouseId)?.name || "Local WH",
        hallId: targetHallId,
        hallName: inlineHallName || halls.find((h) => h.id === targetHallId)?.name || "Local Hall",
        arrivalDate: new Date().toISOString(),
      };
      setContainers((prev) => [newC, ...prev]);
      setIsModalOpen(false);
      setNewContainerNumber("");
      setInlineHallName("");
      setMessage({ text: "Container added (Offline mock).", type: "success" });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          containerNumber: newContainerNumber.toUpperCase(),
          status: newStatus,
          warehouseId: newWarehouseId,
          hallId: targetHallId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to add container");
      }

      setIsModalOpen(false);
      setNewContainerNumber("");
      setInlineHallName("");
      setMessage({ text: "Container registered successfully!", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to add container.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteContainer = async (id: string) => {
    if (!confirm("Are you sure you want to remove this container?")) return;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    if (isOffline) {
      setContainers((prev) => prev.filter((c) => c.id !== id));
      setMessage({ text: "Container removed (Offline mock).", type: "success" });
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete container");
      }

      setMessage({ text: "Container deleted successfully.", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to delete container.", type: "error" });
    }
  };

  // Filter container list
  const filteredContainers = containers.filter((c) => {
    const matchesSearch = c.containerNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredHalls = halls.filter((h) => h.warehouseId === newWarehouseId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-stack-lg animate-fadeIn">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-headline-lg font-bold text-on-surface">Container Inventory</h3>
          <p className="text-on-surface-variant font-body-sm">
            Manage, list, and log shipping containers allocated to storage zones.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-secondary hover:bg-secondary/90 text-white font-bold px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-5 h-5" /> Registered Container
        </button>
      </div>

      {isOffline && (
        <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-2.5 rounded-lg flex items-center gap-2 text-label-md">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline mode active. Modifying entries will happen in local state only.</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm flex flex-col md:flex-row gap-stack-md items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input
            type="text"
            placeholder="Search Container Number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm text-on-surface outline-none focus:ring-1 focus:ring-secondary focus:border-transparent"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Filter className="w-4 h-4 text-outline" />
          <span className="text-label-md text-outline font-bold uppercase tracking-wider text-[10px]">
            Status:
          </span>
          <div className="bg-surface-container-low p-1 rounded-lg border border-outline-variant flex gap-1">
            {["ALL", "FULL", "EMPTY"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 text-label-md rounded font-semibold transition-all ${
                  statusFilter === status
                    ? "bg-secondary text-white shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Container Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider">
              <th className="px-container-margin py-3">Container Number</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Warehouse / Hall</th>
              <th className="px-4 py-3">Arrival Date</th>
              <th className="px-container-margin py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
            {filteredContainers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-outline font-medium">
                  No matching shipping containers found.
                </td>
              </tr>
            ) : (
              filteredContainers.map((c) => (
                <tr key={c.id} className="hover:bg-surface-bright transition-colors">
                  <td className="px-container-margin py-3.5 font-bold font-mono text-on-surface">
                    {c.containerNumber}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                        c.status === "FULL"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col">
                      <span className="font-semibold text-on-surface">{c.warehouseName}</span>
                      <span className="text-[12px] text-outline">{c.hallName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[12px] text-outline">
                    {new Date(c.arrivalDate).toLocaleDateString()}
                  </td>
                  <td className="px-container-margin py-3.5 text-right space-x-1.5">
                    <button
                      onClick={() => {
                        setActiveContainer(c);
                        setMoveWarehouseId(c.warehouseId);
                        setMoveHallId(c.hallId);
                        setMoveStatus(c.status);
                        setIsMoveModalOpen(true);
                      }}
                      className="text-outline hover:text-secondary p-1.5 rounded hover:bg-surface-container-low transition-colors inline-flex"
                      title="Move / Edit Container"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteContainer(c.id)}
                      className="text-outline hover:text-error p-1.5 rounded hover:bg-error-container transition-colors inline-flex"
                      title="Delete Container"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal - Add Container */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="max-w-md w-full bg-white border border-outline-variant rounded-xl shadow-xl p-6 relative animate-zoomIn">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-outline hover:bg-surface-container-low rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="font-headline-md font-bold text-on-surface flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-secondary" /> Register Shipping Container
            </h4>

            <form onSubmit={handleAddContainer} className="space-y-4">
              {/* Container Number */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Container Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HLXU8472910"
                  value={newContainerNumber}
                  onChange={(e) => setNewContainerNumber(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant focus:border-secondary rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none uppercase font-mono"
                />
              </div>

              {/* Status Select */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full bg-surface-container-low border border-outline-variant focus:border-secondary rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
                >
                  <option value="EMPTY">EMPTY</option>
                  <option value="FULL">FULL</option>
                </select>
              </div>

              {/* Warehouse Select */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Warehouse Location
                </label>
                <div className="relative">
                  <Warehouse className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <select
                    value={newWarehouseId}
                    onChange={(e) => setNewWarehouseId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant focus:border-secondary rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Hall Select */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Warehouse Hall
                </label>
                <div className="relative">
                  <Grid className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <select
                    value={newHallId}
                    onChange={(e) => setNewHallId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant focus:border-secondary rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
                  >
                    <option value="" disabled>Select Staging Hall...</option>
                    {filteredHalls.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                    <option value="create_new" className="text-secondary font-bold">+ Create New Staging Hall...</option>
                  </select>
                </div>
              </div>

              {/* Inline Hall Creation Inputs */}
              {newHallId === "create_new" && (
                <div className="p-4 bg-surface-container-low border border-secondary/35 rounded-lg space-y-3 animate-fadeIn">
                  <span className="text-[10px] text-secondary font-bold uppercase tracking-wider block">
                    Configure Staging Hall
                  </span>
                  
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      Hall Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Hall C - Cold Store"
                      value={inlineHallName}
                      onChange={(e) => setInlineHallName(e.target.value)}
                      className="w-full bg-white border border-outline-variant focus:border-secondary rounded-lg px-3 py-1.5 text-body-sm text-on-surface outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      Staging Capacity
                    </label>
                    <input
                      type="number"
                      placeholder="100"
                      min="10"
                      value={inlineHallCapacity}
                      onChange={(e) => setInlineHallCapacity(e.target.value)}
                      className="w-full bg-white border border-outline-variant focus:border-secondary rounded-lg px-3 py-1.5 text-body-sm text-on-surface outline-none"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newHallId}
                  className="bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  {submitting ? "Saving..." : "Add Container"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Relocate Container */}
      {isMoveModalOpen && activeContainer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="max-w-md w-full bg-white border border-outline-variant rounded-xl shadow-xl p-6 relative animate-zoomIn">
            <button
              onClick={() => setIsMoveModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-outline hover:bg-surface-container-low rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="font-headline-md font-bold text-on-surface flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-secondary" /> Relocate / Edit Container
            </h4>

            <form onSubmit={handleMoveContainer} className="space-y-4">
              {/* Container Number */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Container Number
                </label>
                <input
                  type="text"
                  disabled
                  value={activeContainer.containerNumber}
                  className="w-full bg-surface-container-low/50 border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-outline outline-none font-mono uppercase cursor-not-allowed"
                />
              </div>

              {/* Status Select */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Status
                </label>
                <select
                  value={moveStatus}
                  onChange={(e) => setMoveStatus(e.target.value as any)}
                  className="w-full bg-surface-container-low border border-outline-variant focus:border-secondary rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
                >
                  <option value="EMPTY">EMPTY</option>
                  <option value="FULL">FULL</option>
                </select>
              </div>

              {/* Warehouse Select */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Destination Warehouse
                </label>
                <div className="relative">
                  <Warehouse className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <select
                    value={moveWarehouseId}
                    onChange={(e) => handleMoveWarehouseChange(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant focus:border-secondary rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Hall Select */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                  Destination Hall
                </label>
                <div className="relative">
                  <Grid className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <select
                    value={moveHallId}
                    onChange={(e) => setMoveHallId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant focus:border-secondary rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface outline-none appearance-none"
                  >
                    {halls
                      .filter((h) => h.warehouseId === moveWarehouseId)
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setIsMoveModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !moveHallId}
                  className="bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  {submitting ? "Saving..." : "Confirm Move"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
