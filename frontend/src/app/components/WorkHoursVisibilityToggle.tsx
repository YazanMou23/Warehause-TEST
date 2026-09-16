"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Users,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

interface EmployeeVisibilityItem {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  hideWorkHours: boolean;
  warehouseName: string | null;
  hallName: string | null;
}

interface WorkHoursVisibilityToggleProps {
  variant?: "badge" | "card";
  onVisibilityChange?: (isGlobalHidden: boolean) => void;
  className?: string;
}

export const WORK_HOURS_VISIBILITY_EVENT = "work-hours-visibility-changed";

export default function WorkHoursVisibilityToggle({
  variant = "badge",
  onVisibilityChange,
  className = "",
}: WorkHoursVisibilityToggleProps) {
  const { t, language } = useTranslation();

  // State
  const [isGlobalHidden, setIsGlobalHidden] = useState<boolean>(false);
  const [employees, setEmployees] = useState<EmployeeVisibilityItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [loadingEmployees, setLoadingEmployees] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<"all" | "visible" | "hidden">("all");
  const [togglingEmployeeId, setTogglingEmployeeId] = useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Fetch employees list + global visibility
  const fetchEmployeesData = useCallback(async (isInitial = false) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setLoadingInitial(false);
      return;
    }

    if (isInitial) setLoadingInitial(true);
    else setLoadingEmployees(true);

    try {
      const res = await fetch(`${getApiUrl()}/settings/work-hours-visibility/employees`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setIsGlobalHidden(Boolean(data.isGlobalHidden));
        setEmployees(Array.isArray(data.employees) ? data.employees : []);
        onVisibilityChange?.(Boolean(data.isGlobalHidden));
      } else {
        // Fallback to basic global setting if /employees endpoint is restricted
        const fallbackRes = await fetch(`${getApiUrl()}/settings/work-hours-visibility`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fallbackRes.ok) {
          const fbData = await fallbackRes.json();
          setIsGlobalHidden(Boolean(fbData.isGlobalHidden));
          onVisibilityChange?.(Boolean(fbData.isGlobalHidden));
        }
      }
    } catch (e) {
      console.warn("Could not fetch work hours visibility details", e);
    } finally {
      setLoadingInitial(false);
      setLoadingEmployees(false);
    }
  }, [onVisibilityChange]);

  // Initial load and Real-time SSE listener
  useEffect(() => {
    fetchEmployeesData(true);

    // Connect to Server-Sent Events (SSE) for real-time push updates
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const url = `${getApiUrl()}/settings/work-hours-visibility/events${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!payload || payload.type === "ping") return;

        if (payload.type === "work_hours_visibility.employee_changed") {
          const { employeeId, hideWorkHours } = payload;
          setEmployees((prev) =>
            prev.map((emp) =>
              emp.id === employeeId ? { ...emp, hideWorkHours: Boolean(hideWorkHours) } : emp
            )
          );
        } else if (payload.type === "work_hours_visibility.bulk_changed") {
          const { employeeIds, hideWorkHours } = payload;
          setEmployees((prev) =>
            prev.map((emp) => {
              if (!employeeIds || employeeIds.length === 0 || employeeIds.includes(emp.id)) {
                return { ...emp, hideWorkHours: Boolean(hideWorkHours) };
              }
              return emp;
            })
          );
        } else if (payload.type === "work_hours_visibility.global_changed") {
          setIsGlobalHidden(Boolean(payload.isGlobalHidden));
          onVisibilityChange?.(Boolean(payload.isGlobalHidden));
        }
      } catch (err) {
        // Ignore unparseable frames
      }
    };

    es.onerror = () => {
      // Browser EventSource automatically attempts reconnection
    };

    // Listen to local tab sync events
    const handleSync = (e: CustomEvent<{ isGlobalHidden?: boolean; employeeId?: string; hideWorkHours?: boolean }>) => {
      if (typeof e.detail?.isGlobalHidden === "boolean") {
        setIsGlobalHidden(e.detail.isGlobalHidden);
      }
      if (e.detail?.employeeId && typeof e.detail.hideWorkHours === "boolean") {
        setEmployees((prev) =>
          prev.map((emp) =>
            emp.id === e.detail.employeeId ? { ...emp, hideWorkHours: e.detail.hideWorkHours! } : emp
          )
        );
      }
    };

    window.addEventListener(WORK_HOURS_VISIBILITY_EVENT as any, handleSync as any);

    return () => {
      es.close();
      window.removeEventListener(WORK_HOURS_VISIBILITY_EVENT as any, handleSync as any);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [fetchEmployeesData, onVisibilityChange]);

  // Toggle single employee visibility (1-Click)
  const handleToggleSingleEmployee = async (employee: EmployeeVisibilityItem) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token || togglingEmployeeId) return;

    const nextVal = !employee.hideWorkHours;
    setTogglingEmployeeId(employee.id);

    // Optimistic UI update
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === employee.id ? { ...emp, hideWorkHours: nextVal } : emp))
    );

    try {
      const res = await fetch(`${getApiUrl()}/settings/work-hours-visibility/employee/${employee.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hideWorkHours: nextVal }),
      });

      if (res.ok) {
        const msg = nextVal
          ? (language === "de"
              ? `Arbeitszeiten für ${employee.name} ausgeblendet.`
              : `Work hours hidden for ${employee.name}.`)
          : (language === "de"
              ? `Arbeitszeiten für ${employee.name} sichtbar geschaltet.`
              : `Work hours visible for ${employee.name}.`);
        showToast(msg);

        // Broadcast to other tabs/components
        window.dispatchEvent(
          new CustomEvent(WORK_HOURS_VISIBILITY_EVENT, {
            detail: { employeeId: employee.id, hideWorkHours: nextVal },
          })
        );
      } else {
        // Rollback optimistic update on error
        setEmployees((prev) =>
          prev.map((emp) => (emp.id === employee.id ? { ...emp, hideWorkHours: !nextVal } : emp))
        );
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Fehler beim Umschalten der Sichtbarkeit.");
      }
    } catch (e) {
      console.error("Failed to toggle employee visibility:", e);
      // Rollback
      setEmployees((prev) =>
        prev.map((emp) => (emp.id === employee.id ? { ...emp, hideWorkHours: !nextVal } : emp))
      );
      alert("Verbindungsfehler beim Ändern der Sichtbarkeit.");
    } finally {
      setTogglingEmployeeId(null);
    }
  };

  // Bulk action: hide all or show all employees
  const handleBulkAction = async (hide: boolean) => {
    const confirmText = hide ? t("confirmHideAll") : t("confirmShowAll");
    if (!window.confirm(confirmText)) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token || bulkActionLoading) return;

    setBulkActionLoading(true);

    // Optimistic UI update
    setEmployees((prev) => prev.map((emp) => ({ ...emp, hideWorkHours: hide })));

    try {
      const res = await fetch(`${getApiUrl()}/settings/work-hours-visibility/bulk`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hideWorkHours: hide }),
      });

      if (res.ok) {
        const msg = hide
          ? (language === "de"
              ? "Arbeitszeiten für alle Mitarbeiter ausgeblendet."
              : "Work hours hidden for all employees.")
          : (language === "de"
              ? "Arbeitszeiten für alle Mitarbeiter sichtbar geschaltet."
              : "Work hours visible for all employees.");
        showToast(msg);
      } else {
        // Refresh from server to ensure accurate state
        fetchEmployeesData();
        alert("Fehler bei der Massenaktualisierung.");
      }
    } catch (e) {
      console.error("Bulk visibility toggle failed:", e);
      fetchEmployeesData();
      alert("Verbindungsfehler bei der Massenaktualisierung.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Computed statistics
  const totalEmployees = employees.length;
  const hiddenEmployeesCount = useMemo(
    () => employees.filter((e) => e.hideWorkHours).length,
    [employees]
  );
  const visibleEmployeesCount = totalEmployees - hiddenEmployeesCount;

  // Filtered employees for modal list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Status filter
      if (activeFilter === "visible" && emp.hideWorkHours) return false;
      if (activeFilter === "hidden" && !emp.hideWorkHours) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchUsername = emp.username.toLowerCase().includes(q);
        const matchPhone = emp.phone ? emp.phone.includes(q) : false;
        const matchWh = emp.warehouseName ? emp.warehouseName.toLowerCase().includes(q) : false;
        const matchHall = emp.hallName ? emp.hallName.toLowerCase().includes(q) : false;
        return matchName || matchUsername || matchPhone || matchWh || matchHall;
      }
      return true;
    });
  }, [employees, activeFilter, searchQuery]);

  if (loadingInitial) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-400 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-[11px] font-medium">Laden...</span>
      </div>
    );
  }

  // Render Modal
  const renderManagementModal = () => {
    if (!isModalOpen) return null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => setIsModalOpen(false)}
      >
        <div
          className="bg-white border border-slate-200/90 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-gradient-to-r from-slate-50 via-white to-slate-50">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-base sm:text-lg text-slate-900 leading-snug">
                    {t("manageVisibilityModalTitle")}
                  </h3>
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Realtime
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t("manageVisibilityModalDesc")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Metrics & Bulk Bar */}
          <div className="px-4 sm:px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Quick Metrics */}
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100/70 text-emerald-800 font-bold border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{visibleEmployeesCount} {t("employeesCountVisible")}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100/70 text-amber-900 font-bold border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>{hiddenEmployeesCount} {t("employeesCountHidden")}</span>
              </div>
              <div className="text-slate-400 text-[11px] font-medium hidden sm:inline">
                ({totalEmployees} {t("filterAll")})
              </div>
            </div>

            {/* Bulk Action Buttons */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => handleBulkAction(false)}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{t("showAllEmployeesBtn")}</span>
              </button>
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => handleBulkAction(true)}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>{t("hideAllEmployeesBtn")}</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchEmployeesPlaceholder")}
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  activeFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t("filterAll")} ({totalEmployees})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("visible")}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  activeFilter === "visible" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t("filterVisible")} ({visibleEmployeesCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("hidden")}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  activeFilter === "hidden" ? "bg-white text-amber-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t("filterHidden")} ({hiddenEmployeesCount})
              </button>
            </div>
          </div>

          {/* Employees List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 sm:p-3 max-h-[50vh]">
            {loadingEmployees ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="text-xs">Mitarbeiter werden geladen...</span>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold text-slate-600">Keine Mitarbeiter gefunden</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Versuchen Sie einen anderen Suchbegriff oder Filter.</p>
              </div>
            ) : (
              filteredEmployees.map((emp) => {
                const isHidden = Boolean(emp.hideWorkHours);
                const isToggling = togglingEmployeeId === emp.id;

                return (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-xl hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Employee Profile & Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 select-none shadow-2xs ${
                          isHidden
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                        }`}
                      >
                        {emp.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                            {emp.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                            @{emp.username}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {emp.warehouseName && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium truncate max-w-[130px]">
                              {emp.warehouseName}
                              {emp.hallName ? ` • ${emp.hallName}` : ""}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${
                              isHidden
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {isHidden ? t("statusHidden") : t("statusVisible")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Toggle Switch */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleSingleEmployee(emp)}
                        disabled={isToggling || bulkActionLoading}
                        aria-label={isHidden ? t("showWorkHoursToggleBtn") : t("hideWorkHoursToggleBtn")}
                        className={`group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                          !isHidden ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-400 hover:bg-amber-500"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                            !isHidden ? "translate-x-5" : "translate-x-0"
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                          ) : !isHidden ? (
                            <Eye className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <EyeOff className="w-3 h-3 text-amber-700" />
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>{t("realtimeSyncNotice")}</span>
            </div>

            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition-all shadow-xs cursor-pointer"
            >
              Fertig
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 1. Badge Variant (Header & Toolbars)
  if (variant === "badge") {
    const isAnyHidden = hiddenEmployeesCount > 0 || isGlobalHidden;

    return (
      <>
        <div
          className={`relative flex items-center gap-2.5 bg-white px-3.5 py-1.5 rounded-xl border transition-all duration-200 shadow-2xs ${
            isAnyHidden
              ? "border-amber-300/80 bg-gradient-to-r from-amber-50/60 to-white"
              : "border-slate-200/90 hover:border-slate-300"
          } ${className}`}
        >
          {/* Status Indicator Dot & Texts */}
          <div className="flex items-center gap-2 select-none">
            <span className="relative flex h-2.5 w-2.5">
              {isAnyHidden ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-xs shadow-emerald-500/50" />
              )}
            </span>
            <div className="text-left leading-none">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">
                {t("workHoursVisibilityTitle")}
              </span>
              <span
                className={`text-[11px] font-extrabold ${
                  isAnyHidden ? "text-amber-900" : "text-emerald-700"
                }`}
              >
                {hiddenEmployeesCount > 0
                  ? `${hiddenEmployeesCount} ${language === "de" ? "gesperrt" : "hidden"}`
                  : language === "de"
                  ? "Alle sichtbar"
                  : "All visible"}
              </span>
            </div>
          </div>

          {/* Open Per-Employee Modal Button */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            title={t("manageIndividualVisibility")}
            className="ml-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline text-[11px] font-extrabold">
              {t("manageIndividualVisibility")}
            </span>
          </button>

          {/* Floating Toast Notification */}
          {toastMessage && (
            <div className="absolute -bottom-10 right-0 z-50 bg-slate-900 text-white text-[11px] font-semibold py-1 px-3 rounded-lg shadow-lg border border-slate-800 animate-in fade-in slide-in-from-top-1 whitespace-nowrap">
              {toastMessage}
            </div>
          )}
        </div>

        {renderManagementModal()}
      </>
    );
  }

  // 2. Card Variant (Full control panel)
  const isAnyHidden = hiddenEmployeesCount > 0 || isGlobalHidden;

  return (
    <>
      <div
        className={`card-premium p-4 sm:p-5 border-2 transition-all ${
          isAnyHidden ? "border-amber-300 bg-amber-50/40" : "border-slate-200/80 bg-white"
        } ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                isAnyHidden ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"
              }`}
            >
              {isAnyHidden ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm text-slate-900">
                  {t("workHoursVisibilityTitle")}
                </h4>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                    isAnyHidden
                      ? "bg-amber-100 text-amber-900 border-amber-300"
                      : "bg-emerald-100 text-emerald-800 border-emerald-300"
                  }`}
                >
                  {hiddenEmployeesCount > 0
                    ? `${hiddenEmployeesCount} von ${totalEmployees} ausgeblendet`
                    : "Alle Mitarbeiter sichtbar"}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-xl">
                {language === "de"
                  ? "Steuern Sie für jeden Mitarbeiter individuell in Echtzeit, ob Arbeitszeiten, Stundenstatistiken und Stundenzettel im Mitarbeiter-Portal sichtbar sind."
                  : "Control individually and in real-time whether each employee can see work hours, stats, and timesheets in their portal."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>{t("manageIndividualVisibility")} ({totalEmployees})</span>
            </button>
          </div>
        </div>
      </div>

      {renderManagementModal()}
    </>
  );
}
