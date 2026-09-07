"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Clock,
  Calendar,
  Warehouse,
  Grid,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Sun,
  Sunset,
  Moon,
  Sliders,
  Sparkles,
  Coffee,
  Info,
  Tag,
  FileText,
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

interface EmployeeLogHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employeeId: string;
  defaultWarehouseId?: string;
  defaultHallId?: string;
  warehouses: Array<{
    id: string;
    name: string;
    halls?: Array<{ id: string; name: string }>;
  }>;
  halls: Array<{ id: string; name: string; warehouseId?: string }>;
}

type ShiftPreset = "EARLY" | "LATE" | "NIGHT" | "CUSTOM";

export default function EmployeeLogHoursModal({
  isOpen,
  onClose,
  onSuccess,
  employeeId,
  defaultWarehouseId,
  defaultHallId,
  warehouses,
  halls,
}: EmployeeLogHoursModalProps) {
  const { t, language } = useTranslation();

  // Date State
  const todayIso = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const [selectedDate, setSelectedDate] = useState(todayIso);

  // Preset & Time States
  const [activePreset, setActivePreset] = useState<ShiftPreset>("EARLY");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("14:30");
  const [breakMinutes, setBreakMinutes] = useState(30);

  // Location States
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedHallId, setSelectedHallId] = useState("");

  // Activity & Notes
  const [selectedActivity, setSelectedActivity] = useState<string>("Containerentladung");
  const [notes, setNotes] = useState("");

  // UI status
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Quick dates
  const yesterdayIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString("en-CA");
  }, []);

  const dayBeforeIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toLocaleDateString("en-CA");
  }, []);

  // Sync default location when opened
  useEffect(() => {
    if (isOpen) {
      setErrorMessage("");
      setSelectedDate(todayIso);
      setActivePreset("EARLY");
      setStartTime("06:00");
      setEndTime("14:30");
      setBreakMinutes(30);
      setNotes("");

      const whId = defaultWarehouseId || (warehouses.length > 0 ? warehouses[0].id : "");
      setSelectedWarehouseId(whId);

      const availableHalls = halls.filter((h) => !h.warehouseId || h.warehouseId === whId);
      const hlId = defaultHallId || (availableHalls.length > 0 ? availableHalls[0].id : (halls[0]?.id || ""));
      setSelectedHallId(hlId);
    }
  }, [isOpen, defaultWarehouseId, defaultHallId, warehouses, halls, todayIso]);

  // When warehouse changes, auto-select a corresponding hall
  const handleWarehouseChange = (whId: string) => {
    setSelectedWarehouseId(whId);
    const availableHalls = halls.filter((h) => !h.warehouseId || h.warehouseId === whId);
    if (availableHalls.length > 0) {
      setSelectedHallId(availableHalls[0].id);
    } else {
      setSelectedHallId("");
    }
  };

  // Preset Selection
  const applyPreset = (preset: ShiftPreset) => {
    setActivePreset(preset);
    if (preset === "EARLY") {
      setStartTime("06:00");
      setEndTime("14:30");
      setBreakMinutes(30);
    } else if (preset === "LATE") {
      setStartTime("14:00");
      setEndTime("22:30");
      setBreakMinutes(30);
    } else if (preset === "NIGHT") {
      setStartTime("22:00");
      setEndTime("06:30");
      setBreakMinutes(30);
    }
  };

  // Adjust time by minutes
  const adjustTime = (type: "start" | "end", deltaMinutes: number) => {
    setActivePreset("CUSTOM");
    const currentTime = type === "start" ? startTime : endTime;
    const [h, m] = currentTime.split(":").map(Number);
    let totalMins = h * 60 + m + deltaMinutes;
    if (totalMins < 0) totalMins += 24 * 60;
    totalMins = totalMins % (24 * 60);

    const newH = String(Math.floor(totalMins / 60)).padStart(2, "0");
    const newM = String(totalMins % 60).padStart(2, "0");
    const formatted = `${newH}:${newM}`;

    if (type === "start") setStartTime(formatted);
    else setEndTime(formatted);
  };

  // Step Date by days
  const stepDate = (deltaDays: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + deltaDays);
    setSelectedDate(current.toLocaleDateString("en-CA"));
  };

  // Calculate Worked Hours
  const { grossMinutes, netMinutes, netHours, isNightShift } = useMemo(() => {
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    let startTotal = startH * 60 + startM;
    let endTotal = endH * 60 + endM;

    let night = false;
    if (endTotal <= startTotal) {
      // Crosses midnight
      endTotal += 24 * 60;
      night = true;
    }

    const gross = endTotal - startTotal;
    const net = Math.max(0, gross - (breakMinutes || 0));
    const hours = Math.round((net / 60) * 100) / 100;

    return {
      grossMinutes: gross,
      netMinutes: net,
      netHours: hours,
      isNightShift: night,
    };
  }, [startTime, endTime, breakMinutes]);

  // Format date display
  const dateFormatted = useMemo(() => {
    try {
      const parts = selectedDate.split("-");
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString(language === "de" ? "de-DE" : "en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate, language]);

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!selectedDate) {
      setErrorMessage(language === "de" ? "Bitte ein Datum auswählen." : "Please select a date.");
      return;
    }
    if (netHours <= 0) {
      setErrorMessage(
        language === "de"
          ? "Die berechnete Arbeitszeit muss größer als 0 sein."
          : "Calculated work hours must be greater than 0."
      );
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setErrorMessage("Sitzung abgelaufen. Bitte neu anmelden.");
      return;
    }

    setSubmitting(true);
    try {
      // Build ISO strings for clockIn and clockOut
      const clockInDate = new Date(`${selectedDate}T${startTime}:00`);
      let clockOutDate = new Date(`${selectedDate}T${endTime}:00`);
      if (isNightShift) {
        clockOutDate.setDate(clockOutDate.getDate() + 1);
      }

      const payload = {
        employeeId,
        warehouseId: selectedWarehouseId || null,
        hallId: selectedHallId || null,
        clockIn: clockInDate.toISOString(),
        clockOut: clockOutDate.toISOString(),
        breakMinutes: Number(breakMinutes) || 0,
        totalHours: Number(netHours),
        date: clockInDate.toISOString(),
        source: "MANUAL",
        notes: [selectedActivity, notes].filter(Boolean).join(" — "),
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/attendance/manual`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Fehler beim Speichern der Arbeitszeit.");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Unerwarteter Fehler beim Speichern.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentHalls = halls.filter(
    (h) => !h.warehouseId || !selectedWarehouseId || h.warehouseId === selectedWarehouseId
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-hours-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 max-h-[94vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Handle Indicator */}
        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 id="log-hours-title" className="text-base font-bold text-slate-900 leading-tight">
                {t("logHoursCTA")}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("logHoursSubtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2 animate-shake">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Date Selector with Quick Chips */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>{t("date")}</span>
              </label>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                {dateFormatted}
              </span>
            </div>

            {/* Quick Date Pills */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedDate(todayIso)}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                  selectedDate === todayIso
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {t("today")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(yesterdayIso)}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                  selectedDate === yesterdayIso
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {t("yesterday")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(dayBeforeIso)}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                  selectedDate === dayBeforeIso
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {t("dayBeforeYesterday")}
              </button>
            </div>

            {/* Custom Date Navigator */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => stepDate(-1)}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                title="Vorheriger Tag"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex-1 py-2 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => stepDate(1)}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                title="Nächster Tag"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. One-Tap Shift Presets */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{t("shiftPresets")}</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => applyPreset("EARLY")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  activePreset === "EARLY"
                    ? "bg-blue-50 border-blue-500 text-blue-900 shadow-xs ring-2 ring-blue-500/20"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    {t("earlyShift")}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">06:00 – 14:30</span>
                <span className="text-[10px] font-semibold text-emerald-600 mt-1">8,0h (30m P.)</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset("LATE")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  activePreset === "LATE"
                    ? "bg-blue-50 border-blue-500 text-blue-900 shadow-xs ring-2 ring-blue-500/20"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <Sunset className="w-3.5 h-3.5 text-orange-500" />
                    {t("lateShift")}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">14:00 – 22:30</span>
                <span className="text-[10px] font-semibold text-emerald-600 mt-1">8,0h (30m P.)</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset("NIGHT")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  activePreset === "NIGHT"
                    ? "bg-blue-50 border-blue-500 text-blue-900 shadow-xs ring-2 ring-blue-500/20"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <Moon className="w-3.5 h-3.5 text-indigo-500" />
                    {t("nightShift")}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">22:00 – 06:30</span>
                <span className="text-[10px] font-semibold text-emerald-600 mt-1">8,0h (30m P.)</span>
              </button>

              <button
                type="button"
                onClick={() => setActivePreset("CUSTOM")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  activePreset === "CUSTOM"
                    ? "bg-blue-50 border-blue-500 text-blue-900 shadow-xs ring-2 ring-blue-500/20"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-slate-600" />
                    {t("customShift")}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">Manuell</span>
                <span className="text-[10px] font-semibold text-blue-600 mt-1">Freie Zeit</span>
              </button>
            </div>
          </div>

          {/* 3. Time Steppers & Adjusters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
            {/* Startzeit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t("startTime")}</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => adjustTime("start", -15)}
                    className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    -15m
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustTime("start", 15)}
                    className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    +15m
                  </button>
                </div>
              </div>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setActivePreset("CUSTOM");
                }}
                className="w-full py-2.5 px-3 text-base font-bold font-mono bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center"
              />
            </div>

            {/* Endzeit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t("endTime")}</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => adjustTime("end", -15)}
                    className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    -15m
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustTime("end", 15)}
                    className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    +15m
                  </button>
                </div>
              </div>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setActivePreset("CUSTOM");
                }}
                className="w-full py-2.5 px-3 text-base font-bold font-mono bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center"
              />
            </div>
          </div>

          {/* 4. Break Duration Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-600" />
                <span>{t("breakDuration")}</span>
              </label>
              <span className="text-xs font-mono font-bold text-slate-700">
                {breakMinutes} Min
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[0, 15, 30, 45, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setBreakMinutes(mins)}
                  className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                    breakMinutes === mins
                      ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {mins === 0 ? "0m" : `${mins}m`}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Live Net Hours Calculation & Compliance Ring */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-900 to-slate-900 text-white shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="space-y-0.5">
                <span className="text-[10px] text-blue-200 uppercase font-bold tracking-wider">
                  {t("netHours")}
                </span>
                <p className="text-2xl font-black font-mono tracking-tight text-white">
                  {netHours.toFixed(2)}{" "}
                  <span className="text-sm font-normal text-blue-200">Std.</span>
                </p>
              </div>

              {/* ArbZG Compliance Badge */}
              <div className="text-right">
                {netHours <= 8.0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    {t("normalHours")}
                  </span>
                ) : netHours <= 10.0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    {t("overtime")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40 px-2.5 py-1 rounded-full animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    &gt; 10h Max
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-blue-200/80 font-mono">
              <span>
                {t("grossHours")}: {Math.floor(grossMinutes / 60)}h {grossMinutes % 60}m
              </span>
              <span>
                {t("breakDuration")}: {breakMinutes}m
              </span>
              <span>
                Zeitraum: {startTime} – {endTime}
              </span>
            </div>

            {netHours > 10.0 && (
              <p className="text-[11px] text-amber-200 bg-amber-500/20 p-2 rounded-lg border border-amber-400/30 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                <span>{t("maxHoursWarning")}</span>
              </p>
            )}
          </div>

          {/* 6. Location Selector (Warehouse & Hall) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Warehouse className="w-3.5 h-3.5 text-blue-600" />
                <span>{t("warehouse")}</span>
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => handleWarehouseChange(e.target.value)}
                className="w-full py-2.5 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Grid className="w-3.5 h-3.5 text-blue-600" />
                <span>{t("halls")}</span>
              </label>
              <select
                value={selectedHallId}
                onChange={(e) => setSelectedHallId(e.target.value)}
                className="w-full py-2.5 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
              >
                {currentHalls.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 7. Activity / Task Chips */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              <span>{t("activityLabel")}</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                "📦 Containerentladung",
                "🏷️ Kommissionierung",
                "🚜 Staplerarbeiten",
                "🔄 Ein- & Umlagerung",
                "🧹 Sonstiges / Halle",
              ].map((act) => (
                <button
                  key={act}
                  type="button"
                  onClick={() => setSelectedActivity(act)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all cursor-pointer ${
                    selectedActivity === act
                      ? "bg-indigo-50 border-indigo-500 text-indigo-900 font-bold shadow-2xs"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {act}
                </button>
              ))}
            </div>
          </div>

          {/* 8. Optional Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>{t("notesOptional")}</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z.B. Container MSKU1234567 entladen..."
              className="w-full py-2 px-3 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary py-3 px-4 text-xs font-bold cursor-pointer"
          >
            {t("close")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || netHours <= 0}
            className="btn-primary py-3 px-6 text-xs font-bold shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t("saving")}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {t("saveHours")} ({netHours.toFixed(1)}h)
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
