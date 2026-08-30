'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  CheckCircle,
  FileText,
  FileSpreadsheet,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  MapPin,
  Loader2,
  X,
  Download,
  Search,
  Filter,
  RefreshCw,
  Users,
  Edit,
  Plus,
} from 'lucide-react';
import { API_URL } from '../../../config/api';
import CustomAlertModal, { CustomAlertOptions } from '../../components/CustomAlertModal';
import { useDialog } from '../../components/DialogProvider';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────

interface TimesheetEntry {
  id?: string;
  weekday: string;
  date: string;
  startTime: string;
  endTime?: string;
  breakMinutes: number;
  totalHours: number;
  location: string;
  isActive?: boolean;
}

interface DbEmployee {
  id: string;
  name: string;
}

interface TimesheetListItem {
  id: string;
  employeeName: string;
  employeeId?: string | null;
  employee?: { id: string; name: string };
  weekStartDate: string;
  status: 'PENDING_REVIEW' | 'CONFIRMED';
  totalHours: number;
  entryCount: number;
  createdAt: string;
  entries?: TimesheetEntry[];
}

interface DailyAttendanceRecord {
  id: string;
  employeeId: string;
  employee?: { id: string; name: string; phone?: string };
  warehouseId?: string;
  warehouse?: { id?: string; name: string };
  hallId?: string;
  hall?: { id?: string; name: string; color?: string };
  clockIn: string;
  clockOut: string | null;
  totalHours?: number;
  breakMinutes?: number;
  source?: string;
  date: string;
}

type ActiveTab = 'list' | 'daily';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getGermanWeekday(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const weekdaysDe = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const day = dateStr.includes('-') && !dateStr.includes('T') ? d.getUTCDay() : d.getDay();
  return weekdaysDe[day];
}

function calculateHours(startTime: string, endTime: string, breakMinutes: number): number {
  if (!startTime || !endTime) return 0;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;
  
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  if (endMin <= startMin) return 0;
  
  const netMin = endMin - startMin - (breakMinutes || 0);
  return Math.max(0, netMin / 60);
}

function getWeekRange(weekStart: string): string {
  if (!weekStart) return '—';
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDate(start.toISOString())} – ${formatDate(end.toISOString())}`;
}

function getKw(weekStart: string): string {
  if (!weekStart) return '—';
  const d = new Date(weekStart);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - startOfYear.getTime()) / 86400000;
  const week = Math.ceil((diff + startOfYear.getDay() + 1) / 7);
  return `KW ${week} / ${d.getFullYear()}`;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'PENDING_REVIEW' | 'CONFIRMED' }) {
  if (status === 'CONFIRMED') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
        <CheckCircle size={12} />
        Bestätigt
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
      <Clock size={12} />
      Ausstehend
    </span>
  );
}


// ─── Timesheet List (With Expandable Daily Entries & Edit Modal) ───────────────

function TimesheetList({ refreshTrigger }: { refreshTrigger?: number }) {
  const [items, setItems] = useState<TimesheetListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<TimesheetListItem | null>(null);
  const [editEmployeeName, setEditEmployeeName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [downloading, setDownloading] = useState<{ id: string; fmt: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<CustomAlertOptions>({
    isOpen: false,
    message: "",
  });

  const showAlert = (options: Omit<CustomAlertOptions, "isOpen">) => {
    setAlertConfig({ ...options, isOpen: true });
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      if (filter.trim()) params.set('search', filter.trim());

      const res = await fetch(`${API_URL}/timesheets?${params}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      setItems(json.data ?? []);
    } catch {
      console.error('Fehler beim Laden der Stundenzettel');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, filter]);

  useEffect(() => {
    loadList();
  }, [loadList, refreshTrigger]);

  const saveEdit = async () => {
    if (!editingItem) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${API_URL}/timesheets/${editingItem.id}`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employeeName: editEmployeeName }),
      });

      if (res.ok) {
        showAlert({ title: "Erfolg", message: "Stundenzettel-Mitarbeiter wurde aktualisiert.", type: "success" });
        setEditingItem(null);
        loadList();
      } else {
        const err = await res.json();
        showAlert({ title: "Fehler", message: err.message || "Aktualisierung fehlgeschlagen", type: "error" });
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const downloadFile = async (id: string, format: 'pdf' | 'xlsx') => {
    setDownloading({ id, fmt: format });
    try {
      const res = await fetch(`${API_URL}/timesheets/export/${id}/${format}`, {
        headers: getAuthHeaders(),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stundenzettel-${id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const deleteItem = (id: string) => {
    showAlert({
      title: "Stundenzettel löschen",
      message: "Diesen Stundenzettel wirklich löschen?",
      type: "warning",
      confirmText: "Löschen",
      cancelText: "Abbrechen",
      onConfirm: async () => {
        setDeleting(id);
        try {
          await fetch(`${API_URL}/timesheets/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          setItems((prev) => prev.filter((i) => i.id !== id));
          showAlert({ title: "Erfolg", message: "Stundenzettel wurde gelöscht.", type: "success" });
        } finally {
          setDeleting(null);
        }
      },
    });
  };

  const filtered = items.filter((item) => {
    const name = (item.employee?.name ?? item.employeeName).toLowerCase();
    return !filter || name.includes(filter.toLowerCase());
  }).sort((a, b) => {
    const nameA = a.employee?.name ?? a.employeeName ?? "";
    const nameB = b.employee?.name ?? b.employeeName ?? "";
    return nameA.localeCompare(nameB, "de", { sensitivity: "base" });
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Search Bar & Filters Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm">
        
        {/* Mitarbeiter Search Bar without border */}
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500" />
          <input
            type="text"
            placeholder="Mitarbeiter-Name in Stundenzetteln suchen..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border-0 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-0 shadow-sm"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Filter Dropdown */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-blue-400 shadow-sm"
          >
            <option value="">Alle Status (Gesamt)</option>
            <option value="PENDING_REVIEW">Ausstehend (PENDING_REVIEW)</option>
            <option value="CONFIRMED">Bestätigt (CONFIRMED)</option>
          </select>

          {/* Aktualisieren button with NO hover color change */}
          <button
            onClick={loadList}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 text-sm font-medium shadow-sm cursor-pointer disabled:opacity-50"
            title="Liste neu laden"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-500' : 'text-slate-500'} />
            <span className="hidden sm:inline">Aktualisieren</span>
          </button>
        </div>
      </div>

      {/* List Content */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
          <Loader2 size={24} className="animate-spin text-blue-500" />
          <span>Stundenzettel werden geladen...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
          <FileText size={36} className="mx-auto mb-3 opacity-40 text-blue-500" />
          <p className="text-slate-800 font-semibold mb-1">Keine Stundenzettel gefunden</p>
          <p className="text-slate-500 text-xs">
            {filter ? `Keine Ergebnisse für "${filter}"` : 'Lade einen Stundenzettel per Scanner oder Foto hoch.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-xs text-slate-500 px-1 font-mono flex items-center justify-between">
            <span>{filtered.length} Stundenzettel gefunden</span>
            <span className="hidden sm:inline">Klicke auf den Pfeil zum Aufklappen der Tagesstunden</span>
          </div>

          {filtered.map((item, index) => {
            const isExpanded = expandedId === item.id;
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-blue-300 transition-colors overflow-hidden group min-w-0"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Numeric Index Badge (#1, #2, #3...) */}
                    <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      #{index + 1}
                    </div>

                    {/* Timesheet Employee info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-slate-900 font-semibold text-sm truncate">
                          {item.employee?.name ?? item.employeeName}
                        </p>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="text-slate-500 text-xs flex flex-wrap items-center gap-2">
                        <span>📅 {getWeekRange(item.weekStartDate)}</span>
                        <span>⏱️ {item.entryCount} Tage ({item.totalHours.toFixed(2)} h)</span>
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons — wrap on mobile */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {/* Expand Details Button */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors text-xs font-medium cursor-pointer"
                    >
                      <span className="hidden sm:inline">Tageszeiten</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {/* Edit Header / Employee Button */}
                    <button
                      onClick={() => {
                        setEditingItem(item);
                        setEditEmployeeName(item.employee?.name ?? item.employeeName);
                      }}
                      className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                      title="Name / Daten bearbeiten"
                    >
                      <Edit size={14} />
                    </button>

                    {item.status === 'CONFIRMED' && (
                      <>
                        <button
                          onClick={() => downloadFile(item.id, 'pdf')}
                          disabled={downloading?.id === item.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors text-xs cursor-pointer"
                          title="PDF Herunterladen"
                        >
                          {downloading?.id === item.id && downloading.fmt === 'pdf'
                            ? <Loader2 size={13} className="animate-spin" />
                            : <FileText size={13} />}
                          <span className="hidden sm:inline">PDF</span>
                        </button>
                        <button
                          onClick={() => downloadFile(item.id, 'xlsx')}
                          disabled={downloading?.id === item.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors text-xs cursor-pointer"
                          title="Excel Herunterladen"
                        >
                          {downloading?.id === item.id && downloading.fmt === 'xlsx'
                            ? <Loader2 size={13} className="animate-spin" />
                            : <FileSpreadsheet size={13} />}
                          <span className="hidden sm:inline">Excel</span>
                        </button>
                      </>
                    )}

                    {item.status === 'PENDING_REVIEW' && (
                      <button
                        onClick={() => deleteItem(item.id)}
                        disabled={deleting === item.id}
                        className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
                        title="Löschen"
                      >
                        {deleting === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Daily Entries Sub-Table */}
                <AnimatePresence>
                  {isExpanded && item.entries && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4"
                    >
                      <h4 className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                        <Clock size={12} /> Detaillierte Tagesstunden für {item.employee?.name ?? item.employeeName}:
                      </h4>

                      <div className="overflow-x-auto w-full">
                        <div className="min-w-[600px]">
                          <div className="grid grid-cols-[40px_100px_90px_70px_70px_70px_70px_1fr] gap-2 py-1.5 px-3 bg-slate-200/70 rounded-lg text-xs font-semibold text-slate-700">
                            <div>#</div>
                            <div>Tag</div>
                            <div>Datum</div>
                            <div>Von</div>
                            <div>Bis</div>
                            <div>Pause</div>
                            <div>Stunden</div>
                            <div>Ort</div>
                          </div>

                          <div className="divide-y divide-slate-200">
                            {item.entries.map((entry, eIdx) => (
                              <div
                                key={entry.id || eIdx}
                                className="grid grid-cols-[40px_100px_90px_70px_70px_70px_70px_1fr] gap-2 py-2 px-3 text-xs items-center text-slate-800 hover:bg-slate-100 transition-colors font-mono"
                              >
                                <div className="font-bold text-blue-600">#{eIdx + 1}</div>
                                <div className="font-sans font-medium text-slate-900">{entry.weekday}</div>
                                <div>{formatDate(entry.date)}</div>
                                <div className="text-emerald-700 font-semibold">{entry.startTime || '—'}</div>
                                <div className="text-slate-700">{entry.endTime || '—'}</div>
                                <div>{entry.breakMinutes ? `${entry.breakMinutes}m` : '0m'}</div>
                                <div className="font-bold text-blue-700">{entry.totalHours ? `${entry.totalHours.toFixed(2)}h` : '0h'}</div>
                                <div className="font-sans text-slate-600 truncate">{entry.location || 'Standard-Lager'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Edit Employee Name Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-slate-900 font-bold text-lg mb-4 flex items-center gap-2">
              <Edit size={18} className="text-blue-600" />
              Mitarbeiter-Name im Stundenzettel bearbeiten
            </h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-slate-600 font-medium block mb-1">Mitarbeiter Name</label>
                <input
                  type="text"
                  value={editEmployeeName}
                  onChange={(e) => setEditEmployeeName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-500 shadow-sm"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                <p><strong>Stundenzettel KW:</strong> {getKw(editingItem.weekStartDate)}</p>
                <p><strong>Status:</strong> {editingItem.status}</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm cursor-pointer"
              >
                {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                <span>Speichern</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomAlertModal
        {...alertConfig}
        onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

// ─── Daily Attendance View (With Manual Shift Add Modal) ──────────────────────

function DailyAttendanceView() {
  const dialog = useDialog();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState<DailyAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Manual Shift Modal State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualStartTime, setManualStartTime] = useState('08:00');
  const [manualEndTime, setManualEndTime] = useState('16:30');
  const [manualBreak, setManualBreak] = useState(30);
  const [submittingManual, setSubmittingManual] = useState(false);
  const [dbEmployees, setDbEmployees] = useState<DbEmployee[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [halls, setHalls] = useState<{ id: string; name: string; warehouseId: string }[]>([]);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editWarehouseId, setEditWarehouseId] = useState('');
  const [editHallId, setEditHallId] = useState('');
  const [savingRecord, setSavingRecord] = useState(false);

  const loadDailyAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/attendance/daily?date=${selectedDate}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : [];
        list.sort((a: any, b: any) => {
          const nameA = a.employee?.name || a.employeeName || '';
          const nameB = b.employee?.name || b.employeeName || '';
          return nameA.localeCompare(nameB, 'de', { sensitivity: 'base' });
        });
        setRecords(list);
      }
    } catch (e) {
      console.error('Fehler beim Laden der Tages-Anwesenheiten', e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadDailyAttendance();
  }, [loadDailyAttendance]);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [empRes, whRes, hlRes] = await Promise.all([
          fetch(`${API_URL}/employees?limit=100`, { headers: getAuthHeaders() }),
          fetch(`${API_URL}/warehouses`, { headers: getAuthHeaders() }),
          fetch(`${API_URL}/halls`, { headers: getAuthHeaders() }),
        ]);
        if (empRes.ok) {
          const json = await empRes.json();
          const list = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
          list.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }));
          setDbEmployees(list);
        }
        if (whRes.ok) {
          const json = await whRes.json();
          setWarehouses(Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []));
        }
        if (hlRes.ok) {
          const json = await hlRes.json();
          setHalls(Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []));
        }
      } catch (e) {
        console.error('Fehler beim Laden der Metadaten', e);
      }
    };
    fetchMetadata();
  }, []);

  const startEditing = (rec: DailyAttendanceRecord) => {
    setEditingId(rec.id);
    setEditDate(rec.date ? rec.date.split('T')[0] : selectedDate);
    const cIn = rec.clockIn ? new Date(rec.clockIn).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '08:00';
    const cOut = rec.clockOut ? new Date(rec.clockOut).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '16:30';
    setEditStartTime(cIn);
    setEditEndTime(cOut);
    setEditWarehouseId(rec.warehouseId || rec.warehouse?.id || (warehouses[0]?.id || ''));
    setEditHallId(rec.hallId || rec.hall?.id || (halls[0]?.id || ''));
  };

  const handleSaveEdit = async (rec: DailyAttendanceRecord) => {
    setSavingRecord(true);
    try {
      const clockIn = `${editDate}T${editStartTime}:00.000Z`;
      const clockOut = editEndTime ? `${editDate}T${editEndTime}:00.000Z` : null;
      const hrs = editEndTime ? calculateHours(editStartTime, editEndTime, rec.breakMinutes || 30) : undefined;

      const res = await fetch(`${API_URL}/attendance/${rec.id}`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clockIn,
          clockOut,
          totalHours: hrs,
          date: editDate,
          warehouseId: editWarehouseId || undefined,
          hallId: editHallId || undefined,
          employeeId: rec.employeeId,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        loadDailyAttendance();
      } else {
        const err = await res.json().catch(() => ({}));
        dialog.alert({
          title: 'Fehler beim Speichern',
          message: err.message || 'Unbekannter Fehler beim Speichern des Zeiteintrags.',
          type: 'error',
        });
      }
    } catch (err: any) {
      console.error('Fehler beim Aktualisieren:', err);
      dialog.alert({
        title: 'Fehler beim Speichern',
        message: err?.message || 'Fehler beim Aktualisieren des Eintrags.',
        type: 'error',
      });
    } finally {
      setSavingRecord(false);
    }
  };


  const handleCreateManualShift = async () => {
    if (!manualEmpId) return;
    setSubmittingManual(true);
    try {
      const clockInIso = `${selectedDate}T${manualStartTime}:00.000Z`;
      const clockOutIso = `${selectedDate}T${manualEndTime}:00.000Z`;
      const hrs = calculateHours(manualStartTime, manualEndTime, manualBreak);

      const res = await fetch(`${API_URL}/attendance/manual`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeId: manualEmpId,
          clockIn: clockInIso,
          clockOut: clockOutIso,
          breakMinutes: manualBreak,
          totalHours: hrs,
        }),
      });

      if (res.ok) {
        setShowManualModal(false);
        loadDailyAttendance();
      } else {
        const err = await res.json().catch(() => ({}));
        dialog.alert({
          title: 'Fehler beim Erstellen',
          message: err.message || 'Schicht konnte nicht manuell erstellt werden.',
          type: 'error',
        });
      }
    } catch (err: any) {
      console.error('Fehler beim Erstellen:', err);
      dialog.alert({
        title: 'Fehler beim Erstellen',
        message: err?.message || 'Ein unerwarteter Fehler ist aufgetreten.',
        type: 'error',
      });
    } finally {
      setSubmittingManual(false);
    }
  };

  const filteredRecords = records.filter((r) => {
    const name = (r.employee?.name || '').toLowerCase();
    const wh = (r.warehouse?.name || '').toLowerCase();
    const hall = (r.hall?.name || '').toLowerCase();
    const term = searchFilter.toLowerCase();
    return !term || name.includes(term) || wh.includes(term) || hall.includes(term);
  });

  const totalShiftHours = records.reduce((s, r) => s + (r.totalHours || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Date selector and stats bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-blue-600" />
            <span className="text-slate-900 font-semibold text-sm">Datum:</span>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-500 font-mono shadow-sm"
          />
          <button
            onClick={loadDailyAttendance}
            disabled={loading}
            className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm transition-colors cursor-pointer"
            title="Aktualisieren"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-500' : 'text-slate-500'} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-mono">
            <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-semibold">
              <Users size={12} className="inline mr-1.5" />
              Mitarbeiter: <strong className="text-blue-900">{records.length}</strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
              <Clock size={12} className="inline mr-1.5" />
              Schichtstunden: <strong className="text-emerald-900">{totalShiftHours.toFixed(2)} h</strong>
            </div>
          </div>

          <button
            onClick={() => setShowManualModal(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer w-full sm:w-auto"
          >
            <Plus size={14} />
            <span>Manuelle Schicht eintragen</span>
          </button>
        </div>
      </div>

      {/* Filter search bar for daily workers */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Mitarbeiter oder Lager an diesem Tag filtern..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border-0 shadow-sm rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-0"
        />
      </div>

      {/* Daily Shift Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
          <Loader2 size={24} className="animate-spin text-blue-500" />
          <span>Tages-Anwesenheiten werden geladen...</span>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-16 text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
          <Users size={36} className="mx-auto mb-3 opacity-40 text-blue-500" />
          <p className="text-slate-900 font-semibold mb-1">Keine Arbeitszeiten für den {formatDate(selectedDate)} eingetragen</p>
          <p className="text-slate-500 text-xs">Wähle ein anderes Datum oder erstelle/bestätige Stundenzettel für diesen Tag.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="w-12 px-4 py-3 text-center">#</th>
                <th className="px-4 py-3">Mitarbeiter Name</th>
                <th className="px-4 py-3">Einsatzort (Lager / Halle)</th>
                <th className="px-4 py-3">Datum & Zeiten</th>
                <th className="px-4 py-3">Stunden</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm text-slate-800">
              {filteredRecords.map((rec, idx) => {
                const isEditing = editingId === rec.id;
                const clockInTime = rec.clockIn ? new Date(rec.clockIn).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—';
                const clockOutTime = rec.clockOut ? new Date(rec.clockOut).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—';
                const isWorkingNow = !rec.clockOut;
                const filteredHalls = editWarehouseId ? halls.filter(h => h.warehouseId === editWarehouseId) : halls;

                if (isEditing) {
                  return (
                    <tr key={rec.id} className="bg-blue-50/70 border-y border-blue-200">
                      <td className="px-4 py-3 font-mono font-bold text-xs text-center text-blue-700">
                        #{idx + 1}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {rec.employee?.name || 'Mitarbeiter'}
                      </td>
                      <td className="px-4 py-3 space-y-1.5">
                        <select
                          value={editWarehouseId}
                          onChange={(e) => {
                            setEditWarehouseId(e.target.value);
                            const hls = halls.filter(h => h.warehouseId === e.target.value);
                            if (hls.length > 0) setEditHallId(hls[0].id);
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 outline-none shadow-sm"
                        >
                          <option value="" disabled>Lager wählen...</option>
                          {warehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                        <select
                          value={editHallId}
                          onChange={(e) => setEditHallId(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 outline-none shadow-sm"
                        >
                          <option value="" disabled>Halle wählen...</option>
                          {filteredHalls.map(h => (
                            <option key={h.id} value={h.id}>{h.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 space-y-1 text-xs font-mono">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 outline-none shadow-sm"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={editStartTime}
                            onChange={(e) => setEditStartTime(e.target.value)}
                            className="w-20 px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-emerald-700 outline-none shadow-sm font-semibold"
                          />
                          <span className="text-slate-500">-</span>
                          <input
                            type="time"
                            value={editEndTime}
                            onChange={(e) => setEditEndTime(e.target.value)}
                            className="w-20 px-1.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-700 outline-none shadow-sm"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">
                        {editEndTime ? `${calculateHours(editStartTime, editEndTime, rec.breakMinutes || 30).toFixed(2)} h` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-amber-700 font-semibold">Bearbeiten...</span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <button
                          onClick={() => handleSaveEdit(rec)}
                          disabled={savingRecord}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-xs inline-flex items-center gap-1 cursor-pointer"
                          title="Speichern"
                        >
                          {savingRecord ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          <span>Save</span>
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs cursor-pointer"
                          title="Abbrechen"
                        >
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-xs text-center text-blue-700">
                      #{idx + 1}
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {rec.employee?.name || 'Mitarbeiter'}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-medium">
                        <MapPin size={11} className="text-blue-600" />
                        {rec.warehouse?.name || 'Lager'} — {rec.hall?.name || 'Halle'}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      <span className="block font-sans text-slate-500 text-[11px] mb-0.5">{formatDate(rec.date || selectedDate)}</span>
                      <span className="text-emerald-700 font-semibold">{clockInTime} Uhr</span> — {isWorkingNow ? (
                        <span className="text-amber-700 font-medium">Aktiv</span>
                      ) : (
                        `${clockOutTime} Uhr`
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">
                      {rec.totalHours ? `${rec.totalHours.toFixed(2)} h` : '—'}
                    </td>

                    <td className="px-4 py-3">
                      {isWorkingNow ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock size={10} /> Aktiv
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle size={10} /> Beendet
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startEditing(rec)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-blue-700 transition-colors inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
                        title="Bearbeiten (Lager, Halle, Datum, Zeiten)"
                      >
                        <Edit size={13} />
                        <span>Bearbeiten</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Shift Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-slate-900 font-bold text-base flex items-center gap-2">
              <Plus size={16} className="text-blue-600" />
              Manuelle Schicht eintragen ({formatDate(selectedDate)})
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 font-medium block mb-1">Mitarbeiter wählen</label>
                <select
                  value={manualEmpId}
                  onChange={(e) => setManualEmpId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs outline-none shadow-sm"
                >
                  <option value="">Mitarbeiter wählen...</option>
                  {dbEmployees.map((e, idx) => (
                    <option key={e.id} value={e.id}>
                      #{idx + 1} {e.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600 font-medium block mb-1">Von (Uhrzeit)</label>
                  <input
                    type="time"
                    value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs outline-none font-mono shadow-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 font-medium block mb-1">Bis (Uhrzeit)</label>
                  <input
                    type="time"
                    value={manualEndTime}
                    onChange={(e) => setManualEndTime(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs outline-none font-mono shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-600 font-medium block mb-1">Pause (Minuten)</label>
                <input
                  type="number"
                  value={manualBreak}
                  onChange={(e) => setManualBreak(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs outline-none shadow-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCreateManualShift}
                disabled={submittingManual || !manualEmpId}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {submittingManual ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                Eintragen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TimesheetsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('list');
  const [refreshListKey, setRefreshListKey] = useState(0);

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Page Header */}
        <div className="mb-5 sm:mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 sm:p-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                <ScanLine size={22} className="text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
                  Zeiterfassung & Stundenzettel
                </h1>
                <p className="text-slate-500 text-xs sm:text-sm">
                  Wochenstundenzettel verwalten und Tages-Übersicht einsehen
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation — scrollable on mobile */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 mb-5 sm:mb-6 overflow-x-auto">
          {[
            { key: 'list', label: 'Wochenzettel Übersicht', shortLabel: 'Übersicht', icon: FileText },
            { key: 'daily', label: 'Tages-Übersicht', shortLabel: 'Tages-Ansicht', icon: Users },
          ].map(({ key, label, shortLabel, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key as ActiveTab);
                if (key === 'list') setRefreshListKey((prev) => prev + 1);
              }}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === key
                  ? 'bg-blue-600 text-white shadow-md font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Icon size={15} />
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <TimesheetList refreshTrigger={refreshListKey} />
            </motion.div>
          )}

          {activeTab === 'daily' && (
            <motion.div
              key="daily"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DailyAttendanceView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

}
