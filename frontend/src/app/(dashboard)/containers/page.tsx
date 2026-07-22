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
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">Container Inventory</h3>
          <p className="text-slate-500 text-xs mt-1">
            Manage, list, and log shipping containers allocated to storage zones.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary py-2 px-4 text-xs cursor-pointer font-semibold uppercase tracking-wider"
        >
          <Plus className="w-3.5 h-3.5 text-white" /> Registered Container
        </button>
      </div>

      {isOffline && (
        <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-xs font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
          <span>Offline mode active. Modifying entries will happen in local state only.</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-100 p-5 rounded-xl shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search Container Number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-premium pl-9 py-2 text-xs"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 self-start md:self-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
            Status:
          </span>
          <div className="bg-slate-50 p-1 rounded-lg border border-slate-100 flex gap-1">
            {["ALL", "FULL", "EMPTY"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  statusFilter === status
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100/55"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Container Table */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3">Container Number</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Warehouse / Hall</th>
                <th className="px-4 py-3">Arrival Date</th>
                <th className="px-6 py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
              {filteredContainers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400 italic">
                    No matching shipping containers found.
                  </td>
                </tr>
              ) : (
                filteredContainers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-3.5 font-bold font-mono text-slate-800">
                      {c.containerNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`badge-premium text-[9px] py-0.5 px-2 ${
                          c.status === "FULL"
                            ? "badge-warning"
                            : "badge-neutral"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800">{c.warehouseName}</span>
                        <span className="text-[11px] text-slate-400">{c.hallName}</span>
                      </div>
                    </td>
                    <td suppressHydrationWarning className="px-4 py-3.5 font-mono text-slate-400"> {new Date(c.arrivalDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5 text-right pr-6 space-x-1.5">
                      <button
                        onClick={() => {
                          setActiveContainer(c);
                          setMoveWarehouseId(c.warehouseId);
                          setMoveHallId(c.hallId);
                          setMoveStatus(c.status);
                          setIsMoveModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer inline-flex"
                        title="Move / Edit Container"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteContainer(c.id)}
                        className="p-1.5 text-slate-400 hover:text-red-650 rounded-lg hover:bg-red-50 transition-colors cursor-pointer inline-flex"
                        title="Delete Container"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Add Container */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div className="max-w-md w-full bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
            
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-650" /> Register Shipping Container
              </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddContainer} className="p-6 space-y-4">
              {/* Container Number */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Container Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HLXU8472910"
                  value={newContainerNumber}
                  onChange={(e) => setNewContainerNumber(e.target.value)}
                  className="input-premium uppercase font-mono"
                />
              </div>

              {/* Status Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="input-premium"
                >
                  <option value="EMPTY">EMPTY</option>
                  <option value="FULL">FULL</option>
                </select>
              </div>

              {/* Warehouse Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Warehouse Location
                </label>
                <select
                  value={newWarehouseId}
                  onChange={(e) => setNewWarehouseId(e.target.value)}
                  className="input-premium"
                >
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hall Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Warehouse Hall
                </label>
                <select
                  value={newHallId}
                  onChange={(e) => setNewHallId(e.target.value)}
                  className="input-premium"
                >
                  <option value="" disabled>Select Staging Hall...</option>
                  {filteredHalls.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                  <option value="create_new" className="text-blue-600 font-bold">+ Create New Staging Hall...</option>
                </select>
              </div>

              {/* Inline Hall Creation Inputs */}
              {newHallId === "create_new" && (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3 animate-fadeIn text-xs">
                  <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block">
                    Configure Staging Hall
                  </span>
                  
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Hall Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Hall C - Cold Store"
                      value={inlineHallName}
                      onChange={(e) => setInlineHallName(e.target.value)}
                      className="input-premium bg-white"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Staging Capacity
                    </label>
                    <input
                      type="number"
                      placeholder="100"
                      min="10"
                      value={inlineHallCapacity}
                      onChange={(e) => setInlineHallCapacity(e.target.value)}
                      className="input-premium bg-white"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 -mx-6 -mb-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary py-1.5 px-4 cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newHallId}
                  className="btn-primary py-1.5 px-4 cursor-pointer text-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div className="max-w-md w-full bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-650" /> Relocate / Edit Container
              </h4>
              <button
                onClick={() => setIsMoveModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleMoveContainer} className="p-6 space-y-4">
              {/* Container Number */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Container Number
                </label>
                <input
                  type="text"
                  disabled
                  value={activeContainer.containerNumber}
                  className="input-premium font-mono uppercase cursor-not-allowed opacity-60"
                />
              </div>

              {/* Status Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Status
                </label>
                <select
                  value={moveStatus}
                  onChange={(e) => setMoveStatus(e.target.value as any)}
                  className="input-premium"
                >
                  <option value="EMPTY">EMPTY</option>
                  <option value="FULL">FULL</option>
                </select>
              </div>

              {/* Warehouse Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Destination Warehouse
                </label>
                <select
                  value={moveWarehouseId}
                  onChange={(e) => handleMoveWarehouseChange(e.target.value)}
                  className="input-premium"
                >
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hall Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Destination Hall
                </label>
                <select
                  value={moveHallId}
                  onChange={(e) => setMoveHallId(e.target.value)}
                  className="input-premium"
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

              {/* Action Buttons */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 -mx-6 -mb-6">
                <button
                  type="button"
                  onClick={() => setIsMoveModalOpen(false)}
                  className="btn-secondary py-1.5 px-4 cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !moveHallId}
                  className="btn-primary py-1.5 px-4 cursor-pointer text-xs"
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
          className={`fixed bottom-5 right-5 p-4 rounded-xl flex items-start gap-3 shadow-2xl max-w-sm z-50 animate-slideUp text-xs ${
            message.type === "success"
              ? "bg-emerald-50 border border-emerald-100 text-emerald-800"
              : "bg-red-50 border border-red-100 text-red-800"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-red-650" />
          )}
          <div>
            <p className="font-bold text-slate-800">{message.type === "success" ? "Success" : "Error Occurred"}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{message.text}</p>
          </div>
          <button
            onClick={() => setMessage({ text: "", type: "" })}
            className="text-slate-400 hover:text-slate-700 ml-auto p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
