'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  ScanLine,
  CheckCircle,
  AlertCircle,
  User,
  UserPlus,
  FileText,
  FileSpreadsheet,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  MapPin,
  Coffee,
  Loader2,
  X,
  Download,
  Eye,
  Search,
  Filter,
} from 'lucide-react';
import { API_URL } from '../../../config/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TimesheetEntry {
  weekday: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalHours: number;
  location: string;
}

interface EmployeeMatch {
  found: boolean;
  confidence: 'exact' | 'fuzzy' | 'none';
  matchedName?: string;
  isNewEmployee: boolean;
}

interface ScanResult {
  id: string;
  employeeName: string;
  employeeId: string | null;
  employee?: { id: string; name: string };
  weekStartDate: string;
  status: string;
  entries: TimesheetEntry[];
  employeeMatch: EmployeeMatch;
  ocrWarning?: string;
  sandbox?: boolean;
}

interface TimesheetListItem {
  id: string;
  employeeName: string;
  employee?: { id: string; name: string };
  weekStartDate: string;
  status: 'PENDING_REVIEW' | 'CONFIRMED';
  totalHours: number;
  entryCount: number;
  createdAt: string;
}

type ViewMode = 'upload' | 'scanning' | 'review' | 'saved';
type ActiveTab = 'scanner' | 'list';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('accessToken');
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
  return weekdaysDe[d.getDay()];
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

function ConfidenceBadge({ confidence }: { confidence: 'exact' | 'fuzzy' | 'none' }) {
  if (confidence === 'exact') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        <CheckCircle size={10} /> Exakter Treffer
      </span>
    );
  }
  if (confidence === 'fuzzy') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
        <Search size={10} /> Ähnlicher Treffer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30">
      <UserPlus size={10} /> Nicht gefunden
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'CONFIRMED') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        <CheckCircle size={10} /> Bestätigt
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
      <Clock size={10} /> Ausstehend
    </span>
  );
}

// ─── Upload Zone ─────────────────────────────────────────────────────────────

function UploadZone({
  onFileSelect,
  isLoading,
}: {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isLoading && inputRef.current?.click()}
        className={`
          relative w-full max-w-xl cursor-pointer rounded-2xl border-2 border-dashed
          transition-all duration-300 p-14 flex flex-col items-center gap-5
          ${isDragOver
            ? 'border-blue-400 bg-blue-500/10 scale-[1.02]'
            : 'border-white/20 bg-white/5 hover:border-blue-400/60 hover:bg-white/8'
          }
        `}
      >
        <div className={`p-5 rounded-2xl transition-colors ${isDragOver ? 'bg-blue-500/20' : 'bg-white/10'}`}>
          <ScanLine size={48} className={isDragOver ? 'text-blue-400' : 'text-slate-400'} />
        </div>

        <div className="text-center">
          <p className="text-white font-semibold text-lg">
            {isDragOver ? 'Datei hier ablegen' : 'Stundenzettel hochladen'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            JPG oder PNG per Drag & Drop oder Klick auswählen
          </p>
          <p className="text-slate-500 text-xs mt-1">Maximale Dateigröße: 15 MB</p>
        </div>

        <div className="flex gap-3">
          {['JPG', 'PNG'].map((fmt) => (
            <span
              key={fmt}
              className="px-3 py-1 rounded-lg text-xs font-mono bg-white/10 text-slate-300 border border-white/10"
            >
              {fmt}
            </span>
          ))}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
          }}
        />
      </div>
    </motion.div>
  );
}

// ─── Scanning Animation ───────────────────────────────────────────────────────

function ScanningView({ fileName }: { fileName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center gap-8 py-16"
    >
      <div className="relative">
        <div className="w-24 h-24 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
          <FileText size={36} className="text-blue-400" />
        </div>
        <motion.div
          animate={{ y: ['0%', '100%', '0%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-0 right-0 h-0.5 bg-blue-400 shadow-[0_0_12px_2px_rgba(96,165,250,0.6)]"
          style={{ top: '0%' }}
        />
      </div>

      <div className="text-center">
        <div className="flex items-center gap-2 justify-center mb-2">
          <Loader2 size={18} className="text-blue-400 animate-spin" />
          <p className="text-white font-semibold">KI analysiert Stundenzettel...</p>
        </div>
        <p className="text-slate-400 text-sm">{fileName}</p>
      </div>

      <div className="flex flex-col gap-2 w-72">
        {['Bild wird verarbeitet', 'Handschrift wird erkannt', 'Mitarbeiter wird gesucht'].map(
          (step, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.5 + 0.3 }}
              className="flex items-center gap-2 text-sm text-slate-400"
            >
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5 }}
                className="w-1.5 h-1.5 rounded-full bg-blue-400"
              />
              {step}
            </motion.div>
          ),
        )}
      </div>
    </motion.div>
  );
}

// ─── Review Form ─────────────────────────────────────────────────────────────

function ReviewView({
  scanResult,
  onConfirm,
  onDiscard,
  isLoading,
}: {
  scanResult: ScanResult;
  onConfirm: (payload: any) => void;
  onDiscard: () => void;
  isLoading: boolean;
}) {
  const [entries, setEntries] = useState<TimesheetEntry[]>(() => {
    const allWeekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    return allWeekdays.map((day) => {
      const found = scanResult.entries.find((e) => e.weekday === day);
      return found ?? { weekday: day, date: '', startTime: '', endTime: '', breakMinutes: 0, totalHours: 0, location: '' };
    });
  });
  const [employeeName, setEmployeeName] = useState(scanResult.employeeName);
  const [employeeId, setEmployeeId] = useState<string>(scanResult.employeeId ?? '');
  const [createNew, setCreateNew] = useState(!scanResult.employeeMatch.found);
  const [newEmployee, setNewEmployee] = useState({
    username: '',
    phone: '',
    password: 'changeme123',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAllRows, setShowAllRows] = useState(false);

  const updateEntry = (idx: number, field: keyof TimesheetEntry, value: string | number) => {
    setEntries((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };

      if (field === 'date') {
        const computedWeekday = getGermanWeekday(value as string);
        if (computedWeekday) {
          updated[idx].weekday = computedWeekday;
        }
      }

      if (field === 'startTime' || field === 'endTime' || field === 'breakMinutes') {
        updated[idx].totalHours = calculateHours(
          updated[idx].startTime,
          updated[idx].endTime,
          Number(updated[idx].breakMinutes || 0)
        );
      }

      return updated;
    });
  };

  const totalHours = entries.reduce((sum, e) => sum + (e.totalHours || 0), 0);

  const handleConfirm = () => {
    const payload: any = {
      employeeName,
      entries: entries
        .filter((e) => e.startTime && e.endTime)
        .map((e) => ({
          weekday: e.weekday,
          date: e.date,
          startTime: e.startTime,
          endTime: e.endTime,
          breakMinutes: Number(e.breakMinutes),
          totalHours: Number(e.totalHours),
          location: e.location || '',
        })),
    };

    if (createNew) {
      if (!employeeName || !newEmployee.username || !newEmployee.phone) {
        setErrors({ general: 'Bitte alle Pflichtfelder für den neuen Mitarbeiter ausfüllen' });
        return;
      }
      payload.createNewEmployee = {
        ...newEmployee,
        name: employeeName,
      };
    } else {
      if (!employeeId) {
        setErrors({ general: 'Bitte einen Mitarbeiter auswählen' });
        return;
      }
      payload.employeeId = employeeId;
    }

    setErrors({});
    onConfirm(payload);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6 w-full"
    >
      {/* OCR Warning */}
      {scanResult.ocrWarning && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-300 text-sm">{scanResult.ocrWarning}</p>
        </div>
      )}

      {scanResult.sandbox && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
          <AlertCircle size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-blue-300 text-sm">
            <strong>Demo-Modus:</strong> Diese Daten sind Beispieldaten, da kein OpenAI-API-Key konfiguriert ist.
          </p>
        </div>
      )}

      {/* Mitarbeiter-Block */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <User size={16} className="text-blue-400" />
          Mitarbeiter-Zuordnung
        </h3>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 px-3 py-2 bg-white/8 rounded-xl border border-white/10 focus-within:border-blue-500/40 transition-colors">
            <p className="text-xs text-slate-400 mb-0.5">OCR-erkannter Name (bearbeitbar)</p>
            <input
              type="text"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              className="w-full bg-transparent text-white font-medium focus:outline-none border-b border-transparent focus:border-blue-400/40 py-0.5"
            />
          </div>
          <ConfidenceBadge confidence={scanResult.employeeMatch.confidence} />
        </div>

        {scanResult.employeeMatch.found && !createNew ? (
          <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-400" />
              <span className="text-emerald-300 text-sm">
                Mitarbeiter gefunden: <strong>{scanResult.employeeMatch.matchedName}</strong>
              </span>
            </div>
            <button
              onClick={() => setCreateNew(true)}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Anderen wählen
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setCreateNew(false)}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-all ${
                  !createNew
                    ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                <User size={14} className="inline mr-1" />
                Bestehender Mitarbeiter
              </button>
              <button
                onClick={() => setCreateNew(true)}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-all ${
                  createNew
                    ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                <UserPlus size={14} className="inline mr-1" />
                Neuen Mitarbeiter anlegen
              </button>
            </div>

            {!createNew ? (
              <input
                type="text"
                placeholder="Mitarbeiter-ID eingeben..."
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full px-3 py-2 bg-white/8 border border-white/15 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-400/60"
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'name', label: 'Vollständiger Name', placeholder: scanResult.employeeName },
                  { key: 'username', label: 'Benutzername', placeholder: 'max.mustermann' },
                  { key: 'phone', label: 'Telefonnummer', placeholder: '+49 123 456789' },
                  { key: 'password', label: 'Passwort', placeholder: 'Temporäres Passwort' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                    <input
                      type={key === 'password' ? 'password' : 'text'}
                      placeholder={placeholder}
                      value={(newEmployee as any)[key]}
                      onChange={(e) => setNewEmployee((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/8 border border-white/15 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-400/60"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stundenzettel-Tabelle */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Calendar size={16} className="text-blue-400" />
            Arbeitszeiten — {getWeekRange(scanResult.weekStartDate)}
            <span className="text-xs text-slate-400 font-normal">({getKw(scanResult.weekStartDate)})</span>
          </h3>
          <div className="text-sm font-mono text-blue-300 bg-blue-500/15 px-3 py-1 rounded-lg border border-blue-400/20">
            Gesamt: {totalHours.toFixed(2)} h
          </div>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-[120px_100px_72px_72px_80px_80px_1fr] gap-2 px-4 py-2 bg-white/5 border-b border-white/8 text-xs font-medium text-slate-400">
          <div className="flex items-center gap-1"><Clock size={10} />Wochentag</div>
          <div>Datum</div>
          <div>Von</div>
          <div>Bis</div>
          <div><Coffee size={10} className="inline mr-0.5" />Pause</div>
          <div>Gesamt</div>
          <div><MapPin size={10} className="inline mr-0.5" />Ort</div>
        </div>

        {/* Table Rows */}
        {entries.map((entry, idx) => {
          const hasData = entry.startTime !== '' || entry.endTime !== '';
          const isWeekend = idx >= 5;

          return (
            <div
              key={entry.weekday}
              className={`grid grid-cols-[120px_100px_72px_72px_80px_80px_1fr] gap-2 px-4 py-2 border-b border-white/5 transition-colors ${
                isWeekend ? 'bg-white/3' : 'hover:bg-white/4'
              } ${!hasData && !isWeekend ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    hasData ? 'bg-blue-400' : 'bg-slate-600'
                  }`}
                />
                <span className={`text-sm font-medium ${isWeekend ? 'text-slate-500' : 'text-white'}`}>
                  {entry.weekday.substring(0, 2)}
                  <span className="hidden sm:inline">{entry.weekday.substring(2)}</span>
                </span>
              </div>

              <input
                type="date"
                value={entry.date ? entry.date.split('T')[0] : ''}
                onChange={(e) => updateEntry(idx, 'date', e.target.value)}
                className="px-2 py-1 bg-white/8 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-blue-400/60 w-full"
              />

              {['startTime', 'endTime'].map((field) => (
                <input
                  key={field}
                  type="time"
                  value={(entry as any)[field]}
                  onChange={(e) => updateEntry(idx, field as keyof TimesheetEntry, e.target.value)}
                  className="px-2 py-1 bg-white/8 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-blue-400/60 w-full"
                />
              ))}

              <input
                type="number"
                min={0}
                value={entry.breakMinutes || ''}
                placeholder="0"
                onChange={(e) => updateEntry(idx, 'breakMinutes', parseInt(e.target.value) || 0)}
                className="px-2 py-1 bg-white/8 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-blue-400/60 w-full text-center"
              />

              <input
                type="number"
                step="0.05"
                min={0}
                value={entry.totalHours || ''}
                placeholder="0"
                onChange={(e) => updateEntry(idx, 'totalHours', parseFloat(e.target.value) || 0)}
                className="px-2 py-1 bg-white/8 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-blue-400/60 w-full text-center font-mono"
              />

              <input
                type="text"
                value={entry.location || ''}
                placeholder="Ort..."
                onChange={(e) => updateEntry(idx, 'location', e.target.value)}
                className="px-2 py-1 bg-white/8 border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-400/60 w-full"
              />
            </div>
          );
        })}
      </div>

      {/* Error */}
      {errors.general && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertCircle size={16} className="text-red-400" />
          <p className="text-red-300 text-sm">{errors.general}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onDiscard}
          disabled={isLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/8 border border-white/15 text-slate-300 hover:bg-white/12 hover:text-white transition-all text-sm"
        >
          <X size={16} />
          Verwerfen
        </button>
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all text-sm disabled:opacity-60"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CheckCircle size={16} />
          )}
          {isLoading ? 'Wird gespeichert...' : 'Bestätigen & Speichern'}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Success View ─────────────────────────────────────────────────────────────

function SavedView({
  timesheetId,
  employeeName,
  onScanAnother,
}: {
  timesheetId: string;
  employeeName: string;
  onScanAnother: () => void;
}) {
  const [downloading, setDownloading] = useState<'pdf' | 'xlsx' | null>(null);

  const downloadFile = async (format: 'pdf' | 'xlsx') => {
    setDownloading(format);
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/timesheets/export/${timesheetId}/${format}`, { headers });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stundenzettel-${timesheetId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 py-10"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', bounce: 0.5 }}
        className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center"
      >
        <CheckCircle size={36} className="text-emerald-400" />
      </motion.div>

      <div className="text-center">
        <h3 className="text-white text-xl font-bold mb-1">Stundenzettel gespeichert!</h3>
        <p className="text-slate-400 text-sm">
          Die Arbeitszeiten für <strong className="text-slate-300">{employeeName}</strong> wurden erfolgreich übernommen.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => downloadFile('pdf')}
          disabled={!!downloading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-400/30 text-red-300 hover:bg-red-500/25 transition-all text-sm"
        >
          {downloading === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          PDF herunterladen
        </button>
        <button
          onClick={() => downloadFile('xlsx')}
          disabled={!!downloading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/25 transition-all text-sm"
        >
          {downloading === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          Excel herunterladen
        </button>
      </div>

      <button
        onClick={onScanAnother}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all text-sm"
      >
        <ScanLine size={16} />
        Weiteren Stundenzettel scannen
      </button>
    </motion.div>
  );
}

// ─── Timesheet List ───────────────────────────────────────────────────────────

function TimesheetList() {
  const [items, setItems] = useState<TimesheetListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [downloading, setDownloading] = useState<{ id: string; fmt: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API_URL}/timesheets?${params}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      setItems(json.data ?? []);
      setLoaded(true);
    } catch {
      console.error('Failed to load timesheets');
    } finally {
      setLoading(false);
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

  const deleteItem = async (id: string) => {
    if (!confirm('Diesen Stundenzettel wirklich löschen?')) return;
    setDeleting(id);
    try {
      await fetch(`${API_URL}/timesheets/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const filtered = items.filter((item) => {
    const name = (item.employee?.name ?? item.employeeName).toLowerCase();
    return !filter || name.includes(filter.toLowerCase());
  });

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <FileText size={40} className="text-slate-600" />
        <p className="text-slate-400">Liste der gescannten Stundenzettel</p>
        <button
          onClick={loadList}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all text-sm"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {loading ? 'Lädt...' : 'Stundenzettel laden'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Nach Mitarbeiter suchen..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white/8 border border-white/15 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-400/60"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-white/8 border border-white/15 rounded-xl text-white text-sm focus:outline-none focus:border-blue-400/60"
        >
          <option value="">Alle Status</option>
          <option value="PENDING_REVIEW">Ausstehend</option>
          <option value="CONFIRMED">Bestätigt</option>
        </select>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/8 border border-white/15 rounded-xl text-slate-300 hover:text-white text-sm transition-colors"
        >
          <Filter size={14} />
          Aktualisieren
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <FileText size={32} className="mx-auto mb-3 opacity-50" />
          <p>Keine Stundenzettel gefunden</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-white font-medium text-sm truncate">
                    {item.employee?.name ?? item.employeeName}
                  </p>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-slate-400 text-xs">
                  {getWeekRange(item.weekStartDate)} · {item.entryCount} Tage · {item.totalHours.toFixed(2)} h
                </p>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {item.status === 'CONFIRMED' && (
                  <>
                    <button
                      onClick={() => downloadFile(item.id, 'pdf')}
                      disabled={downloading?.id === item.id}
                      className="p-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors"
                      title="PDF"
                    >
                      {downloading?.id === item.id && downloading.fmt === 'pdf'
                        ? <Loader2 size={14} className="animate-spin" />
                        : <FileText size={14} />}
                    </button>
                    <button
                      onClick={() => downloadFile(item.id, 'xlsx')}
                      disabled={downloading?.id === item.id}
                      className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                      title="Excel"
                    >
                      {downloading?.id === item.id && downloading.fmt === 'xlsx'
                        ? <Loader2 size={14} className="animate-spin" />
                        : <FileSpreadsheet size={14} />}
                    </button>
                  </>
                )}
                {item.status === 'PENDING_REVIEW' && (
                  <button
                    onClick={() => deleteItem(item.id)}
                    disabled={deleting === item.id}
                    className="p-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors"
                    title="Löschen"
                  >
                    {deleting === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TimesheetsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scanner');
  const [viewMode, setViewMode] = useState<ViewMode>('upload');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string>('');
  const [currentFileName, setCurrentFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (file: File) => {
    setCurrentFileName(file.name);
    setError(null);
    setViewMode('scanning');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/timesheets/scan`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Fehler beim Scannen');
      }

      const result: ScanResult = await res.json();
      setScanResult(result);
      setViewMode('review');
    } catch (e: any) {
      setError(e.message ?? 'Unbekannter Fehler');
      setViewMode('upload');
    }
  };

  const handleConfirm = async (payload: any) => {
    if (!scanResult) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/timesheets/${scanResult.id}/confirm`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Fehler beim Speichern');
      }

      const confirmed = await res.json();
      setSavedId(confirmed.id);
      setSavedName(confirmed.employee?.name ?? confirmed.employeeName);
      setViewMode('saved');
    } catch (e: any) {
      setError(e.message ?? 'Unbekannter Fehler');
    } finally {
      setIsLoading(false);
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    setSavedId(null);
    setSavedName('');
    setCurrentFileName('');
    setError(null);
    setViewMode('upload');
  };

  return (
    <div className="min-h-screen bg-[#0f1623] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-400/30">
              <ScanLine size={22} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Stundenzettel-Scanner</h1>
              <p className="text-slate-400 text-sm">
                Handgeschriebene Wochenzettel per Foto hochladen und automatisch auswerten
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10 mb-6 w-fit">
          {([
            { key: 'scanner', label: 'Scanner', icon: ScanLine },
            { key: 'list', label: 'Übersicht', icon: FileText },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === key
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'scanner' ? (
            <motion.div
              key="scanner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 mb-6">
                  <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
                  <p className="text-red-300 text-sm">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="ml-auto text-red-400 hover:text-red-200"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Step Indicator (only for upload + review) */}
              {(viewMode === 'upload' || viewMode === 'review') && (
                <div className="flex items-center gap-2 mb-6 text-xs text-slate-500">
                  {['Hochladen', 'KI-Analyse', 'Prüfen & Speichern'].map((step, i) => {
                    const stepIndex = viewMode === 'upload' ? 0 : viewMode === 'review' ? 2 : 1;
                    const isActive = i === stepIndex;
                    const isDone = i < stepIndex;
                    return (
                      <div key={step} className="flex items-center gap-2">
                        <div
                          className={`flex items-center gap-1.5 ${
                            isActive ? 'text-blue-300' : isDone ? 'text-emerald-400' : 'text-slate-600'
                          }`}
                        >
                          {isDone ? <CheckCircle size={12} /> : <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-blue-400' : 'bg-slate-600'}`} />}
                          {step}
                        </div>
                        {i < 2 && <div className="w-8 h-px bg-white/10" />}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* View States */}
              {viewMode === 'upload' && (
                <UploadZone onFileSelect={handleFileSelect} isLoading={isLoading} />
              )}
              {viewMode === 'scanning' && (
                <ScanningView fileName={currentFileName} />
              )}
              {viewMode === 'review' && scanResult && (
                <ReviewView
                  scanResult={scanResult}
                  onConfirm={handleConfirm}
                  onDiscard={resetScanner}
                  isLoading={isLoading}
                />
              )}
              {viewMode === 'saved' && savedId && (
                <SavedView
                  timesheetId={savedId}
                  employeeName={savedName}
                  onScanAnother={resetScanner}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <TimesheetList />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
