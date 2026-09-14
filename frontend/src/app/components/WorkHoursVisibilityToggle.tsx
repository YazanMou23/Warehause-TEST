"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

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
  const [isGlobalHidden, setIsGlobalHidden] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [toggling, setToggling] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  const fetchVisibility = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${getApiUrl()}/settings/work-hours-visibility`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const hidden = Boolean(data.isGlobalHidden);
        setIsGlobalHidden(hidden);
        onVisibilityChange?.(hidden);
      }
    } catch (e) {
      console.warn("Could not fetch work hours visibility", e);
    } finally {
      setLoading(false);
    }
  }, [onVisibilityChange]);

  useEffect(() => {
    fetchVisibility();

    // Listen to sync events from other toggle instances across the app
    const handleSync = (e: CustomEvent<{ isGlobalHidden: boolean }>) => {
      if (typeof e.detail?.isGlobalHidden === "boolean") {
        setIsGlobalHidden(e.detail.isGlobalHidden);
      }
    };

    window.addEventListener(WORK_HOURS_VISIBILITY_EVENT as any, handleSync as any);
    return () => {
      window.removeEventListener(WORK_HOURS_VISIBILITY_EVENT as any, handleSync as any);
    };
  }, [fetchVisibility]);

  const handleToggle = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token || toggling) return;

    const nextVal = !isGlobalHidden;
    setToggling(true);
    setToastMessage(null);

    try {
      const res = await fetch(`${getApiUrl()}/settings/work-hours-visibility`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hideWorkHours: nextVal }),
      });

      if (res.ok) {
        setIsGlobalHidden(nextVal);
        onVisibilityChange?.(nextVal);

        // Broadcast to all other active tabs / components
        window.dispatchEvent(
          new CustomEvent(WORK_HOURS_VISIBILITY_EVENT, {
            detail: { isGlobalHidden: nextVal },
          })
        );

        // Brief visual toast feedback
        const msg = nextVal ? t("workHoursHiddenAlertMsg") : t("workHoursVisibleAlertMsg");
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Fehler beim Umschalten der Sichtbarkeit.");
      }
    } catch (e) {
      console.error("Toggle error:", e);
      alert("Verbindungsfehler beim Ändern der Arbeitszeit-Sichtbarkeit.");
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-[11px] font-medium">Sichtbarkeit lädt...</span>
      </div>
    );
  }

  // 1. Badge Variant (Optimal for Headers, Top Bars, Toolbars)
  if (variant === "badge") {
    return (
      <div className={`relative flex items-center gap-2.5 bg-white px-3.5 py-2 rounded-xl border transition-all duration-200 shadow-2xs ${
        isGlobalHidden 
          ? "border-amber-300/80 bg-gradient-to-r from-amber-50/70 to-white" 
          : "border-slate-200/90 hover:border-slate-300"
      } ${className}`}>
        {/* Status Indicator Dot & Texts */}
        <div className="flex items-center gap-2 select-none">
          <span className="relative flex h-2.5 w-2.5">
            {isGlobalHidden ? (
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
            <span className={`text-[11px] font-extrabold ${isGlobalHidden ? "text-amber-800" : "text-emerald-700"}`}>
              {isGlobalHidden ? t("workHoursHiddenBadge") : t("workHoursVisibleBadge")}
            </span>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          title={isGlobalHidden ? t("showWorkHoursToggleBtn") : t("hideWorkHoursToggleBtn")}
          className={`ml-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            isGlobalHidden
              ? "bg-amber-100/90 hover:bg-amber-200/90 text-amber-900 border-amber-300 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs hover:text-slate-900"
          }`}
        >
          {toggling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
          ) : isGlobalHidden ? (
            <Eye className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          ) : (
            <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
          <span className="hidden sm:inline text-[11px]">
            {isGlobalHidden ? t("showWorkHoursToggleBtn") : t("hideWorkHoursToggleBtn")}
          </span>
        </button>

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="absolute -bottom-10 right-0 z-50 bg-slate-900 text-white text-[11px] font-semibold py-1 px-3 rounded-lg shadow-lg border border-slate-800 animate-in fade-in slide-in-from-top-1 whitespace-nowrap">
            {toastMessage}
          </div>
        )}
      </div>
    );
  }

  // 2. Card Variant (Full control panel)
  return (
    <div className={`card-premium p-4 sm:p-5 border-2 transition-all ${
      isGlobalHidden ? "border-amber-300 bg-amber-50/40" : "border-slate-200/80 bg-white"
    } ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
            isGlobalHidden ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"
          }`}>
            {isGlobalHidden ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-sm text-slate-900">
                {t("workHoursVisibilityTitle")}
              </h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                isGlobalHidden 
                  ? "bg-amber-100 text-amber-900 border-amber-300" 
                  : "bg-emerald-100 text-emerald-800 border-emerald-300"
              }`}>
                {isGlobalHidden ? t("workHoursHiddenBadge") : t("workHoursVisibleBadge")}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-xl">
              {isGlobalHidden
                ? (language === "de"
                    ? "Arbeitszeiten, Stundenstatistiken und Stundenzettel sind aktuell für alle Mitarbeiter gesperrt und verborgen. Zeiterfassungsdaten werden zentral von der Einsatzleitung verwaltet."
                    : "Work hours, statistics, and timesheet logs are currently hidden from all employees. Work hours are managed centrally by operations.")
                : (language === "de"
                    ? "Mitarbeiter können ihre geleisteten Stunden und Schichten im Mitarbeiter-Portal einsehen und eigenständig Zeiten erfassen."
                    : "Employees can view their logged hours and shifts in the employee portal and submit timesheets.")
              }
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          className={`py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer self-stretch sm:self-auto shrink-0 ${
            isGlobalHidden
              ? "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20"
              : "bg-slate-900 hover:bg-slate-800 text-white"
          }`}
        >
          {toggling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isGlobalHidden ? (
            <Eye className="w-4 h-4" />
          ) : (
            <EyeOff className="w-4 h-4" />
          )}
          <span>{isGlobalHidden ? t("showWorkHoursToggleBtn") : t("hideWorkHoursToggleBtn")}</span>
        </button>
      </div>
    </div>
  );
}
