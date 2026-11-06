"use client";
import { useTranslation } from "../../i18n/LanguageContext";

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
  History,
  Clock,
  User,
} from "lucide-react";
import CustomAlertModal, { CustomAlertOptions } from "../../components/CustomAlertModal";

interface EmployeeRef {
  employee: {
    id: string;
    name: string;
    role: string;
  };
}

interface Container {
  id: string;
  containerNumber: string;
  status: "FULL" | "EMPTY";
  warehouseId: string;
  warehouseName?: string;
  hallId: string;
  hallName?: string;
  arrivalDate: string;
  workedHours: number;
  notes?: string;
  employees?: EmployeeRef[];
  createdBy?: { name: string };
  updatedBy?: { name: string };
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

interface EmployeeData {
  id: string;
  name: string;
  role: string;
}

export default function ContainersPage() {
 const { t, locale } = useTranslation();
  const [containers, setContainers] = useState<Container[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [halls, setHalls] = useState<HallData[]>([]);
  const [employeesList, setEmployeesList] = useState<EmployeeData[]>([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Create Container Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newContainerNumber, setNewContainerNumber] = useState("");
  const [newStatus, setNewStatus] = useState<"FULL" | "EMPTY">("EMPTY");
  const [newWarehouseId, setNewWarehouseId] = useState("");
  const [newHallId, setNewHallId] = useState("");
  const [newWorkedHours, setNewWorkedHours] = useState<number>(0);
  const [newNotes, setNewNotes] = useState("");
  const [newAssignedEmployeeIds, setNewAssignedEmployeeIds] = useState<string[]>([]);
  const [inlineHallName, setInlineHallName] = useState("");
  const [inlineHallCapacity, setInlineHallCapacity] = useState("100");

  // Relocate/Edit Container Modal state
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [activeContainer, setActiveContainer] = useState<Container | null>(null);
  const [moveContainerNumber, setMoveContainerNumber] = useState("");
  const [moveWarehouseId, setMoveWarehouseId] = useState("");
  const [moveHallId, setMoveHallId] = useState("");
  const [moveStatus, setMoveStatus] = useState<"FULL" | "EMPTY">("EMPTY");
  const [moveWorkedHours, setMoveWorkedHours] = useState<number>(0);
  const [moveNotes, setMoveNotes] = useState("");
  const [moveAssignedEmployeeIds, setMoveAssignedEmployeeIds] = useState<string[]>([]);

  // Audit Logs / History modal state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);


  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [alertConfig, setAlertConfig] = useState<CustomAlertOptions>({
    isOpen: false,
    message: "",
  });

  const showAlert = (options: Omit<CustomAlertOptions, "isOpen">) => {
    setAlertConfig({ ...options, isOpen: true });
  };
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

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers/${activeContainer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          containerNumber: moveContainerNumber.toUpperCase(),
          status: moveStatus,
          warehouseId: moveWarehouseId,
          hallId: moveHallId,
          workedHours: Number(moveWorkedHours),
          notes: moveNotes,
          assignedEmployeeIds: moveAssignedEmployeeIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t("inventory1411"));
      }

      setIsMoveModalOpen(false);
      setMessage({ text: t("inventory1412"), type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || t("inventory1413"), type: "error" });
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

      // Fetch active employees for assignment (limit=10000)
      const empRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees?limit=10000`, { headers });
      const empJson = empRes.ok ? await empRes.json() : null;
      const empData = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
      setEmployeesList(empData.filter((u: any) => u.role !== "ADMIN"));

      setContainers(
        containerList.map((c: any) => ({
          ...c,
          warehouseName: c.warehouse?.name || "Global Hub",
          hallName: c.hall?.name || "Main Staging",
        }))
      );
    } catch (err) {
      console.error("Failed to load containers data:", err);
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
        setMessage({ text: t("inventory1414"), type: "error" });
        setSubmitting(false);
        return;
      }

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
        setHalls((prev) => [...prev, {
          id: hallData.id,
          name: hallData.name,
          warehouseId: hallData.warehouseId,
        }]);
        targetHallId = hallData.id;
      } catch (err: any) {
        setMessage({ text: err.message || t("inventory1378"), type: "error" });
        setSubmitting(false);
        return;
      }
    }


    if (!targetHallId) {
      setMessage({ text: t("inventory1415"), type: "error" });
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
          workedHours: Number(newWorkedHours),
          notes: newNotes,
          assignedEmployeeIds: newAssignedEmployeeIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t("inventory1416"));
      }

      setIsModalOpen(false);
      resetAddForm();
      setMessage({ text: t("inventory1417"), type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || t("inventory1418"), type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const resetAddForm = () => {
    setNewContainerNumber("");
    setNewStatus("EMPTY");
    setNewWorkedHours(0);
    setNewNotes("");
    setNewAssignedEmployeeIds([]);
    setInlineHallName("");
  };

  const handleDeleteContainer = (id: string) => {
    showAlert({
      title: t("inventory1419"),
      message: t("inventory1420"),
      type: "warning",
      confirmText: t("deleteEntry"),
      cancelText: t("ui336"),
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        if (!token) return;

        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || t("inventory1421"));
          }

          setMessage({ text: t("inventory1422"), type: "success" });
          loadData();
        } catch (err: any) {
          setMessage({ text: err.message || t("inventory1423"), type: "error" });
        }
      },
    });
  };

  // Fetch Container History / Audit Log
  const handleViewHistory = async (container: Container) => {
    setActiveContainer(container);
    setIsHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryLogs([]);

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setHistoryLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/containers/${container.id}/history`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        const logs = await res.json();
        setHistoryLogs(logs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleNewEmployeeSelection = (empId: string) => {
    setNewAssignedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const toggleMoveEmployeeSelection = (empId: string) => {
    setMoveAssignedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
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
    <div className="space-y-6 animate-fadeIn text-[#0f172a]">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-2xl font-extrabold text-slate-800 tracking-tight"> {t("inventory1381")} </h3>
          <p className="text-slate-600 text-xs mt-1">
             {t("inventory1382")} </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1d4ed8] hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />  {t("inventory1383")} </button>
      </div>



      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-100 p-5 rounded-xl shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            placeholder={t("inventory1384")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 transition-colors"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 self-start md:self-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-slate-600 font-bold uppercase tracking-wider text-[10px]">
             {t("timesheet1208")} </span>
          <div className="bg-slate-50 p-1 rounded-lg border border-slate-100 flex gap-1">
            {["ALL", "FULL", "EMPTY"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  statusFilter === status
                    ? "bg-[#1d4ed8] text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100/55"
                }`}
              >
                {status === "ALL" ? t("filterAll") : status === "FULL" ? t("inventory1386") : t("inventory1387")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Container Table */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-6 py-3"> {t("inventory1388")} </th>
                <th className="px-4 py-3"> {t("statusColumn")} </th>
                <th className="px-4 py-3"> {t("inventory1389")} </th>
                <th className="px-4 py-3"> {t("inventory1390")} </th>
                <th className="px-6 py-3 text-end pr-6"> {t("actionsColumn")} </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
              {filteredContainers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-600 italic">
                     {t("inventory1391")} </td>
                </tr>
              ) : (
                filteredContainers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-3.5 font-bold font-mono text-slate-800">
                      {c.containerNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          c.status === "FULL"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {c.status === "FULL" ? t("inventory1386") : t("inventory1387")}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-850">{c.warehouseName}</span>
                        <span className="text-[10px] text-slate-600">{c.hallName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 space-y-1">
                      <div className="flex items-center gap-1 text-slate-700 font-bold">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <span>{c.workedHours || 0}  {t("ui358")} </span>
                      </div>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {!c.employees || c.employees.length === 0 ? (
                          <span className="text-[10px] text-slate-600"> {t("inventory1392")} </span>
                        ) : (
                          c.employees.map((ref) => (
                            <span key={ref.employee.id} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px]">
                              {ref.employee.name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-end pr-6 space-x-1.5">
                      <button
                        onClick={() => handleViewHistory(c)}
                        className="p-1.5 text-slate-600 hover:text-blue-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer inline-flex"
                        title={t("inventory1393")}
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setActiveContainer(c);
                          setMoveContainerNumber(c.containerNumber);
                          setMoveWarehouseId(c.warehouseId);
                          setMoveHallId(c.hallId);
                          setMoveStatus(c.status);
                          setMoveWorkedHours(c.workedHours || 0);
                          setMoveNotes(c.notes || "");
                          setMoveAssignedEmployeeIds((c.employees || []).map((e) => e.employee.id));
                          setIsMoveModalOpen(true);
                        }}
                        className="p-1.5 text-slate-600 hover:text-blue-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer inline-flex"
                        title={t("inventory1394")}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteContainer(c.id)}
                        className="p-1.5 text-slate-600 hover:text-red-650 rounded-lg hover:bg-red-50 transition-colors cursor-pointer inline-flex"
                        title={t("deleteEntry")}
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
        <div className="responsive-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div className="max-w-md w-full bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />  {t("inventory1395")} </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-600 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddContainer} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Container Number */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1388")} </label>
                <input
                  type="text"
                  required
                  placeholder="z.B. MSCU1284920"
                  value={newContainerNumber}
                  onChange={(e) => setNewContainerNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none uppercase font-mono"
                />
              </div>

              {/* Status Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("statusColumn")} </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none"
                >
                  <option value="EMPTY">{t("inventory1387")}</option>
                  <option value="FULL">{t("inventory1386")}</option>
                </select>
              </div>

              {/* Worked Hours */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1396")} </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={newWorkedHours}
                  onChange={(e) => setNewWorkedHours(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none font-mono"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1398")} </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder={t("inventory1399")}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none resize-none"
                />
              </div>

              {/* Employee Assignment checkboxes */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1400")} </label>
                <div className="max-h-28 overflow-y-auto border border-slate-100 rounded-lg p-2 divide-y divide-slate-50 bg-slate-50/50">
                  {employeesList.map((emp) => (
                    <label key={emp.id} className="flex items-center gap-2 py-1.5 px-1 cursor-pointer hover:bg-slate-100 rounded">
                      <input
                        type="checkbox"
                        checked={newAssignedEmployeeIds.includes(emp.id)}
                        onChange={() => toggleNewEmployeeSelection(emp.id)}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span className="text-[11px] font-bold text-slate-700">{emp.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Warehouse Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("warehouse")} </label>
                <select
                  value={newWarehouseId}
                  onChange={(e) => setNewWarehouseId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none"
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
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("planning716")} </label>
                <select
                  value={newHallId}
                  onChange={(e) => setNewHallId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none"
                >
                  <option value="" disabled> {t("inventory1401")} </option>
                  {filteredHalls.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                  <option value="create_new" className="text-blue-600 font-bold"> {t("inventory1402")} </option>
                </select>
              </div>

              {/* Inline Hall Form */}
              {newHallId === "create_new" && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-2 text-xs">
                  <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block"> {t("inventory1403")} </span>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-600 uppercase"> {t("inventory1332")} </label>
                    <input
                      type="text"
                      placeholder="z.B. Halle D"
                      value={inlineHallName}
                      onChange={(e) => setInlineHallName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-600 uppercase"> {t("inventory1404")} </label>
                    <input
                      type="number"
                      placeholder="100"
                      value={inlineHallCapacity}
                      onChange={(e) => setInlineHallCapacity(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs outline-none font-mono"
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
                  className="bg-slate-200 hover:bg-slate-350 text-slate-700 text-xs font-bold py-1.5 px-4 rounded-lg cursor-pointer transition-colors"
                >
                   {t("ui336")} </button>
                <button
                  type="submit"
                  disabled={submitting || !newHallId || !newContainerNumber}
                  className="bg-[#1d4ed8] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold py-1.5 px-4 rounded-lg cursor-pointer transition-colors"
                >
                  {submitting ? "Speichert..." : t("planning731")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Relocate / Edit Container */}
      {isMoveModalOpen && activeContainer && (
        <div className="responsive-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div className="max-w-md w-full bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-650" />  {t("inventory1405")} </h4>
              <button
                onClick={() => setIsMoveModalOpen(false)}
                className="text-slate-600 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleMoveContainer} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Containernummer */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1388")} </label>
                <input
                  type="text"
                  required
                  value={moveContainerNumber}
                  onChange={(e) => setMoveContainerNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none uppercase font-mono"
                />
              </div>

              {/* Status Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("statusColumn")} </label>
                <select
                  value={moveStatus}
                  onChange={(e) => setMoveStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none"
                >
                  <option value="EMPTY">{t("inventory1387")}</option>
                  <option value="FULL">{t("inventory1386")}</option>
                </select>
              </div>

              {/* Worked Hours */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1397")} </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={moveWorkedHours}
                  onChange={(e) => setMoveWorkedHours(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none font-mono"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1398")} </label>
                <textarea
                  value={moveNotes}
                  onChange={(e) => setMoveNotes(e.target.value)}
                  placeholder="Bearbeitungsinformationen..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none resize-none"
                />
              </div>

              {/* Employee Assignment checkboxes */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1400")} </label>
                <div className="max-h-28 overflow-y-auto border border-slate-100 rounded-lg p-2 divide-y divide-slate-50 bg-slate-50/50">
                  {employeesList.map((emp) => (
                    <label key={emp.id} className="flex items-center gap-2 py-1.5 px-1 cursor-pointer hover:bg-slate-100 rounded">
                      <input
                        type="checkbox"
                        checked={moveAssignedEmployeeIds.includes(emp.id)}
                        onChange={() => toggleMoveEmployeeSelection(emp.id)}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span className="text-[11px] font-bold text-slate-700">{emp.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Warehouse Select */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1406")} </label>
                <select
                  value={moveWarehouseId}
                  onChange={(e) => handleMoveWarehouseChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none"
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
                <label className="block font-semibold text-slate-600 uppercase tracking-widest text-[10px]">
                   {t("inventory1407")} </label>
                <select
                  value={moveHallId}
                  onChange={(e) => setMoveHallId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none"
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
                  className="bg-slate-200 hover:bg-slate-350 text-slate-700 text-xs font-bold py-1.5 px-4 rounded-lg cursor-pointer transition-colors"
                >
                   {t("ui336")} </button>
                <button
                  type="submit"
                  disabled={submitting || !moveHallId || !moveContainerNumber}
                  className="bg-[#1d4ed8] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold py-1.5 px-4 rounded-lg cursor-pointer transition-colors"
                >
                  {submitting ? "Speichert..." : t("apply")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sidebar / Modal - View Audit Trail History */}
      {isHistoryOpen && activeContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-100 flex flex-col animate-slideLeft">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h4 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <History className="w-4.5 h-4.5 text-blue-600" />  {t("inventory1408")} </h4>
                <p className="text-[10px] text-slate-600 font-bold font-mono mt-0.5 uppercase">
                  {activeContainer.containerNumber}
                </p>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="text-slate-600 hover:text-slate-700 p-1.5 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center h-48 space-y-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="text-xs text-slate-600 font-bold"> {t("inventory1409")} </span>
                </div>
              ) : historyLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-xs italic">
                   {t("inventory1410")} </div>
              ) : (
                <div className="relative border-l border-slate-200 pl-4 space-y-4 py-2">
                  {historyLogs.map((log) => (
                    <div key={log.id} className="relative text-xs">
                      {/* Circle dot on list */}
                      <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-600 border border-white" />
                      
                      <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg space-y-1">
                        <div className="flex items-center justify-between text-[9px] text-slate-600 font-bold">
                          <span>
                            {new Date(log.timestamp).toLocaleDateString(locale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="flex items-center gap-0.5 text-slate-600">
                            <User className="w-2.5 h-2.5" />
                            {log.user?.name || t("ui367")}
                          </span>
                        </div>
                        <p className="font-bold text-slate-750">{log.action.replace("_", " ")}</p>
                        <p className="text-[11px] text-slate-600 leading-normal">{log.details}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="w-full bg-[#1d4ed8] hover:bg-blue-750 text-white font-bold text-xs py-2 rounded-lg cursor-pointer"
              >
                 {t("close")} </button>
            </div>
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
            <p className="font-bold text-slate-800">{message.type === "success" ? t("success") : "Fehler aufgetreten"}</p>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{message.text}</p>
          </div>
          <button
            onClick={() => setMessage({ text: "", type: "" })}
            className="text-slate-600 hover:text-slate-700 ml-auto p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Custom Popup Alert Modal */}
      <CustomAlertModal
        {...alertConfig}
        onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
