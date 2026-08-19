'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  Printer,
  Settings,
  RefreshCw,
  Hash,
  Users,
  Edit,
  Plus,
  Camera,
  Images,
  ChevronRight,
  SkipForward,
  RotateCw,
  PowerOff,
  CheckCircle2,
} from 'lucide-react';
import { API_URL } from '../../../config/api';
import CustomAlertModal, { CustomAlertOptions } from '../../components/CustomAlertModal';
import { useDialog } from '../../components/DialogProvider';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a new File object with the image physically rotated by rotationDeg.
 * Used before sending to OCR so OpenAI Vision receives the perfectly upright orientation.
 */
async function getRotatedFile(file: File, rotationDeg: number): Promise<File> {
  const normDeg = ((rotationDeg % 360) + 360) % 360;
  if (normDeg === 0 || !file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      const angle = (normDeg * Math.PI) / 180;
      const is90or270 = normDeg === 90 || normDeg === 270;
      canvas.width = is90or270 ? img.height : img.width;
      canvas.height = is90or270 ? img.width : img.height;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angle);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const rotatedFile = new File([blob], file.name, {
              type: file.type || 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(rotatedFile);
          } else {
            resolve(file);
          }
        },
        file.type || 'image/jpeg',
        0.95,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

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
  employeeId?: string | null;
  employee?: { id: string; name: string };
  weekStartDate: string;
  status: 'PENDING_REVIEW' | 'CONFIRMED';
  totalHours: number;
  entryCount: number;
  createdAt: string;
  entries?: TimesheetEntry[];
}

interface DbEmployee {
  id: string;
  name: string;
  username: string;
  role?: string;
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

type ViewMode = 'upload' | 'scanning' | 'review' | 'saved' | 'error';
type ActiveTab = 'scanner' | 'list' | 'daily';

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

function ConfidenceBadge({ confidence }: { confidence: 'exact' | 'fuzzy' | 'none' }) {
  if (confidence === 'exact') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
        <CheckCircle size={12} className="text-emerald-700" /> Exakter Treffer
      </span>
    );
  }
  if (confidence === 'fuzzy') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-colors shadow-xs">
        <Search size={12} className="text-amber-800" /> Ähnlicher Treffer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 shadow-xs">
      <UserPlus size={12} className="text-red-700" /> Nicht gefunden
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'CONFIRMED') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
        <CheckCircle size={11} className="text-emerald-700" /> Bestätigt
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-xs">
      <Clock size={11} className="text-amber-800" /> Ausstehend
    </span>
  );
}

// ─── Upload Zone & Direct Zero-Config Scanner ──────────────────────────────────

function UploadZone({
  onFileSelect,
  onFilesSelect,
  onPrinterScan,
  isLoading,
}: {
  onFileSelect: (file: File) => void;
  onFilesSelect: (files: File[]) => void;
  onPrinterScan: (settings: { scannerIp?: string; scannerPort?: number; dpi?: number }) => void;
  isLoading: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<Array<{
    id: string;
    name: string;
    displayName?: string;
    manufacturer?: string;
    model?: string;
    connectionType: string;
    ip?: string;
    port?: number;
    protocol?: string;
    status: string;
    capabilities?: any;
  }>>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<{
    id: string;
    name: string;
    displayName?: string;
    manufacturer?: string;
    connectionType: string;
    ip?: string;
    port?: number;
    hasAdf?: boolean;
  } | null>(null);

  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusResult, setStatusResult] = useState<{ online?: boolean; state?: string; model?: string; error?: string } | null>(null);
  const [showDeviceList, setShowDeviceList] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState(80);
  const [scannerDpi, setScannerDpi] = useState(300);

  const cameraRef = useRef<HTMLInputElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // ── Automatic Initial Discovery on Mount ────────────────────────────────────
  useEffect(() => {
    discoverPrinters(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discoverPrinters = async (openModalOnDone = true) => {
    setDiscovering(true);
    setStatusResult(null);
    try {
      // Try scanner endpoint
      const res = await fetch(`${API_URL}/scanner/discover`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setDiscoveredPrinters(list);

        // Auto-select first real (non-simulator) device if none selected
        if (!selectedPrinter) {
          const real = list.find((p: any) => p.ip && p.ip !== 'SIMULATOR');
          const first = real || list[0];
          if (first) {
            setSelectedPrinter({
              id:             first.id,
              name:           first.displayName || first.name,
              displayName:    first.displayName || first.name,
              manufacturer:   first.manufacturer,
              connectionType: first.connectionType || 'WIFI',
              ip:             first.ip,
              port:           first.port || 80,
              hasAdf:         first.capabilities?.hasAdf ?? first.capabilities?.adf,
            });
            setTimeout(() => checkPrinterStatus(first.ip, first.port || 80), 300);
          }
        }
        if (openModalOnDone) setShowDeviceList(true);
      }
    } catch (err) {
      console.error('Fehler bei der automatischen Druckersuche:', err);
    } finally {
      setDiscovering(false);
    }
  };

  const checkPrinterStatus = async (ip?: string, port = 80) => {
    const targetIp = ip || selectedPrinter?.ip;
    if (!targetIp || targetIp === 'SIMULATOR') {
      setStatusResult({ online: true, state: 'Bereit', model: 'Test-Scanner' });
      return;
    }
    setCheckingStatus(true);
    try {
      const params = new URLSearchParams();
      params.set('ip', targetIp);
      params.set('port', String(port || selectedPrinter?.port || 80));

      const res = await fetch(`${API_URL}/scanner/status?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setStatusResult(data);
    } catch (err: any) {
      setStatusResult({ online: false, error: err.message || 'Verbindung fehlgeschlagen' });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleSelectPrinter = (printer: any) => {
    setSelectedPrinter({
      id:             printer.id,
      name:           printer.displayName || printer.name,
      displayName:    printer.displayName || printer.name,
      manufacturer:   printer.manufacturer,
      connectionType: printer.connectionType || 'WIFI',
      ip:             printer.ip,
      port:           printer.port || 80,
      hasAdf:         printer.capabilities?.hasAdf ?? printer.capabilities?.adf,
    });
    setShowDeviceList(false);
    checkPrinterStatus(printer.ip, printer.port || 80);
  };

  const handleStartScan = () => {
    onPrinterScan({
      scannerIp:   selectedPrinter?.ip || (discoveredPrinters[0]?.ip ?? undefined),
      scannerPort: selectedPrinter?.port ?? 80,
      dpi:         scannerDpi,
    });
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter(f =>
        f.type.startsWith('image/') || f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );
      if (files.length > 1) {
        onFilesSelect(files);
      } else if (files.length === 1) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect, onFilesSelect],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6 items-center w-full"
    >
      {/* 3-Column Action Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        
        {/* 1. Direct Zero-Config Printer Scanner Action Card */}
        <div className="relative rounded-3xl border-2 border-blue-300 bg-blue-50/40 p-6 flex flex-col justify-between items-center text-center shadow-sm hover:border-blue-500 hover:shadow-md transition-all group">
          {/* Top Badge */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {statusResult && (
              <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                statusResult.online ? 'bg-emerald-600' : 'bg-red-600'
              }`} />
            )}
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-900 text-xs font-bold border border-blue-300 shadow-xs">
              <Printer size={13} className="shrink-0 text-blue-800" />
              <span>{selectedPrinter ? selectedPrinter.connectionType : 'WLAN / USB'}</span>
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-blue-100 text-blue-800 border-2 border-blue-200 mt-8 mb-4 group-hover:scale-105 transition-transform shadow-xs">
            <Printer size={40} className="text-blue-800" />
          </div>

          <div className="w-full">
            <h3 className="text-slate-900 font-bold text-lg mb-1">Vom Drucker scannen</h3>
            
            {/* Device Info or Search trigger */}
            {selectedPrinter ? (
              <div className="mb-3 space-y-1">
                <p className="text-slate-900 font-bold text-sm truncate px-2">
                  {selectedPrinter.displayName || selectedPrinter.name}
                </p>
                <p className="text-slate-600 text-xs font-medium">
                  {selectedPrinter.connectionType === 'USB' ? 'USB-Kabel' : 'WLAN AirScan / eSCL'}
                  {selectedPrinter.hasAdf && ' · ADF Einzug'}
                </p>
                {statusResult && (
                  <div className={`flex items-center justify-center gap-1 text-xs font-bold ${
                    statusResult.online ? 'text-emerald-800' : 'text-red-700'
                  }`}>
                    {statusResult.online ? (
                      <><CheckCircle size={12} className="text-emerald-700" /> Verbunden & Bereit</>
                    ) : (
                      <><AlertCircle size={12} className="text-red-600" /> {statusResult.error?.slice(0, 40) || 'Nicht erreichbar'}</>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-700 text-xs font-medium leading-relaxed mb-3">
                Automatische Erkennung aller Brother, HP, Canon, Epson & USB-Scanner im WLAN.
              </p>
            )}
          </div>

          <div className="w-full space-y-2">
            {selectedPrinter ? (
              <>
                <button
                  onClick={handleStartScan}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md transition-all text-sm disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                  <span>Jetzt scannen</span>
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => discoverPrinters(true)}
                    disabled={discovering}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold border-2 border-slate-300 transition-colors cursor-pointer shadow-xs"
                  >
                    {discovering ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    <span>Drucker suchen</span>
                  </button>
                  <button
                    onClick={() => setShowDeviceList(!showDeviceList)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold border-2 border-slate-300 transition-colors cursor-pointer shadow-xs"
                  >
                    <Settings size={12} />
                    <span>Auswahl ({discoveredPrinters.length})</span>
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => discoverPrinters(true)}
                disabled={discovering}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md transition-all text-sm disabled:opacity-50 cursor-pointer"
              >
                {discovering ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                <span>{discovering ? 'Suche im Netzwerk…' : 'Drucker im Netzwerk suchen'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. File Upload Dropzone Card */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !isLoading && inputRef.current?.click()}
          className={`
            relative cursor-pointer rounded-3xl border-2 border-dashed
            transition-all duration-300 p-6 flex flex-col justify-between items-center text-center shadow-sm
            ${isDragOver
              ? 'border-blue-600 bg-blue-50/80 scale-[1.01]'
              : 'border-slate-300 bg-slate-50 hover:border-blue-500 hover:bg-blue-50/30'
            }
          `}
        >
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200 text-slate-900 text-xs font-bold border border-slate-300 shadow-xs">
            <Upload size={12} className="text-slate-800" />
            <span>Datei-Upload</span>
          </div>

          <div className={`p-4 rounded-2xl border-2 transition-colors mt-8 mb-4 shadow-xs ${isDragOver ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-slate-200 border-slate-300 text-slate-800'}`}>
            <ScanLine size={44} className={isDragOver ? 'text-blue-800' : 'text-slate-800'} />
          </div>

          <div>
            <h3 className="text-slate-900 font-bold text-lg mb-1">
              {isDragOver ? 'Datei hier ablegen' : 'Datei / Dokument hochladen'}
            </h3>
            <p className="text-slate-700 text-xs font-medium max-w-xs mb-4">
              PNG, JPG, JPEG oder PDF per Drag & Drop ziehen oder Durchsuchen klicken.
            </p>
          </div>

          <div className="w-full">
            <div className="px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm border-2 border-slate-300 shadow-xs transition-all flex items-center justify-center gap-2">
              <Upload size={16} className="text-slate-800" />
              <span>Datei auswählen</span>
            </div>
            <p className="text-slate-600 text-[11px] font-semibold mt-2">Max. 15 MB (PNG, JPG, JPEG, PDF)</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 1) {
                onFilesSelect(files);
              } else if (files.length === 1) {
                onFileSelect(files[0]);
              }
              e.target.value = '';
            }}
          />
        </div>

        {/* 3. Camera Capture Card */}
        <div
          onClick={() => !isLoading && cameraRef.current?.click()}
          className="relative cursor-pointer rounded-3xl border-2 border-dashed border-emerald-400 bg-emerald-50/40 p-6 flex flex-col justify-between items-center text-center shadow-sm hover:border-emerald-600 hover:bg-emerald-50/70 transition-all group"
        >
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-300 shadow-xs">
            <Camera size={12} className="text-emerald-800" />
            <span>Kamera</span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-100 text-emerald-800 border-2 border-emerald-300 mt-8 mb-4 group-hover:scale-105 transition-transform shadow-xs">
            <Camera size={44} className="text-emerald-800" />
          </div>

          <div>
            <h3 className="text-slate-900 font-bold text-lg mb-1">Kamera aufnehmen</h3>
            <p className="text-slate-700 text-xs font-medium leading-relaxed max-w-xs mb-4">
              Stundenzettel direkt mit der Handy- oder Laptop-Kamera fotografieren und sofort scannen.
            </p>
          </div>

          <div className="w-full">
            <div className="px-4 py-2.5 rounded-2xl bg-white hover:bg-emerald-100 text-emerald-900 font-bold text-sm border-2 border-emerald-300 shadow-xs transition-all flex items-center justify-center gap-2">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} className="text-emerald-800" />}
              <span>Kamera öffnen</span>
            </div>
            <p className="text-slate-600 text-[11px] font-semibold mt-2">Foto, Handy oder Webcam</p>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 1) {
                onFilesSelect(files);
              } else if (files.length === 1) {
                onFileSelect(files[0]);
              }
              e.target.value = '';
            }}
          />
        </div>

      </div>

      {/* Discovered Devices Expandable List */}
      <AnimatePresence>
        {showDeviceList && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full max-w-4xl bg-white border-2 border-blue-200 rounded-3xl p-5 overflow-hidden shadow-md"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Printer className="text-blue-600" size={18} />
                <h4 className="font-bold text-slate-900 text-sm">
                  Verfügbare Geräte im lokalen Netzwerk ({discoveredPrinters.length})
                </h4>
              </div>
              <button
                onClick={() => discoverPrinters(true)}
                disabled={discovering}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer"
              >
                {discovering ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>Aktualisieren</span>
              </button>
            </div>

            {discoveredPrinters.length === 0 ? (
              <div className="py-8 text-center">
                <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-800">Keine Drucker oder Scanner gefunden</p>
                <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                  Stelle sicher, dass der Drucker eingeschaltet ist und sich dein Gerät im gleichen WLAN-Netzwerk befindet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {discoveredPrinters.map((p) => {
                  const isSelected = selectedPrinter?.id === p.id || selectedPrinter?.ip === p.ip;
                  const isUsb = p.connectionType === 'USB';
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPrinter(p)}
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/20'
                          : 'border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl border ${
                          isUsb ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-blue-100 text-blue-800 border-blue-200'
                        }`}>
                          <Printer size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">
                            {p.displayName || p.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-600">
                            <span className="font-medium">{isUsb ? 'USB-Kabel' : 'WLAN'}</span>
                            {p.ip && p.ip !== 'SIMULATOR' && (
                              <span className="font-mono text-[11px] text-slate-500">· {p.ip}</span>
                            )}
                            {(p.capabilities?.hasAdf || p.capabilities?.adf) && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">ADF</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isSelected ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-300">
                          Aktiv
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-white text-slate-700 text-xs font-bold border border-slate-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors">
                          Wählen
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Advanced / Fallback Manual IP Toggle */}
            <div className="pt-2 border-t border-slate-200 flex flex-col items-center">
              <button
                onClick={() => setShowManualFallback(!showManualFallback)}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors underline cursor-pointer"
              >
                {showManualFallback ? 'Erweiterte Einstellungen ausblenden' : 'Gerät wird nicht gefunden? Manuelle IP-Verbindung'}
              </button>

              <AnimatePresence>
                {showManualFallback && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="w-full mt-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3"
                  >
                    <p className="text-xs text-slate-600">
                      Gib die IP-Adresse des Druckers manuell ein (z.B. vom Druckerdisplay ablesen):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        placeholder="192.168.1.100"
                        value={manualIp}
                        onChange={(e) => setManualIp(e.target.value)}
                        className="flex-1 min-w-[140px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900"
                      />
                      <input
                        type="number"
                        placeholder="80"
                        value={manualPort}
                        onChange={(e) => setManualPort(parseInt(e.target.value) || 80)}
                        className="w-20 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                      />
                      <button
                        onClick={() => {
                          if (manualIp.trim()) {
                            handleSelectPrinter({
                              id: `MANUAL_${manualIp}`,
                              name: `Drucker (${manualIp})`,
                              displayName: `Drucker (${manualIp})`,
                              connectionType: 'WIFI',
                              ip: manualIp.trim(),
                              port: manualPort,
                            });
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Verbinden
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Single Photo Viewer (Sequential Queue Display) ───────────────────────────

function SinglePhotoViewer({
  fileName,
  previewUrl,
  currentIndex = 0,
  totalCount = 1,
  photoSize = 'md',
  onSizeChange,
  status = 'review',
  statusMessage,
  isPrinterScan = false,
  rotation = 0,
  onRotate,
  onReanalyze,
  isReanalyzing = false,
  onRetry,
  onSkip,
  onManualEntry,
}: {
  fileName: string;
  previewUrl?: string | null;
  currentIndex?: number;
  totalCount?: number;
  photoSize?: 'sm' | 'md' | 'lg';
  onSizeChange?: (size: 'sm' | 'md' | 'lg') => void;
  status?: 'scanning' | 'review' | 'saved' | 'error';
  statusMessage?: string;
  isPrinterScan?: boolean;
  rotation?: number;
  onRotate?: () => void;
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
  onRetry?: () => void;
  onSkip?: () => void;
  onManualEntry?: () => void;
}) {
  const currentNum = currentIndex + 1;
  const total = totalCount > 0 ? totalCount : 1;
  const size = photoSize || 'md';

  // CSS height map for preview size control (does not modify or resize the original image)
  const heightClasses = {
    sm: 'h-48 sm:h-60',
    md: 'h-64 sm:h-80 md:h-96',
    lg: 'h-96 sm:h-[480px] md:h-[560px]',
  };

  return (
    <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3 w-full">
      {/* Photo Header: Filename, Counter, Rotate, Re-analyze, and Size Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
            {isPrinterScan ? <Printer size={16} /> : <FileText size={16} />}
          </div>
          <div className="min-w-0">
            <p className="text-slate-900 font-bold text-sm sm:text-base truncate" title={fileName}>
              {fileName || `Stundenzettel_${String(currentNum).padStart(2, '0')}.jpg`}
            </p>
            <p className="text-slate-500 text-xs font-mono">
              Foto <strong className="text-blue-700 font-bold">{currentNum}</strong> von <strong className="text-slate-700">{total}</strong>
            </p>
          </div>
        </div>

        {/* Action Controls: Rotate, Re-analyze, Progress Badge & Size Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Rotate 90° Button */}
          {onRotate && (
            <button
              type="button"
              onClick={onRotate}
              disabled={isReanalyzing || status === 'scanning'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border-2 border-slate-300 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              title="Bild um 90° im Uhrzeigersinn drehen"
            >
              <RotateCw size={13} className="text-blue-600" />
              <span>Drehen</span>
              {rotation ? <span className="text-[11px] text-blue-700 font-mono">({rotation}°)</span> : null}
            </button>
          )}

          {/* Re-analyze Button */}
          {onReanalyze && (
            <button
              type="button"
              onClick={onReanalyze}
              disabled={isReanalyzing || status === 'scanning'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold border-2 border-blue-300 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              title="Dokument mit OCR & KI erneut analysieren"
            >
              {isReanalyzing ? (
                <Loader2 size={13} className="animate-spin text-blue-600" />
              ) : (
                <RefreshCw size={13} className="text-blue-600" />
              )}
              <span>{isReanalyzing ? 'Analysiere...' : 'Neu analysieren'}</span>
            </button>
          )}

          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200">
            Foto {currentNum} / {total}
          </span>

          {onSizeChange && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-300 text-xs font-semibold">
              <span className="text-[11px] text-slate-500 px-2 hidden sm:inline">Vorschau:</span>
              {(['sm', 'md', 'lg'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSizeChange(s)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    size === s
                      ? 'bg-white text-blue-700 shadow-xs font-bold border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={s === 'sm' ? 'Kleine Vorschau' : s === 'md' ? 'Mittlere Vorschau' : 'Große Vorschau'}
                >
                  {s === 'sm' ? 'Klein' : s === 'md' ? 'Mittel' : 'Groß'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Single Photo Display Container */}
      <div className={`relative w-full ${heightClasses[size]} rounded-2xl bg-slate-900/5 border border-slate-200 overflow-hidden flex items-center justify-center`}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={fileName}
            style={{ transform: `rotate(${rotation || 0}deg)` }}
            className="w-full h-full object-contain p-2 rounded-2xl select-none transition-transform duration-300 ease-out"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-slate-400 p-6 text-center">
            <FileText size={44} className="text-blue-500/60" />
            <p className="text-slate-700 font-bold text-sm">{fileName}</p>
            <p className="text-xs text-slate-500 font-mono">
              {isPrinterScan ? 'Netzwerkdrucker-Dokument erfasst' : 'Dokument wird verarbeitet'}
            </p>
          </div>
        )}

        {/* Scanning Laser Animation Overlay */}
        {status === 'scanning' && (
          <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px] flex flex-col items-center justify-center p-4">
            <motion.div
              animate={{ y: ['-120%', '120%'] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
              className="absolute left-0 right-0 h-1 bg-blue-500 shadow-[0_0_16px_3px_rgba(59,130,246,0.8)]"
              style={{ top: '50%' }}
            />
            <div className="bg-white/95 px-4 py-3 rounded-2xl shadow-lg border border-blue-200 flex items-center gap-3 z-10">
              <Loader2 size={20} className="animate-spin text-blue-600 shrink-0" />
              <div>
                <p className="text-slate-900 font-bold text-sm">Dokument wird analysiert...</p>
                <p className="text-slate-500 text-xs font-mono">Foto {currentNum} von {total} • Bitte warten</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Overlay with Retry / Skip / Manual Entry */}
        {status === 'error' && (
          <div className="absolute inset-0 bg-red-950/75 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center z-10">
            <div className="bg-white p-5 rounded-3xl shadow-xl border-2 border-red-300 max-w-md w-full space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
              </div>
              <div>
                <h4 className="text-slate-900 font-bold text-base">Analyse fehlgeschlagen</h4>
                <p className="text-slate-600 text-xs mt-1">
                  {statusMessage || 'Dieses Dokument konnte nicht automatisch analysiert werden.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="flex-1 min-w-[120px] py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <RefreshCw size={13} />
                    Wiederholen
                  </button>
                )}
                {onSkip && (
                  <button
                    type="button"
                    onClick={onSkip}
                    className="flex-1 min-w-[120px] py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border border-slate-300"
                  >
                    <SkipForward size={13} />
                    Foto überspringen
                  </button>
                )}
                {onManualEntry && (
                  <button
                    type="button"
                    onClick={onManualEntry}
                    className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border border-amber-300"
                  >
                    <Edit size={13} />
                    Manuell für dieses Foto ausfüllen
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Scanning View (Single Photo Viewer + Progress) ───────────────────────────

function ScanningView({
  fileName,
  previewUrl,
  isPrinterScan,
  currentIndex = 0,
  totalCount = 1,
  photoSize = 'md',
  onSizeChange,
  rotation = 0,
}: {
  fileName: string;
  previewUrl?: string | null;
  isPrinterScan?: boolean;
  currentIndex?: number;
  totalCount?: number;
  photoSize?: 'sm' | 'md' | 'lg';
  onSizeChange?: (size: 'sm' | 'md' | 'lg') => void;
  rotation?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-5 my-2 w-full"
    >
      {/* 1. Single Photo Viewer with Active Scan Beam */}
      <SinglePhotoViewer
        fileName={fileName}
        previewUrl={previewUrl}
        currentIndex={currentIndex}
        totalCount={totalCount}
        photoSize={photoSize}
        onSizeChange={onSizeChange}
        status="scanning"
        isPrinterScan={isPrinterScan}
        rotation={rotation}
      />

      {/* 2. Scanning Steps Box */}
      <div className="flex flex-col gap-2.5 w-full max-w-md mx-auto bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-xs">
        {[
          isPrinterScan ? 'Empfange Bild vom Netzwerkdrucker' : 'Bild wird verarbeitet & optimiert',
          'Handschrift & Zeiten werden per KI erkannt',
          'Mitarbeiter wird in Datenbank gesucht',
        ].map((step, i) => (
          <motion.div
            key={step}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.4 + 0.2 }}
            className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 font-medium"
          >
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.4 }}
              className="w-2 h-2 rounded-full bg-blue-600 shrink-0"
            />
            {step}
          </motion.div>
        ))}
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
  currentFileName,
  currentPreviewUrl,
  queueIndex = 0,
  totalQueueCount = 1,
  photoSize = 'md',
  onPhotoSizeChange,
  isLastInQueue = true,
  rotation = 0,
  onRotate,
  onReanalyze,
  isReanalyzing = false,
}: {
  scanResult: ScanResult;
  onConfirm: (payload: any) => void;
  onDiscard: () => void;
  isLoading: boolean;
  currentFileName?: string;
  currentPreviewUrl?: string | null;
  queueIndex?: number;
  totalQueueCount?: number;
  photoSize?: 'sm' | 'md' | 'lg';
  onPhotoSizeChange?: (size: 'sm' | 'md' | 'lg') => void;
  isLastInQueue?: boolean;
  rotation?: number;
  onRotate?: () => void;
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
}) {
  const allWeekdays = useMemo(() => ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'], []);
  const [employeeName, setEmployeeName] = useState(scanResult.employeeName);
  const [weekStartDate, setWeekStartDate] = useState(scanResult.weekStartDate);

  // Initialize all 7 calendar week days (Montag - Sonntag)
  const [entries, setEntries] = useState<TimesheetEntry[]>(() => {
    const baseDate = new Date(scanResult.weekStartDate || new Date());
    return allWeekdays.map((day, i) => {
      const targetDate = new Date(baseDate);
      targetDate.setUTCDate(targetDate.getUTCDate() + i);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      const found = scanResult.entries?.find(
        (e) => e.weekday?.toLowerCase() === day.toLowerCase() || e.date?.startsWith(targetDateStr)
      );

      if (found) {
        const hasTime = Boolean(found.startTime?.trim());
        const isActive = (found as any).isActive !== undefined ? (found as any).isActive : hasTime;
        return {
          id: found.id,
          weekday: day,
          date: found.date ? found.date.split('T')[0] : targetDateStr,
          startTime: found.startTime || '',
          endTime: found.endTime || '',
          breakMinutes: Number(found.breakMinutes) || 0,
          totalHours: isActive ? (Number(found.totalHours) || 0) : 0,
          location: found.location || '',
          isActive,
        };
      }

      return {
        weekday: day,
        date: targetDateStr,
        startTime: '',
        endTime: '',
        breakMinutes: 0,
        totalHours: 0,
        location: '',
        isActive: false,
      };
    });
  });

  // Re-sync when scanResult updates (e.g. after Re-analyze) without deleting manual entries
  useEffect(() => {
    if (!scanResult) return;
    if (scanResult.employeeName) setEmployeeName(scanResult.employeeName);
    if (scanResult.weekStartDate) setWeekStartDate(scanResult.weekStartDate);
    if (scanResult.employeeId) setEmployeeId(scanResult.employeeId);

    const baseDate = new Date(scanResult.weekStartDate || new Date());
    setEntries((prev) => {
      return allWeekdays.map((day, i) => {
        const targetDate = new Date(baseDate);
        targetDate.setUTCDate(targetDate.getUTCDate() + i);
        const targetDateStr = targetDate.toISOString().slice(0, 10);

        const found = scanResult.entries?.find(
          (e) => e.weekday?.toLowerCase() === day.toLowerCase() || e.date?.startsWith(targetDateStr)
        );
        const prevEntry = prev.find((p) => p.weekday === day);

        if (found && found.startTime?.trim()) {
          const isActive = (found as any).isActive !== undefined ? (found as any).isActive : true;
          return {
            id: found.id,
            weekday: day,
            date: found.date ? found.date.split('T')[0] : targetDateStr,
            startTime: found.startTime || '',
            endTime: found.endTime || '',
            breakMinutes: Number(found.breakMinutes) || 0,
            totalHours: isActive ? (Number(found.totalHours) || 0) : 0,
            location: found.location || prevEntry?.location || '',
            isActive,
          };
        } else if (prevEntry) {
          return {
            ...prevEntry,
            date: targetDateStr,
          };
        }

        return {
          weekday: day,
          date: targetDateStr,
          startTime: '',
          endTime: '',
          breakMinutes: 0,
          totalHours: 0,
          location: '',
          isActive: false,
        };
      });
    });
  }, [scanResult, allWeekdays]);

  // When week start date is changed by the user, update the dates of all 7 days
  const handleWeekStartDateChange = (newDateStr: string) => {
    setWeekStartDate(newDateStr);
    if (!newDateStr) return;
    const baseDate = new Date(newDateStr);
    if (isNaN(baseDate.getTime())) return;

    setEntries((prev) =>
      prev.map((e, i) => {
        const dayDate = new Date(baseDate);
        dayDate.setUTCDate(dayDate.getUTCDate() + i);
        return {
          ...e,
          date: dayDate.toISOString().slice(0, 10),
        };
      })
    );
  };

  // Toggle active/inactive state for any day independently
  const toggleDayActive = (idx: number) => {
    setEntries((prev) => {
      const updated = [...prev];
      const current = updated[idx];
      const nextActive = !current.isActive;
      updated[idx] = {
        ...current,
        isActive: nextActive,
        totalHours: nextActive
          ? calculateHours(current.startTime || '', current.endTime || '', Number(current.breakMinutes || 0))
          : 0,
      };
      return updated;
    });
  };

  const [employeeId, setEmployeeId] = useState<string>(scanResult.employeeId ?? '');
  const [createNew, setCreateNew] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    username: '',
    phone: '',
    password: 'changeme123',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showEmployeeSelector, setShowEmployeeSelector] = useState(
    !scanResult.employeeMatch.found
  );

  const [dbEmployees, setDbEmployees] = useState<DbEmployee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const employeeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isDropdownOpen]);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await fetch(`${API_URL}/employees?limit=100`, { headers: getAuthHeaders() });
        if (res.ok) {
          const json = await res.json();
          const list = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
          list.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" }));
          setDbEmployees(list);
        }
      } catch (e) {
        console.error('Fehler beim Laden der Mitarbeiterliste', e);
      }
    };
    fetchEmployees();
  }, []);

  const [availableHalls, setAvailableHalls] = useState<{ id: string; name: string; warehouseId?: string }[]>([]);
  const [openHallDropdown, setOpenHallDropdown] = useState<number | null>(null);
  const hallDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openHallDropdown === null) return;
    const handleOutside = (e: MouseEvent) => {
      if (hallDropdownRef.current && !hallDropdownRef.current.contains(e.target as Node)) {
        setOpenHallDropdown(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenHallDropdown(null);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openHallDropdown]);

  useEffect(() => {
    const fetchHalls = async () => {
      try {
        const res = await fetch(`${API_URL}/halls`, { headers: getAuthHeaders() });
        if (res.ok) {
          const json = await res.json();
          setAvailableHalls(Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []));
        }
      } catch (e) {
        console.error('Fehler beim Laden der Hallen', e);
      }
    };
    fetchHalls();
  }, []);

  const filteredEmployees = useMemo(() =>
    dbEmployees.filter((emp) =>
      emp.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      emp.username?.toLowerCase().includes(employeeSearch.toLowerCase())
    ),
    [dbEmployees, employeeSearch]
  );

  const selectedEmployeeObj = useMemo(
    () => dbEmployees.find((e) => e.id === employeeId),
    [dbEmployees, employeeId]
  );

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
        if (updated[idx].isActive !== false) {
          updated[idx].totalHours = calculateHours(
            updated[idx].startTime,
            updated[idx].endTime || '',
            Number(updated[idx].breakMinutes || 0)
          );
        }
      }

      return updated;
    });
  };

  const totalHours = entries
    .filter((e) => e.isActive !== false)
    .reduce((sum, e) => sum + (e.totalHours || 0), 0);

  const activeDaysCount = entries.filter((e) => e.isActive !== false).length;

  const handleConfirm = () => {
    const payload: any = {
      employeeName,
      weekStartDate,
      entries: entries.map((e) => ({
        weekday: e.weekday,
        date: e.date,
        startTime: e.startTime || '',
        endTime: e.endTime || undefined,
        breakMinutes: Number(e.breakMinutes) || 0,
        totalHours: e.isActive !== false ? (Number(e.totalHours) || 0) : 0,
        location: e.location || '',
        isActive: e.isActive !== false,
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
      delete payload.employeeId;
    } else {
      if (!employeeId) {
        setErrors({ general: 'Bitte einen Mitarbeiter aus der Datenbank auswählen oder einen neuen anlegen.' });
        return;
      }
      payload.employeeId = employeeId;
      delete payload.createNewEmployee;
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
      {/* 1. Single Photo Viewer for Current Document with Rotate & Re-analyze */}
      <SinglePhotoViewer
        fileName={currentFileName || scanResult.employeeName || `Stundenzettel_${String(queueIndex + 1).padStart(2, '0')}.jpg`}
        previewUrl={currentPreviewUrl}
        currentIndex={queueIndex}
        totalCount={totalQueueCount}
        photoSize={photoSize}
        onSizeChange={onPhotoSizeChange}
        status="review"
        rotation={rotation}
        onRotate={onRotate}
        onReanalyze={onReanalyze}
        isReanalyzing={isReanalyzing}
      />

      {/* OCR Warning */}
      {scanResult.ocrWarning && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 shadow-xs">
          <AlertCircle size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <p className="text-amber-900 text-sm font-medium">{scanResult.ocrWarning}</p>
        </div>
      )}

      {scanResult.sandbox && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border-2 border-blue-300 text-blue-900 shadow-xs">
          <AlertCircle size={20} className="text-blue-700 flex-shrink-0 mt-0.5" />
          <p className="text-blue-900 text-sm">
            <strong>Demo-Modus:</strong> Diese Daten sind Beispieldaten.
          </p>
        </div>
      )}

      {/* Mitarbeiter-Block */}
      <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-6 shadow-sm">
        <h3 className="text-slate-900 font-bold text-base mb-4 flex items-center gap-2">
          <User size={18} className="text-blue-600" />
          Mitarbeiter-Zuordnung
        </h3>

        <div className="flex flex-wrap items-start gap-3 mb-4">
          <div className="flex-1 min-w-0 px-3.5 py-2.5 bg-slate-50 rounded-xl border-2 border-slate-300 focus-within:border-blue-600 focus-within:bg-white transition-colors shadow-xs">
            <p className="text-xs text-slate-600 font-semibold mb-0.5">OCR-erkannter Name (bearbeitbar)</p>
            <input
              type="text"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              className="w-full bg-transparent text-slate-900 font-bold text-base focus:outline-none border-b-2 border-transparent focus:border-blue-600 py-0.5"
            />
          </div>
          <ConfidenceBadge confidence={scanResult.employeeMatch.confidence} />
        </div>

        {/* Auto-detected match banner — always shows a Change button */}
        {scanResult.employeeMatch.found && !showEmployeeSelector ? (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-emerald-50 border-2 border-emerald-300 rounded-xl">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle size={18} className="text-emerald-700 shrink-0" />
              <span className="text-emerald-900 text-sm font-medium truncate">
                Erkannt: <strong className="font-bold text-emerald-950">{selectedEmployeeObj?.name || scanResult.employeeMatch.matchedName}</strong>
              </span>
            </div>
            <button
              onClick={() => { setShowEmployeeSelector(true); setCreateNew(false); }}
              className="text-xs text-emerald-800 hover:text-emerald-950 font-bold underline transition-colors cursor-pointer shrink-0"
            >
              Anderen wählen
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mode tabs: existing vs. new */}
            <div className="flex gap-2">
              <button
                onClick={() => setCreateNew(false)}
                className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-bold border-2 transition-all cursor-pointer ${
                  !createNew
                    ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <User size={14} className="inline mr-1" />
                Bestehender Mitarbeiter
              </button>
              <button
                onClick={() => setCreateNew(true)}
                className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-bold border-2 transition-all cursor-pointer ${
                  createNew
                    ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <UserPlus size={14} className="inline mr-1" />
                Neuen Mitarbeiter anlegen
              </button>
            </div>

            {!createNew ? (
              /* Searchable Mitarbeiter Dropdown */
              <div className="relative" ref={employeeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen((o) => !o)}
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-slate-900 text-sm flex items-center justify-between cursor-pointer hover:border-blue-600 transition-colors shadow-xs"
                >
                  {selectedEmployeeObj ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-xs font-bold border border-blue-200 shrink-0">
                        #{dbEmployees.findIndex(e => e.id === selectedEmployeeObj.id) + 1}
                      </span>
                      <span className="font-bold text-slate-900 truncate">{selectedEmployeeObj.name}</span>
                    </span>
                  ) : (
                    <span className="text-slate-500 font-medium">Mitarbeiter suchen oder wählen...</span>
                  )}
                  <ChevronDown size={16} className="text-slate-500 shrink-0" />
                </button>

                {isDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-2 border-slate-300 rounded-2xl shadow-2xl overflow-hidden p-2">
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Name suchen..."
                        value={employeeSearch}
                        onChange={(e) => setEmployeeSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredEmployees.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-3">Kein Mitarbeiter gefunden</p>
                      ) : (
                        filteredEmployees.map((emp, index) => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEmployeeId(emp.id);
                              setEmployeeName(emp.name);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                              employeeId === emp.id ? 'bg-blue-600 text-white font-bold' : 'text-slate-800 hover:bg-slate-100'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] shrink-0 ${employeeId === emp.id ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                                #{index + 1}
                              </span>
                              <span className="font-semibold truncate">{emp.name}</span>
                            </span>
                            <span className={`text-[10px] shrink-0 ${employeeId === emp.id ? 'text-blue-100' : 'text-slate-400'}`}>@{emp.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'name', label: 'Vollständiger Name', placeholder: scanResult.employeeName },
                  { key: 'username', label: 'Benutzername', placeholder: 'max.mustermann' },
                  { key: 'phone', label: 'Telefonnummer', placeholder: '+49 123 456789' },
                  { key: 'password', label: 'Passwort', placeholder: 'Temporäres Passwort' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs text-slate-700 font-bold mb-1 block">{label}</label>
                    <input
                      type={key === 'password' ? 'password' : 'text'}
                      placeholder={placeholder}
                      value={(newEmployee as any)[key]}
                      onChange={(e) => setNewEmployee((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border-2 border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-blue-600 shadow-xs font-medium"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 7-Day Weekly Timesheet Table (With Active/Inactive Day Toggles) ── */}
      <div className="bg-white border-2 border-slate-300 rounded-3xl overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 bg-slate-50 border-b-2 border-slate-300">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-slate-900 font-bold flex items-center gap-2 text-base">
              <Calendar size={18} className="text-blue-600" />
              Wochenzeitraum (7 Tage):
            </h3>
            <input
              type="date"
              value={weekStartDate ? weekStartDate.split('T')[0] : ''}
              onChange={(e) => handleWeekStartDateChange(e.target.value)}
              className="px-3 py-1.5 bg-white border-2 border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono font-bold shadow-xs"
            />
            <span className="text-xs text-slate-600 font-bold font-mono">({getKw(weekStartDate)})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 font-medium hidden sm:inline">
              {activeDaysCount} von 7 Tagen aktiv
            </span>
            <div className="text-sm font-mono font-bold text-blue-900 bg-blue-100 px-3.5 py-1.5 rounded-xl border border-blue-300 shadow-xs">
              Gesamt: {totalHours.toFixed(2)} h
            </div>
          </div>
        </div>

        {/* Responsive table — horizontal scroll on mobile */}
        <div className="overflow-x-auto w-full">
          <div className="min-w-[840px]">
            {/* Table Header */}
            <div className="grid grid-cols-[32px_95px_95px_120px_80px_80px_65px_70px_1fr] gap-1.5 px-3 py-3 bg-slate-100 border-b-2 border-slate-300 text-xs font-bold text-slate-700 uppercase tracking-wider items-center">
              <div className="font-mono text-center">#</div>
              <div className="text-center">Status</div>
              <div className="flex items-center gap-1"><Clock size={11} />Wochentag</div>
              <div>Datum</div>
              <div>Von</div>
              <div>Bis</div>
              <div className="text-center"><Coffee size={11} className="inline mr-0.5" />Pause</div>
              <div className="text-center">Gesamt</div>
              <div className="flex items-center gap-1"><MapPin size={11} className="inline mr-0.5" />Halle(n)</div>
            </div>

            {/* Table Rows: 7 Calendar Days */}
            {entries.map((entry, idx) => {
              const isEntryActive = entry.isActive !== false;
              const isWeekend = idx >= 5;

              return (
                <div
                  key={entry.weekday}
                  className={`grid grid-cols-[32px_95px_95px_120px_80px_80px_65px_70px_1fr] gap-1.5 px-3 py-2.5 border-b border-slate-200 transition-colors items-center ${
                    !isEntryActive
                      ? 'bg-slate-100/60 opacity-60'
                      : isWeekend
                      ? 'bg-slate-50/80 hover:bg-blue-50/30'
                      : 'bg-white hover:bg-blue-50/40'
                  }`}
                >
                  {/* Row index badge */}
                  <div className="font-mono text-xs font-bold text-slate-700 text-center bg-slate-100 py-1 px-1 rounded border border-slate-300 shadow-xs">
                    {idx + 1}
                  </div>

                  {/* Day Status Active/Inactive Toggle Button */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleDayActive(idx)}
                      className={`w-full py-1 px-2 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        isEntryActive
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 shadow-2xs'
                          : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
                      }`}
                      title={isEntryActive ? 'Tag ist AKTIV (Klicken zum Deaktivieren)' : 'Tag ist INAKTIV (Klicken zum Aktivieren)'}
                    >
                      {isEntryActive ? (
                        <>
                          <CheckCircle2 size={12} className="text-emerald-700" />
                          <span>Aktiv</span>
                        </>
                      ) : (
                        <>
                          <PowerOff size={11} className="text-slate-500" />
                          <span>Inaktiv</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Weekday */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isEntryActive ? 'bg-blue-600' : 'bg-slate-300'}`} />
                    <span className={`text-xs font-bold truncate ${isEntryActive ? 'text-slate-900' : 'text-slate-500'}`}>
                      {entry.weekday}
                    </span>
                  </div>

                  {/* Date Input */}
                  <input
                    type="date"
                    disabled={!isEntryActive}
                    value={entry.date ? entry.date.split('T')[0] : ''}
                    onChange={(e) => updateEntry(idx, 'date', e.target.value)}
                    className="px-2 py-1.5 bg-white border-2 border-slate-300 rounded-lg text-xs text-slate-900 font-semibold focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed w-full shadow-xs"
                  />

                  {/* Start Time */}
                  <input
                    type="time"
                    disabled={!isEntryActive}
                    value={entry.startTime}
                    onChange={(e) => updateEntry(idx, 'startTime', e.target.value)}
                    className="px-2 py-1.5 bg-white border-2 border-slate-300 rounded-lg text-xs text-slate-900 font-semibold focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed w-full shadow-xs"
                  />

                  {/* End Time */}
                  <input
                    type="time"
                    disabled={!isEntryActive}
                    value={entry.endTime || ''}
                    onChange={(e) => updateEntry(idx, 'endTime', e.target.value)}
                    className="px-2 py-1.5 bg-white border-2 border-slate-300 rounded-lg text-xs text-slate-900 font-semibold focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed w-full shadow-xs"
                  />

                  {/* Break */}
                  <input
                    type="number"
                    min={0}
                    disabled={!isEntryActive}
                    value={entry.breakMinutes ?? ''}
                    placeholder="0"
                    onChange={(e) => updateEntry(idx, 'breakMinutes', parseInt(e.target.value) || 0)}
                    className="px-1.5 py-1.5 bg-white border-2 border-slate-300 rounded-lg text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed w-full text-center shadow-xs"
                  />

                  {/* Total Hours */}
                  <div className={`text-xs font-mono font-bold text-center ${isEntryActive ? 'text-blue-900' : 'text-slate-400'}`}>
                    {isEntryActive ? `${(entry.totalHours || 0).toFixed(2)}h` : '—'}
                  </div>

                  {/* Multi-Hall Selector */}
                  <div className="relative" ref={openHallDropdown === idx ? hallDropdownRef : undefined}>
                    {/* Selected halls as chips */}
                    <button
                      type="button"
                      disabled={!isEntryActive}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEntryActive) setOpenHallDropdown(openHallDropdown === idx ? null : idx);
                      }}
                      className="w-full flex flex-wrap gap-1 min-h-[30px] px-2 py-1 bg-white border-2 border-slate-300 rounded-lg cursor-pointer hover:border-blue-600 transition-colors shadow-xs items-center text-left disabled:bg-slate-100 disabled:border-slate-200 disabled:cursor-not-allowed"
                    >
                      {entry.location
                        ? entry.location.split(',').filter(Boolean).map((h) => h.trim()).map((hallName, hIdx) => (
                            <span
                              key={hIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-[10px] font-bold border border-blue-300"
                            >
                              <MapPin size={9} />
                              {hallName}
                              {isEntryActive && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const halls = entry.location.split(',').map(h => h.trim()).filter(Boolean);
                                    const updated = halls.filter((_, i) => i !== hIdx);
                                    updateEntry(idx, 'location', updated.join(', '));
                                  }}
                                  className="ml-0.5 text-blue-700 hover:text-blue-950 font-bold"
                                >
                                  <X size={9} />
                                </button>
                              )}
                            </span>
                          ))
                        : <span className="text-slate-400 text-[10px] font-medium self-center">{isEntryActive ? 'Halle(n) wählen...' : '—'}</span>
                      }
                      {isEntryActive && <span className="ml-auto text-slate-500 self-center"><ChevronDown size={12} /></span>}
                    </button>

                    {/* Hall dropdown */}
                    {openHallDropdown === idx && isEntryActive && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-2 border-slate-300 rounded-2xl shadow-2xl overflow-hidden p-2 max-h-48 overflow-y-auto">
                        {availableHalls.length === 0 ? (
                          <p className="text-xs text-slate-500 text-center py-2">Keine Hallen gefunden</p>
                        ) : (
                          availableHalls.map((hall) => {
                            const selectedNames = entry.location ? entry.location.split(',').map(h => h.trim()).filter(Boolean) : [];
                            const isSelected = selectedNames.includes(hall.name);
                            return (
                              <button
                                key={hall.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const currentHalls = entry.location ? entry.location.split(',').map(h => h.trim()).filter(Boolean) : [];
                                  const newHalls = isSelected
                                    ? currentHalls.filter(h => h !== hall.name)
                                    : [...currentHalls, hall.name];
                                  updateEntry(idx, 'location', newHalls.join(', '));
                                  if (!isSelected) setOpenHallDropdown(null);
                                }}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors text-left ${
                                  isSelected ? 'bg-blue-600 text-white font-bold' : 'text-slate-800 hover:bg-slate-100 font-medium'
                                }`}
                              >
                                <MapPin size={11} className={isSelected ? 'text-white' : 'text-blue-600'} />
                                {hall.name}
                                {isSelected && <span className="ml-auto text-[10px] font-bold text-white">✓</span>}
                              </button>
                            );
                          })
                        )}
                        <div className="pt-1.5 border-t border-slate-200">
                          <input
                            type="text"
                            placeholder="Oder Freitext (z.B. Außenbereich)..."
                            value={entry.location || ''}
                            onChange={(e) => updateEntry(idx, 'location', e.target.value)}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {errors.general && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-red-50 border-2 border-red-300 shadow-xs">
          <AlertCircle size={18} className="text-red-600 shrink-0" />
          <p className="text-red-800 text-sm font-bold">{errors.general}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={onDiscard}
          disabled={isLoading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-slate-100 border-2 border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900 font-bold transition-all text-sm shadow-xs cursor-pointer"
        >
          <X size={16} />
          {totalQueueCount > 1 && !isLastInQueue ? 'Foto überspringen' : 'Verwerfen'}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isLoading}
          className="w-full sm:flex-1 min-w-0 flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all text-sm shadow-md disabled:opacity-60 cursor-pointer"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CheckCircle size={16} />
          )}
          <span>
            {isLoading
              ? 'Wird gespeichert...'
              : totalQueueCount > 1 && !isLastInQueue
              ? `Bestätigen & Weiter zu Foto ${queueIndex + 2}`
              : 'Bestätigen & Speichern'}
          </span>
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
  hasQueue,
  isLastInQueue,
  queueIndex = 0,
  totalCount = 1,
  onContinueNext,
}: {
  timesheetId: string;
  employeeName: string;
  onScanAnother: () => void;
  hasQueue?: boolean;
  isLastInQueue?: boolean;
  queueIndex?: number;
  totalCount?: number;
  onContinueNext?: () => void;
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
      className="flex flex-col items-center gap-6 py-12 bg-white border-2 border-slate-300 rounded-3xl p-8 shadow-sm my-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', bounce: 0.5 }}
        className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center shadow-xs"
      >
        <CheckCircle size={36} className="text-emerald-700" />
      </motion.div>

      <div className="text-center">
        <h3 className="text-slate-900 text-2xl font-bold mb-1">
          {hasQueue && !isLastInQueue
            ? `Foto ${queueIndex + 1} von ${totalCount} gespeichert!`
            : 'Stundenzettel gespeichert!'}
        </h3>
        <p className="text-slate-600 text-sm">
          Die Arbeitszeiten für <strong className="text-slate-900 font-bold">{employeeName}</strong> wurden erfolgreich übernommen.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={() => downloadFile('pdf')}
          disabled={!!downloading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border-2 border-red-200 text-red-700 hover:bg-red-100 font-bold transition-all text-sm shadow-xs cursor-pointer"
        >
          {downloading === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          PDF herunterladen
        </button>
        <button
          onClick={() => downloadFile('xlsx')}
          disabled={!!downloading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-bold transition-all text-sm shadow-xs cursor-pointer"
        >
          {downloading === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          Excel herunterladen
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        {hasQueue && !isLastInQueue && onContinueNext ? (
          <button
            onClick={onContinueNext}
            className="flex items-center justify-center gap-2 px-7 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all text-sm shadow-md cursor-pointer"
          >
            <span>Weiter zu Foto {queueIndex + 2} von {totalCount}</span>
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={onScanAnother}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all text-sm shadow-md cursor-pointer"
          >
            <ScanLine size={16} />
            Weiteren Stundenzettel scannen
          </button>
        )}
      </div>
    </motion.div>
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('scanner');
  const [viewMode, setViewMode] = useState<ViewMode>('upload');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string>('');
  const [currentFileName, setCurrentFileName] = useState('');
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [isPrinterScan, setIsPrinterScan] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshListKey, setRefreshListKey] = useState(0);

  // Rotation and re-analysis states
  const [rotation, setRotation] = useState<number>(0);
  const [isReanalyzing, setIsReanalyzing] = useState<boolean>(false);

  // ── Multi-photo queue ────────────────────────────────────────────────────────
  type QueueStatus = 'waiting' | 'scanning' | 'review' | 'done' | 'error' | 'skipped';
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueStatuses, setQueueStatuses] = useState<QueueStatus[]>([]);

  const hasQueue = fileQueue.length > 1;
  const isLastInQueue = queueIndex >= fileQueue.length - 1;

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (currentPreviewUrl && currentPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
    };
  }, [currentPreviewUrl]);

  // Mark status of a specific queue item
  const markStatus = (idx: number, status: QueueStatus) =>
    setQueueStatuses(prev => { const next = [...prev]; next[idx] = status; return next; });

  // Start a queue of files — process the first one immediately
  const handleFilesSelect = (files: File[]) => {
    const validFiles = files.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (validFiles.length === 0) return;
    setFileQueue(validFiles);
    setQueueIndex(0);
    setRotation(0);
    setQueueStatuses(validFiles.map(() => 'waiting'));
    processSingleFile(validFiles[0], 0, validFiles);
  };

  // Skip current photo and advance to next
  const skipCurrent = () => {
    markStatus(queueIndex, 'skipped');
    advanceQueue(fileQueue, queueIndex + 1);
  };

  // Retry the current photo
  const retryCurrent = () => {
    if (fileQueue[queueIndex]) {
      processSingleFile(fileQueue[queueIndex], queueIndex, fileQueue);
    } else if (isPrinterScan) {
      handlePrinterScan({});
    }
  };

  // Rotate preview angle in 90 degree increments
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Re-analyze current photo with correctly oriented image
  const handleReanalyze = async () => {
    if (isReanalyzing) return;
    setIsReanalyzing(true);
    setError(null);

    try {
      const currentFile = fileQueue[queueIndex];
      if (currentFile) {
        // If rotated, produce a real rotated JPEG via Canvas before sending to OCR
        const fileToSend = rotation % 360 !== 0
          ? await getRotatedFile(currentFile, rotation)
          : currentFile;

        const formData = new FormData();
        formData.append('file', fileToSend);

        const res = await fetch(`${API_URL}/timesheets/scan`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? 'Fehler bei der erneuten Analyse');
        }

        const result: ScanResult = await res.json();
        setScanResult(result);
      } else if (isPrinterScan) {
        await handlePrinterScan({});
      }
    } catch (e: any) {
      setError(e.message ?? 'Neu-Analyse fehlgeschlagen');
    } finally {
      setIsReanalyzing(false);
    }
  };

  // Fallback: Manually fill out the timesheet for this photo if OCR fails
  const manualEntryForCurrent = () => {
    setScanResult({
      id: 'manual-' + Date.now(),
      employeeName: '',
      employeeId: null,
      weekStartDate: new Date().toISOString().slice(0, 10),
      status: 'PENDING_REVIEW',
      entries: [],
      employeeMatch: { found: false, confidence: 'none', isNewEmployee: true },
    });
    setViewMode('review');
  };

  // Advance to the next item in the queue
  const advanceQueue = (queue: File[], nextIdx: number) => {
    setRotation(0);
    if (nextIdx >= queue.length) {
      // All done — show upload zone
      setScanResult(null);
      setViewMode('upload');
      return;
    }
    setQueueIndex(nextIdx);
    processSingleFile(queue[nextIdx], nextIdx, queue);
  };

  // Process a single file: scan it and go to review
  const processSingleFile = async (file: File, idx: number, queue: File[]) => {
    setCurrentFileName(file.name);
    setIsPrinterScan(false);
    setError(null);
    setViewMode('scanning');
    markStatus(idx, 'scanning');
    setRotation(0);

    // Create preview URL for the single current photo
    try {
      if (currentPreviewUrl && currentPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setCurrentPreviewUrl(url);
      } else {
        setCurrentPreviewUrl(null);
      }
    } catch {
      setCurrentPreviewUrl(null);
    }

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
      markStatus(idx, 'review');
      setViewMode('review');
    } catch (e: any) {
      markStatus(idx, 'error');
      setError(e.message ?? 'Dokument konnte nicht analysiert werden.');
      // Stay on single photo viewer with clear Retry / Skip controls
      setViewMode('error');
    }
  };

  // File-upload Handler (single file)
  const handleFileSelect = async (file: File) => {
    setFileQueue([file]);
    setQueueIndex(0);
    setRotation(0);
    setQueueStatuses(['waiting']);
    await processSingleFile(file, 0, [file]);
  };

  // Direct Printer Scanner Handler
  const handlePrinterScan = async (settings: { scannerIp?: string; scannerPort?: number; dpi?: number }) => {
    setCurrentFileName('Direkt-Scan vom Netzwerkdrucker');
    setIsPrinterScan(true);
    setCurrentPreviewUrl(null);
    setError(null);
    setViewMode('scanning');
    setIsLoading(true);
    setRotation(0);

    try {
      const res = await fetch(`${API_URL}/scanner/scan-to-timesheet`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Fehler beim Netzwerkdrucker-Scan. Prüfe die IP/Verbindung.');
      }

      const result: ScanResult = await res.json();
      setScanResult(result);
      setViewMode('review');
    } catch (e: any) {
      setError(e.message ?? 'Drucker-Verbindung fehlgeschlagen.');
      setViewMode('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Translate raw API error messages to user-friendly German
  const translateApiError = (raw: string): string => {
    if (!raw) return 'Unbekannter Fehler beim Speichern.';
    const dupMatch = raw.match(/DUPLICATE_DATE:(\d{4}-\d{2}-\d{2})/);
    if (dupMatch) {
      const d = new Date(dupMatch[1]);
      const formatted = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `Für diesen Mitarbeiter existiert bereits ein Stundenzettel für dieses Datum (${formatted}).`;
    }
    if (raw.toLowerCase().includes('duplicate') || raw.toLowerCase().includes('exists')) {
      return 'Für diesen Mitarbeiter existiert bereits ein Stundenzettel für dieses Datum.';
    }
    return raw;
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
        throw new Error(translateApiError(err.message ?? ''));
      }

      const confirmed = await res.json();
      markStatus(queueIndex, 'done');
      setSavedId(confirmed.id);
      setSavedName(confirmed.employee?.name ?? confirmed.employeeName);
      setRefreshListKey((prev) => prev + 1);

      if (hasQueue && !isLastInQueue) {
        // Auto-advance to next photo in queue (brief saved flash then scan next)
        setViewMode('saved');
        setTimeout(() => {
          setScanResult(null);
          setSavedId(null);
          setSavedName('');
          advanceQueue(fileQueue, queueIndex + 1);
        }, 1600);
      } else {
        setViewMode('saved');
      }
    } catch (e: any) {
      setError(e.message ?? 'Unbekannter Fehler');
    } finally {
      setIsLoading(false);
    }
  };

  const resetScanner = () => {
    if (currentPreviewUrl && currentPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(currentPreviewUrl);
    }
    setScanResult(null);
    setSavedId(null);
    setSavedName('');
    setCurrentFileName('');
    setCurrentPreviewUrl(null);
    setIsPrinterScan(false);
    setError(null);
    setRotation(0);
    setFileQueue([]);
    setQueueIndex(0);
    setQueueStatuses([]);
    setViewMode('upload');
  };

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
                  Zeiterfassung & Stundenzettel-Scanner
                </h1>
                <p className="text-slate-500 text-xs sm:text-sm">
                  Wochenstundenzettel per Fotos oder direkt vom Netzwerkdrucker nacheinander erfassen & verwalten
                </p>
              </div>
            </div>

            {/* Quick Direct Scan Button in Page Header */}
            {viewMode === 'upload' && activeTab === 'scanner' && (
              <button
                onClick={() => handlePrinterScan({})}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-sm font-semibold transition-all shadow-sm cursor-pointer"
              >
                <Printer size={16} />
                <span>Direkt vom Drucker scannen</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation — scrollable on mobile */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 mb-5 sm:mb-6 overflow-x-auto">
          {[
            { key: 'scanner', label: 'Stundenzettel Scannen', shortLabel: 'Scannen', icon: ScanLine },
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
          {activeTab === 'scanner' && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Light card wrapper with crisp dark border */}
              <div className="bg-white rounded-3xl p-3.5 sm:p-6 shadow-sm border-2 border-slate-300">

                {/* Error Message banner (if any general error outside single photo viewer) */}
                {error && viewMode !== 'error' && (
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border-2 border-red-300 mb-6 shadow-xs">
                    <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
                    <p className="text-red-800 text-sm font-bold">{error}</p>
                    <button
                      onClick={() => setError(null)}
                      className="ml-auto text-red-500 hover:text-red-800 cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}

                {/* Step Indicator */}
                {(viewMode === 'upload' || viewMode === 'review' || viewMode === 'error') && (
                  <div className="flex items-center gap-2 mb-6 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-200 overflow-x-auto whitespace-nowrap">
                    {['Erfassen (Upload / Drucker)', 'KI-Analyse', 'Prüfen & Speichern'].map((step, i) => {
                      const stepIndex = viewMode === 'upload' ? 0 : viewMode === 'review' ? 2 : 1;
                      const isActive = i === stepIndex;
                      const isDone = i < stepIndex;
                      return (
                        <div key={step} className="flex items-center gap-2 shrink-0">
                          <div
                            className={`flex items-center gap-1.5 font-bold ${
                              isActive ? 'text-blue-700' : isDone ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {isDone ? <CheckCircle size={14} className="text-emerald-700" /> : <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-blue-600' : 'bg-slate-300'}`} />}
                            {step}
                          </div>
                          {i < 2 && <div className="w-8 h-0.5 bg-slate-300" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* View States */}
                {viewMode === 'upload' && (
                  <UploadZone
                    onFileSelect={handleFileSelect}
                    onFilesSelect={handleFilesSelect}
                    onPrinterScan={handlePrinterScan}
                    isLoading={isLoading}
                  />
                )}

                {viewMode === 'scanning' && (
                  <ScanningView
                    fileName={currentFileName}
                    previewUrl={currentPreviewUrl}
                    isPrinterScan={isPrinterScan}
                    currentIndex={queueIndex}
                    totalCount={fileQueue.length || 1}
                    photoSize={photoSize}
                    onSizeChange={setPhotoSize}
                    rotation={rotation}
                  />
                )}

                {viewMode === 'review' && scanResult && (
                  <ReviewView
                    scanResult={scanResult}
                    onConfirm={handleConfirm}
                    onDiscard={hasQueue && !isLastInQueue ? skipCurrent : resetScanner}
                    isLoading={isLoading}
                    currentFileName={currentFileName}
                    currentPreviewUrl={currentPreviewUrl}
                    queueIndex={queueIndex}
                    totalQueueCount={fileQueue.length || 1}
                    photoSize={photoSize}
                    onPhotoSizeChange={setPhotoSize}
                    isLastInQueue={isLastInQueue}
                    rotation={rotation}
                    onRotate={handleRotate}
                    onReanalyze={handleReanalyze}
                    isReanalyzing={isReanalyzing}
                  />
                )}

                {viewMode === 'saved' && savedId && (
                  <SavedView
                    timesheetId={savedId}
                    employeeName={savedName}
                    onScanAnother={resetScanner}
                    hasQueue={hasQueue}
                    isLastInQueue={isLastInQueue}
                    queueIndex={queueIndex}
                    totalCount={fileQueue.length || 1}
                    onContinueNext={() => advanceQueue(fileQueue, queueIndex + 1)}
                  />
                )}

                {viewMode === 'error' && (
                  <div className="flex flex-col gap-4 my-2">
                    <SinglePhotoViewer
                      fileName={currentFileName || `Stundenzettel_${String(queueIndex + 1).padStart(2, '0')}.jpg`}
                      previewUrl={currentPreviewUrl}
                      currentIndex={queueIndex}
                      totalCount={fileQueue.length || 1}
                      photoSize={photoSize}
                      onSizeChange={setPhotoSize}
                      status="error"
                      statusMessage={error || 'Dieses Dokument konnte nicht analysiert werden.'}
                      onRetry={retryCurrent}
                      onSkip={hasQueue && !isLastInQueue ? skipCurrent : resetScanner}
                      onManualEntry={manualEntryForCurrent}
                      isPrinterScan={isPrinterScan}
                    />
                  </div>
                )}

              </div>
            </motion.div>
          )}

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
