"use client";
import { useTranslation } from "../../i18n/LanguageContext";

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
  color?: string;
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
 const { t, locale } = useTranslation();
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);

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

      if (selectedWh) {
        const updatedWh = whList.find((w: WarehouseItem) => w.id === selectedWh.id);
        if (updatedWh) setSelectedWh(updatedWh);
      }
    } catch (err) {
      console.error("Failed to load warehouses:", err);
      setWarehouses([]);
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
        throw new Error(errJson.message || t("inventory1338"));
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
      setCreateError(err.message || t("inventory1339"));
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
             {t("inventory1295")} </h2>
          <p className="text-on-surface-variant font-body-sm">
             {t("inventory1296")} </p>
        </div>
        
        <div className="flex items-center gap-2">
          {userRole === "ADMIN" && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-lg font-label-md uppercase tracking-wider flex items-center gap-2 hover:bg-neutral-800 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
               {t("inventory1297")} </button>
          )}
        </div>
      </div>



      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-stack-md bg-surface-container-low border border-outline-variant p-stack-md rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary/10 text-secondary flex items-center justify-center rounded-lg">
            <WarehouseIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold"> {t("inventory1298")} </p>
            <h4 className="text-body-lg font-black font-mono">{warehouses.length}</h4>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-outline-variant pt-3 sm:pt-0 sm:pl-6">
          <div className="w-10 h-10 bg-secondary/10 text-secondary flex items-center justify-center rounded-lg">
            <Grid className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold"> {t("inventory1299")} </p>
            <h4 className="text-body-lg font-black font-mono">{totalHallsCount}</h4>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-outline-variant pt-3 sm:pt-0 sm:pl-6">
          <div className="w-10 h-10 bg-secondary/10 text-secondary flex items-center justify-center rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold"> {t("ui308")} </p>
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
          let statusLabel = t("inventory1300");
          let badgeColor = "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400";
          
          if (utilization > 80) {
            statusLabel = t("inventory1301");
            badgeColor = "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400";
          } else if (users.length < 2 && halls.length > 0) {
            statusLabel = t("inventory1302");
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
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center transition-all duration-300 ease-in-out group-hover:scale-105 group-hover:bg-blue-100 group-hover:shadow-sm">
                    <WarehouseIcon className="w-6 h-6 text-blue-600 transition-colors" />
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
                        title={t("inventory1303")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <h4 className="font-bold text-body-lg text-on-surface group-hover:text-secondary transition-colors mb-1 flex items-center gap-1.5">
                  {wh.name}
                </h4>
                <p className="text-on-surface-variant text-[12px] flex items-center gap-1 mb-4">
                  <MapPin className="w-3.5 h-3.5" />  {t("inventory1304")} </p>

                {/* Stat Breakdown Grid */}
                <div className="grid grid-cols-2 gap-stack-md py-3 border-y border-outline-variant mb-4">
                  <div>
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-wider block"> {t("halls")} </span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">{halls.length}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-wider block"> {t("containers")} </span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">{containers.length}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-wider block"> {t("ui308")} </span>
                    <span className="font-mono text-body-lg font-bold text-on-surface">{users.length}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-wider block"> {t("inventory1305")} </span>
                    <span className="font-mono text-body-lg font-bold text-secondary">{utilization}%</span>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-3 mt-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] font-semibold text-on-surface-variant">
                    <span> {t("inventory1306")} </span>
                    <span className="font-mono">{containers.length} / {totalCapacity}  {t("inventory1307")} </span>
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
                   {t("inventory1308")} <ArrowRight className="w-4 h-4" />
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
                title={t("inventory1309")}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="font-bold text-body-lg text-on-surface">
                  {selectedWh.name}  {t("inventory1310")} </h3>
                <p className="text-on-surface-variant text-[12px]">
                   {t("inventory1311")} </p>
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
              <div className="py-stack-lg text-center text-on-surface-variant">
                <Grid className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-body-sm"> {t("inventory1312")} </p>
                {userRole === "ADMIN" && (
                  <button
                    onClick={() => router.push("/halls")}
                    className="mt-3 px-4 py-2 bg-secondary text-white rounded-lg text-label-md hover:bg-secondary-container transition-colors"
                  >
                     {t("inventory1313")} </button>
                )}
              </div>
            ) : (
              <table className="w-full text-start border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant font-label-md text-[11px] uppercase tracking-wider">
                    <th className="p-4"> {t("inventory1314")} </th>
                    <th className="p-4"> {t("statusColumn")} </th>
                    <th className="p-4"> {t("inventory1315")} </th>
                    <th className="p-4"> {t("inventory1316")} </th>
                    <th className="p-4"> {t("inventory1317")} </th>
                    <th className="p-4 text-end"> {t("actionsColumn")} </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant text-body-sm">
                  {selectedWh.halls.map((hall) => {
                    const occupancyPct = hall.capacity
                      ? Math.round((hall.containers.length / hall.capacity) * 100)
                      : 0;

                    let statusDot = "bg-green-500";
                    let statusLabel = t("active");
                    if (occupancyPct > 80) {
                      statusDot = "bg-amber-500";
                      statusLabel = t("inventory1319");
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
                          <span
                            className="w-3 h-3 rounded-full border border-black/10 shrink-0 shadow-2xs"
                            style={{ backgroundColor: hall.color || '#1d4ed8' }}
                            title={`Hall color: ${hall.color || '#1d4ed8'}`}
                          />
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
                            <span className="text-[10px] text-on-surface-variant font-mono">
                              ({hall.containers.length} / {hall.capacity || 100}  {t("inventory1321")} </span>
                          </div>
                        </td>
                        <td className="p-4 text-end">
                          <button
                            onClick={() => router.push(`/halls?warehouseId=${selectedWh.id}`)}
                            className="text-secondary hover:underline font-bold text-[12px] uppercase tracking-wider"
                          >
                             {t("inventory1322")} </button>
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
             {t("inventory1323")} </span>
          <h4 className="font-bold text-headline-md tracking-tight"> {t("inventory1324")} </h4>
          <p className="text-neutral-400 font-body-sm leading-relaxed">
             {t("inventory1325")} </p>
          <div className="pt-2">
            <button
              onClick={() => router.push("/planning")}
              className="bg-white text-primary px-5 py-2.5 rounded-lg font-label-md uppercase tracking-wider hover:bg-secondary-fixed transition-colors text-xs font-bold"
            >
               {t("inventory1326")} </button>
          </div>
        </div>
      </div>

      {/* Modal - Create Warehouse */}
      {createModalOpen && (
        <div className="responsive-modal fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-md w-full p-stack-md shadow-2xl relative">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-body-lg text-on-surface mb-1"> {t("inventory1327")} </h3>
            <p className="text-on-surface-variant text-xs mb-4">
               {t("inventory1328")} </p>

            <form onSubmit={handleCreateWarehouse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                   {t("inventory1329")} </label>
                <input
                  type="text"
                  placeholder={t("inventory1330")}
                  value={newWhName}
                  onChange={(e) => setNewWhName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low"
                  required
                />
              </div>

              {/* Initial default hall config */}
              <div className="p-4 bg-surface-container-low border border-outline-variant rounded-lg space-y-3">
                <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider block">
                   {t("inventory1331")} </span>
                
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                     {t("inventory1332")} </label>
                  <input
                    type="text"
                    placeholder={t("inventory1333")}
                    value={initialHallName}
                    onChange={(e) => setInitialHallName(e.target.value)}
                    className="w-full bg-white border border-outline-variant focus:border-secondary rounded-lg px-3 py-1.5 text-body-sm text-on-surface outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                     {t("inventory1334")} </label>
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
                   {t("ui336")} </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 bg-secondary text-white hover:bg-secondary-container rounded-lg text-label-md transition-colors font-bold disabled:opacity-50"
                >
                  {createLoading ? "Saving..." : t("inventory1335")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Confirm Deactivate */}
      {confirmDeleteId && (
        <div className="responsive-modal fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-sm w-full p-stack-md shadow-2xl relative">
            <h3 className="font-bold text-body-lg text-on-surface mb-2 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
               {t("inventory1336")} </h3>
            <p className="text-on-surface-variant text-xs mb-4">
               {t("inventory1337")} </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 border border-outline-variant hover:bg-surface-container-high rounded-lg text-label-md transition-colors"
              >
                 {t("ui336")} </button>
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
