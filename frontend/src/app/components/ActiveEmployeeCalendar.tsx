"use client";

import React, { useMemo, useEffect, useState } from "react";
import { Clock, Warehouse, User, AlertCircle, Loader2 } from "lucide-react";

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  employee?: {
    id: string;
    name: string;
    phone?: string;
  };
  clockIn: string;
  clockOut: string | null;
  warehouseId: string;
  warehouseName?: string;
  warehouse?: {
    name: string;
  };
  hallId: string;
  hallName?: string;
  hall?: {
    name: string;
  };
  date: string;
}

interface ActiveEmployeeCalendarProps {
  logs: AttendanceRecord[];
  loading: boolean;
  isOffline: boolean;
}

export default function ActiveEmployeeCalendar({ logs, loading, isOffline }: ActiveEmployeeCalendarProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Update clock every minute for live progress bar
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const START_HOUR = 6;
  const END_HOUR = 18;
  const TOTAL_HOURS = END_HOUR - START_HOUR;

  // Group active logs by warehouse and hall
  const groupedLocations = useMemo(() => {
    const locationsMap: Record<
      string,
      {
        warehouseName: string;
        hallName: string;
        records: AttendanceRecord[];
      }
    > = {};

    logs.forEach((log) => {
      const wName = log.warehouse?.name || log.warehouseName || "Unbekanntes Lager";
      const hName = log.hall?.name || log.hallName || "Halle";
      const key = `${wName} - ${hName}`;

      if (!locationsMap[key]) {
        locationsMap[key] = {
          warehouseName: wName,
          hallName: hName,
          records: [],
        };
      }
      locationsMap[key].records.push(log);
    });

    return Object.entries(locationsMap).map(([key, data]) => ({
      key,
      ...data,
    }));
  }, [logs]);

  // Find currently active employees (clockOut is null)
  const activeStaffList = useMemo(() => {
    return logs
      .filter((log) => !log.clockOut)
      .map((log) => {
        const empName = log.employee?.name || log.employeeName || "Mitarbeiter";
        const wName = log.warehouse?.name || log.warehouseName || "Lager";
        const hName = log.hall?.name || log.hallName || "Halle";
        return {
          id: log.id,
          employeeId: log.employeeId,
          name: empName,
          location: `${wName} — ${hName}`,
          clockIn: log.clockIn,
        };
      });
  }, [logs]);


  // Format date helper
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
    } catch {
      return "--:--";
    }
  };

  // Render employee initials
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  // Color generator for employee shift blocks based on their name hash
  const getHashColor = (name: string) => {
    const colors = [
      { bg: "bg-blue-50 border-blue-500 text-blue-900", accent: "#1d4ed8" },
      { bg: "bg-indigo-50 border-indigo-500 text-indigo-900", accent: "#4338ca" },
      { bg: "bg-purple-50 border-purple-500 text-purple-900", accent: "#7e22ce" },
      { bg: "bg-teal-50 border-teal-500 text-teal-900", accent: "#0f766e" },
      { bg: "bg-sky-50 border-sky-500 text-sky-900", accent: "#0369a1" },
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  };

  return (
    <div className="bg-white border border-outline-variant rounded-2xl overflow-hidden shadow-sm space-y-4">
      {/* Header */}
      <div className="p-stack-md border-b border-outline-variant bg-surface-container-low flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-2">
          <Warehouse className="w-5 h-5 text-secondary" />
          <div>
            <h5 className="font-bold text-body-lg text-on-surface">
              Mitarbeiter-Belegungsplan (Gantt)
            </h5>
            <p className="text-xs text-on-surface-variant">
              Tägliche Schichtbelegung und Live-Status nach Lagerbereichen geordnet
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {isOffline && (
            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              Offline-Modus
            </span>
          )}
          <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></span> Live
          </span>
        </div>
      </div>

      {/* Active staff list banner */}
      {!loading && activeStaffList.length > 0 && (
        <div className="px-6 py-3 bg-emerald-50/40 border-b border-outline-variant flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Jetzt aktiv im Dienst ({activeStaffList.length}):
          </span>
          <div className="flex flex-wrap gap-2">
            {activeStaffList.map((staff) => {
              const { bg: colorClass, accent } = getHashColor(staff.name);
              return (
                <div
                  key={staff.id}
                  className="bg-white border border-emerald-100 text-slate-800 text-xs px-3 py-1 rounded-full font-medium shadow-sm flex items-center gap-2 hover:border-emerald-300 transition-colors"
                >
                  <div
                    style={{ backgroundColor: `${accent}15`, color: accent }}
                    className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[8px] border border-current"
                  >
                    {getInitials(staff.name)}
                  </div>
                  <span className="font-bold text-slate-900">{staff.name}</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    ({staff.location})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-secondary" />
          <p className="text-sm text-slate-500">Lade Belegungsplan...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <AlertCircle className="w-8 h-8 opacity-40 text-slate-500" />
          <p className="text-sm font-semibold">Keine aktiven Mitarbeiter heute registriert.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto relative">
          <div className="min-w-[900px] flex flex-col">
            {/* Timeline X-Axis Header */}
            <div className="flex border-b border-outline-variant bg-slate-50/50">
              {/* Top-left spacer */}
              <div className="sticky left-0 w-[240px] bg-slate-50 border-r border-outline-variant p-3 font-bold text-xs text-slate-500 shrink-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                Lager & Halle
              </div>
              
              {/* Hour Columns */}
              <div className="flex-1 flex relative">
                {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
                  const hour = START_HOUR + i;
                  return (
                    <div
                      key={hour}
                      className="flex-1 text-center py-2.5 text-[10px] font-bold text-slate-400 font-mono border-r border-slate-100 last:border-r-0"
                    >
                      {hour.toString().padStart(2, "0")}:00
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grouped Location Rows */}
            <div className="divide-y divide-outline-variant">
              {groupedLocations.map(({ key, warehouseName, hallName, records }) => (
                <div key={key} className="flex hover:bg-slate-50/20 transition-colors">
                  {/* Sticky Location Y-Axis Label */}
                  <div className="sticky left-0 w-[240px] bg-white border-r border-outline-variant p-4 shrink-0 flex flex-col justify-center z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                    <span className="font-bold text-slate-900 text-sm">{warehouseName}</span>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 bg-secondary/30 rounded-full"></span>
                      {hallName}
                    </span>
                  </div>

                  {/* Horizontal Timeline tracks */}
                  <div className="flex-1 relative flex flex-col py-3 min-h-[90px] divide-y divide-slate-50">
                    {/* Vertical grid lines background */}
                    <div className="absolute inset-0 flex pointer-events-none z-0">
                      {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                        <div key={i} className="flex-1 border-r border-slate-100/70 last:border-r-0 h-full" />
                      ))}
                    </div>

                    {/* Employee Shift Tracks */}
                    {records.map((log) => {
                      const empName = log.employee?.name || log.employeeName || "Mitarbeiter";
                      
                      // Calculate times
                      const clockIn = new Date(log.clockIn);
                      const startH = clockIn.getHours() + clockIn.getMinutes() / 60;
                      
                      let endH = END_HOUR;
                      let isLive = false;
                      
                      if (log.clockOut) {
                        const clockOut = new Date(log.clockOut);
                        endH = clockOut.getHours() + clockOut.getMinutes() / 60;
                      } else {
                        isLive = true;
                        // Use current time if clocked in today
                        const now = currentTime || new Date();
                        if (clockIn.toDateString() === now.toDateString()) {
                          endH = now.getHours() + now.getMinutes() / 60;
                        } else {
                          endH = startH + 8; // Mock standard 8 hour shift
                        }
                      }

                      // Position clipping
                      const clippedStart = Math.max(START_HOUR, Math.min(END_HOUR, startH));
                      const clippedEnd = Math.max(START_HOUR, Math.min(END_HOUR, endH));
                      
                      const leftPercent = ((clippedStart - START_HOUR) / TOTAL_HOURS) * 100;
                      const widthPercent = ((clippedEnd - clippedStart) / TOTAL_HOURS) * 100;
                      const isVisible = clippedEnd > clippedStart;

                      const { bg: colorClass, accent } = getHashColor(empName);

                      return (
                        <div key={log.id} className="relative h-14 w-full first:pt-0 pt-2 z-10">
                          {isVisible && (
                            <div
                              style={{
                                left: `${leftPercent}%`,
                                width: `${Math.max(20, widthPercent)}%`,
                              }}
                              className={`absolute top-2 h-10 min-w-[150px] rounded-xl border-l-4 p-2 flex items-center justify-between shadow-sm transition-all duration-300 ${colorClass}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Avatar initials */}
                                <div
                                  style={{ backgroundColor: `${accent}15`, color: accent }}
                                  className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center font-bold text-[9px] border border-current"
                                >
                                  {getInitials(empName)}
                                </div>
                                <div className="min-w-0">
                                  <span className="block font-bold text-xs truncate leading-none">
                                    {empName}
                                  </span>
                                  <span className="text-[9px] opacity-75 font-mono">
                                    {formatTime(log.clockIn).split(" ")[0]} – {log.clockOut ? formatTime(log.clockOut).split(" ")[0] : "Jetzt"}
                                  </span>
                                </div>
                              </div>

                              {/* Live indicator or Clock icon */}
                              <div className="shrink-0 pl-1">
                                {isLive ? (
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                  </span>
                                ) : (
                                  <Clock className="w-3.5 h-3.5 opacity-60" />
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
