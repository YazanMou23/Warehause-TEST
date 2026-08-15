'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { API_URL } from '../../../config/api';
import CustomAlertModal, { CustomAlertOptions } from '../../components/CustomAlertModal';
import { useDialog } from '../../components/DialogProvider';

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

type ViewMode = 'upload' | 'scanning' | 'review' | 'saved';
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
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        <CheckCircle size={11} /> Bestätigt
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
      <Clock size={11} /> Ausstehend
    </span>
  );
}

// ─── Upload Zone & Direct Scanner ─────────────────────────────────────────────

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
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [scannerIp, setScannerIp] = useState('');
  const [scannerPort, setScannerPort] = useState(80);
  const [scannerDpi, setScannerDpi] = useState(300);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusResult, setStatusResult] = useState<{ online?: boolean; state?: string; model?: string; error?: string } | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<Array<{ id: string; name: string; connectionType: string; ip?: string; port?: number; status: string }>>([]);
  const [subnetScan, setSubnetScan] = useState(true);

  const cameraRef = useRef<HTMLInputElement>(null);

  // ── Auto-check printer status on mount if IP is already configured ──────────
  useEffect(() => {
    if (scannerIp) {
      checkScannerStatus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discoverPrinters = async () => {
    setDiscovering(true);
    try {
      const res = await fetch(`${API_URL}/scanner/discover`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDiscoveredPrinters(data || []);
        // Auto-select first real (non-simulator) printer
        const real = (data || []).find((p: any) => p.ip && p.ip !== 'SIMULATOR');
        const first = real || data?.[0];
        if (first) {
          setScannerIp(first.ip || first.id);
          if (first.port) setScannerPort(first.port);
          // Immediately check the selected printer status
          setTimeout(() => checkScannerStatus(), 400);
        }
      }
    } catch (err) {
      console.error('Fehler bei der Druckersuche:', err);
    } finally {
      setDiscovering(false);
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);

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

  const checkScannerStatus = async () => {
    if (!scannerIp) return;
    setCheckingStatus(true);
    setStatusResult(null);
    try {
      const params = new URLSearchParams();
      params.set('ip', scannerIp);
      params.set('port', String(scannerPort));

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

  // Per-brand port hints
  const brandHints = [
    { brand: 'HP',      port: 8080, color: 'text-blue-700',   bg: 'bg-blue-100 border-blue-200' },
    { brand: 'Brother', port: 80,   color: 'text-purple-700', bg: 'bg-purple-100 border-purple-200' },
    { brand: 'Canon',   port: 80,   color: 'text-red-700',    bg: 'bg-red-100 border-red-200' },
    { brand: 'Epson',   port: 80,   color: 'text-cyan-700',   bg: 'bg-cyan-100 border-cyan-200' },
    { brand: 'Lexmark', port: 80,   color: 'text-amber-700',  bg: 'bg-amber-100 border-amber-200' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6 items-center w-full"
    >
      {/* Action Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
        
        {/* 1. Direct Printer Scanner Action Card */}
        <div className="relative rounded-2xl border border-blue-200 bg-blue-50/40 p-6 flex flex-col justify-between items-center text-center shadow-sm hover:border-blue-300 transition-all group">
          {/* Status dot + badge */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {statusResult && (
              <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                statusResult.online ? 'bg-emerald-500' : 'bg-red-500'
              }`} />
            )}
            <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 shadow-xs">
              <Printer size={13} className="shrink-0" />
              <span>WLAN / USB</span>
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-blue-100 text-blue-600 border border-blue-200 mt-8 mb-4 group-hover:scale-105 transition-transform">
            <Printer size={40} />
          </div>

          <div className="w-full">
            <h3 className="text-slate-900 font-bold text-lg mb-1">Vom Drucker scannen</h3>
            <p className="text-slate-600 text-xs leading-relaxed mb-2">
              Netzwerkdrucker per AirScan / eSCL — WLAN oder USB-Kabel.
            </p>

            {/* Inline status */}
            {statusResult && (
              <div className={`mb-3 flex items-center justify-center gap-1.5 text-xs font-medium ${
                statusResult.online ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {statusResult.online ? (
                  <><CheckCircle size={11} /> Online{statusResult.model ? ` · ${statusResult.model}` : ''} ({statusResult.state})</>
                ) : (
                  <><AlertCircle size={11} /> {statusResult.error?.slice(0, 48)}</>
                )}
              </div>
            )}
            {!statusResult && scannerIp && !checkingStatus && (
              <div className="mb-3 text-xs text-slate-500 flex items-center justify-center gap-1">
                <Hash size={10} /> IP: {scannerIp}:{scannerPort}
              </div>
            )}
          </div>

          <div className="w-full space-y-2">
            <button
              onClick={() => onPrinterScan({ scannerIp, scannerPort, dpi: scannerDpi })}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md hover:shadow-blue-500/20 transition-all text-sm disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
              <span>Jetzt scannen</span>
            </button>

            {/* Quick test + settings row */}
            <div className="flex gap-1.5">
              <button
                onClick={checkScannerStatus}
                disabled={checkingStatus || !scannerIp}
                title={scannerIp ? 'Verbindung testen' : 'Erst IP in Einstellungen eingeben'}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs border border-slate-200 transition-colors disabled:opacity-40 cursor-pointer shadow-sm"
              >
                {checkingStatus ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Testen
              </button>
              <button
                onClick={() => setShowPrinterSettings(!showPrinterSettings)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs border border-slate-200 transition-colors cursor-pointer shadow-sm"
              >
                <Settings size={11} />
                {showPrinterSettings ? 'Schließen' : 'Einstellungen'}
              </button>
            </div>
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
            relative cursor-pointer rounded-2xl border-2 border-dashed
            transition-all duration-300 p-6 flex flex-col justify-between items-center text-center
            ${isDragOver
              ? 'border-blue-500 bg-blue-50 scale-[1.01]'
              : 'border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/30'
            }
          `}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200/80 text-slate-700 text-xs font-semibold border border-slate-300">
            <Upload size={12} />
            <span>Datei-Upload</span>
          </div>

          <div className={`p-4 rounded-2xl transition-colors mt-8 mb-4 ${isDragOver ? 'bg-blue-100 text-blue-600' : 'bg-slate-200/60 text-slate-600'}`}>
            <ScanLine size={44} className={isDragOver ? 'text-blue-600' : 'text-slate-600'} />
          </div>

          <div>
            <h3 className="text-slate-900 font-bold text-lg mb-1">
              {isDragOver ? 'Datei hier ablegen' : 'Datei / Dokument hochladen'}
            </h3>
            <p className="text-slate-500 text-xs max-w-xs mb-4">
              PNG, JPG, JPEG oder PDF per Drag & Drop ziehen oder Durchsuchen klicken.
            </p>
          </div>

          <div className="w-full">
            <div className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm border border-slate-200 shadow-sm transition-all flex items-center justify-center gap-2">
              <Upload size={16} />
              <span>Datei auswählen</span>
            </div>
            <p className="text-slate-500 text-[11px] mt-2">Max. 15 MB (PNG, JPG, JPEG, PDF)</p>
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
          className="relative cursor-pointer rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-6 flex flex-col justify-between items-center text-center shadow-sm hover:border-emerald-400 transition-all group"
        >
          <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold border border-emerald-200">
            <Camera size={12} />
            <span>Kamera</span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-100 text-emerald-600 border border-emerald-200 mt-8 mb-4 group-hover:scale-105 transition-transform">
            <Camera size={44} />
          </div>

          <div>
            <h3 className="text-slate-900 font-bold text-lg mb-1">Kamera aufnehmen</h3>
            <p className="text-slate-600 text-xs leading-relaxed max-w-xs mb-4">
              Stundenzettel direkt mit der Handy- oder Laptop-Kamera fotografieren und sofort scannen.
            </p>
          </div>

          <div className="w-full">
            <div className="px-4 py-2.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 font-semibold text-sm border border-emerald-200 shadow-sm transition-all flex items-center justify-center gap-2">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              <span>Kamera öffnen</span>
            </div>
            <p className="text-slate-500 text-[11px] mt-2">Foto, Handy oder Webcam</p>
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

        {/* 3-card hint: multi-photo */}
        <div className="col-span-1 md:col-span-3 flex items-center gap-2 text-xs text-slate-500 justify-center">
          <Images size={13} className="text-blue-500" />
          <span>Mehrere Dateien auswählen (PNG, JPG, JPEG, PDF): Strg+Klick (Desktop) oder Mehrfach-Auswahl — alle werden nacheinander analysiert.</span>
        </div>

      </div>

      {/* Expandable Printer Settings Panel */}
      <AnimatePresence>
        {showPrinterSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full max-w-4xl bg-slate-50 border border-slate-200 rounded-2xl p-5 overflow-hidden shadow-sm"
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-slate-200">
              <h4 className="text-slate-900 font-semibold text-sm flex items-center gap-2">
                <Settings size={15} className="text-blue-600" />
                WLAN-Drucker / Scanner Einstellungen
              </h4>
              <button
                onClick={discoverPrinters}
                disabled={discovering}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition-all shadow-sm cursor-pointer"
              >
                {discovering ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>Drucker im Netzwerk suchen</span>
              </button>
            </div>

            {/* WiFi Setup Guide */}
            <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-slate-700 space-y-1">
              <p className="text-blue-700 font-semibold flex items-center gap-1.5 mb-2">
                <RefreshCw size={11} /> WLAN-Drucker verbinden — Kurzanleitung:
              </p>
              <p>① Drucker & dieses Gerät im gleichen WLAN-Netzwerk.</p>
              <p>② IP-Adresse am Drucker-Display ablesen (oder Konfigurationsseite drucken).</p>
              <p>③ IP unten eingeben → "Verbindung testen" klicken.</p>
              <p className="text-slate-500 pt-1">eSCL/AirScan ist aktiviert auf allen modernen HP-, Brother-, Canon-, Epson- und Lexmark-Druckern.</p>
            </div>

            {/* Brand port hints */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs text-slate-500 self-center">Port-Schnellwahl:</span>
              {brandHints.map(({ brand, port, color, bg }) => (
                <button
                  key={brand}
                  onClick={() => setScannerPort(port)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all hover:opacity-80 ${bg} ${color} ${
                    scannerPort === port ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  <span>{brand}</span>
                  <span className="opacity-70">:{port}</span>
                </button>
              ))}
            </div>

            {/* Discovered printers */}
            {discoveredPrinters.length > 0 && (
              <div className="mb-4 p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-2 shadow-sm">
                <label className="text-slate-800 font-semibold flex items-center gap-1.5 mb-2">
                  <CheckCircle size={13} className="text-emerald-600" />
                  Gefundene Drucker & Scanner ({discoveredPrinters.length}):
                </label>
                <div className="space-y-1.5">
                  {discoveredPrinters.map((p) => {
                    const isSelected = scannerIp === (p.ip || p.id);
                    const connColor = p.connectionType === 'USB'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : p.id === 'SIMULATOR'
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200';
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setScannerIp(p.ip || p.id);
                          if (p.port) setScannerPort(p.port);
                          setTimeout(() => checkScannerStatus(), 300);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-left ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${connColor}`}>
                          {p.connectionType}
                        </span>
                        <span className="flex-1 truncate font-medium">{p.name}</span>
                        {p.ip && p.ip !== 'SIMULATOR' && (
                          <span className="text-slate-500 font-mono text-[10px]">{p.ip}:{p.port}</span>
                        )}
                        {isSelected && <CheckCircle size={12} className="text-emerald-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manual IP + port + DPI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-medium">Drucker IP-Adresse</label>
                <input
                  type="text"
                  placeholder="z.B. 192.168.1.105"
                  value={scannerIp}
                  onChange={(e) => { setScannerIp(e.target.value); setStatusResult(null); }}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-blue-500 font-mono shadow-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-medium">Port (HP: 8080 / andere: 80)</label>
                <input
                  type="number"
                  placeholder="80"
                  value={scannerPort}
                  onChange={(e) => setScannerPort(parseInt(e.target.value) || 80)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-blue-500 shadow-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-medium">Auflösung (DPI)</label>
                <select
                  value={scannerDpi}
                  onChange={(e) => setScannerDpi(parseInt(e.target.value))}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-blue-500 shadow-sm"
                >
                  <option value={150}>150 DPI (Schnell)</option>
                  <option value={300}>300 DPI (Empfohlen)</option>
                  <option value={600}>600 DPI (Hohe Qualität)</option>
                </select>
              </div>
            </div>

            {/* Footer: test + status */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <button
                onClick={checkScannerStatus}
                disabled={checkingStatus || !scannerIp}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer shadow-sm"
              >
                {checkingStatus ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Verbindung testen
              </button>

              {statusResult && (
                <div className="text-xs flex items-center gap-2">
                  {statusResult.online ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle size={13} />
                      Online{statusResult.model ? ` · ${statusResult.model}` : ''} — {statusResult.state}
                    </span>
                  ) : (
                    <span className="text-red-400 font-medium flex items-center gap-1.5">
                      <AlertCircle size={13} />
                      {statusResult.error}
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Scanning Animation ───────────────────────────────────────────────────────

function ScanningView({ fileName, isPrinterScan }: { fileName: string; isPrinterScan?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center gap-8 py-16"
    >
      <div className="relative">
        <div className="w-24 h-24 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
          {isPrinterScan ? (
            <Printer size={40} className="text-blue-400 animate-pulse" />
          ) : (
            <FileText size={36} className="text-blue-400" />
          )}
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
          <p className="text-white font-semibold">
            {isPrinterScan ? 'Verbindung zum Drucker hergestellt. Scanne Dokument...' : 'KI analysiert Stundenzettel...'}
          </p>
        </div>
        <p className="text-slate-400 text-sm">{fileName}</p>
      </div>

      <div className="flex flex-col gap-2 w-72">
        {[
          isPrinterScan ? 'Empfange Bild vom Netzwerkschreibdrucker' : 'Bild wird verarbeitet',
          'Handschrift & Zeiten werden erkannt',
          'Mitarbeiter wird in Datenbank gesucht',
        ].map((step, i) => (
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
  const [weekStartDate, setWeekStartDate] = useState(scanResult.weekStartDate);
  const [employeeId, setEmployeeId] = useState<string>(scanResult.employeeId ?? '');
  const [createNew, setCreateNew] = useState(!scanResult.employeeMatch.found);
  const [newEmployee, setNewEmployee] = useState({
    username: '',
    phone: '',
    password: 'changeme123',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Searchable DB Employee selector state
  const [dbEmployees, setDbEmployees] = useState<DbEmployee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await fetch(`${API_URL}/employees?limit=100`, { headers: getAuthHeaders() });
        if (res.ok) {
          const json = await res.json();
          const list = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
          setDbEmployees(list);
        }
      } catch (e) {
        console.error('Fehler beim Laden der Mitarbeiterliste', e);
      }
    };
    fetchEmployees();
  }, []);

  // Fetch halls for multi-hall selector
  const [availableHalls, setAvailableHalls] = useState<{ id: string; name: string; warehouseId?: string }[]>([]);
  const [openHallDropdown, setOpenHallDropdown] = useState<number | null>(null);

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

  const filteredEmployees = dbEmployees.filter((emp) =>
    emp.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    emp.username?.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  const selectedEmployeeObj = dbEmployees.find((e) => e.id === employeeId);

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
          updated[idx].endTime || '',
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
      weekStartDate,
      entries: entries
        .filter((e) => e.startTime)
        .map((e) => ({
          weekday: e.weekday,
          date: e.date,
          startTime: e.startTime,
          endTime: e.endTime || undefined,
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
      delete payload.employeeId; // Ensure employeeId is not sent when createNew is active
    } else {
      if (!employeeId) {
        setErrors({ general: 'Bitte einen Mitarbeiter aus der Datenbank auswählen' });
        return;
      }
      payload.employeeId = employeeId;
      delete payload.createNewEmployee; // Ensure createNewEmployee is not sent when employeeId is set
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
            <strong>Demo-Modus:</strong> Diese Daten sind Beispieldaten.
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
                Mitarbeiter zugeordnet: <strong>{selectedEmployeeObj?.name || scanResult.employeeMatch.matchedName}</strong>
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
              /* Searchable Mitarbeiter Dropdown with Numeric Index 1,2,3... */
              <div className="relative">
                <div
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full px-3 py-2.5 bg-white/8 border border-white/15 rounded-xl text-white text-sm flex items-center justify-between cursor-pointer hover:border-blue-400/50 transition-colors"
                >
                  {selectedEmployeeObj ? (
                    <span className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs font-bold">
                        #{dbEmployees.findIndex(e => e.id === selectedEmployeeObj.id) + 1}
                      </span>
                      <span className="font-medium">{selectedEmployeeObj.name}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">Mitarbeiter suchen oder wählen...</span>
                  )}
                  <ChevronDown size={16} className="text-slate-400" />
                </div>

                {isDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-900 border border-white/15 rounded-xl shadow-2xl overflow-hidden p-2">
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Name suchen..."
                        value={employeeSearch}
                        onChange={(e) => setEmployeeSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-white/10 border border-white/10 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-400"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredEmployees.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-3">Kein Mitarbeiter gefunden</p>
                      ) : (
                        filteredEmployees.map((emp, index) => (
                          <div
                            key={emp.id}
                            onClick={() => {
                              setEmployeeId(emp.id);
                              setEmployeeName(emp.name);
                              setIsDropdownOpen(false);
                            }}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                              employeeId === emp.id ? 'bg-blue-600 text-white font-semibold' : 'text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-white/10 font-mono font-bold text-[10px]">
                                #{index + 1}
                              </span>
                              <span>{emp.name}</span>
                            </span>
                            <span className="text-[10px] opacity-60">@{emp.username}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
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
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Calendar size={16} className="text-blue-400" />
              Arbeitszeiten (Wochenstart):
            </h3>
            <input
              type="date"
              value={weekStartDate ? weekStartDate.split('T')[0] : ''}
              onChange={(e) => setWeekStartDate(e.target.value)}
              className="px-2.5 py-1 bg-white/8 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-blue-400/60 font-mono"
            />
            <span className="text-xs text-slate-400 font-normal font-mono">({getKw(weekStartDate)})</span>
          </div>
          <div className="text-sm font-mono text-blue-300 bg-blue-500/15 px-3 py-1 rounded-lg border border-blue-400/20">
            Gesamt: {totalHours.toFixed(2)} h
          </div>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-[40px_120px_100px_72px_72px_80px_80px_1fr] gap-2 px-4 py-2.5 bg-white/5 border-b border-white/8 text-xs font-medium text-slate-400">
          <div className="font-mono text-center">#</div>
          <div className="flex items-center gap-1"><Clock size={10} />Wochentag</div>
          <div>Datum</div>
          <div>Von</div>
          <div>Bis</div>
          <div><Coffee size={10} className="inline mr-0.5" />Pause</div>
          <div>Gesamt</div>
          <div className="flex items-center gap-1"><MapPin size={10} className="inline mr-0.5" />Halle(n)</div>
        </div>

        {/* Table Rows with Numeric Index 1, 2, 3... */}
        {entries.map((entry, idx) => {
          const hasData = entry.startTime !== '' || entry.endTime !== '';
          const isWeekend = idx >= 5;

          return (
            <div
              key={entry.weekday}
              className={`grid grid-cols-[40px_120px_100px_72px_72px_80px_80px_1fr] gap-2 px-4 py-2 border-b border-white/5 transition-colors items-center ${
                isWeekend ? 'bg-white/3' : 'hover:bg-white/4'
              } ${!hasData && !isWeekend ? 'opacity-60' : ''}`}
            >
              {/* Numeric Index Badge 1,2,3... */}
              <div className="font-mono text-xs font-bold text-slate-400 text-center bg-white/5 py-0.5 rounded border border-white/10">
                {idx + 1}
              </div>

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

              {/* Multi-Hall Selector */}
              <div className="relative">
                {/* Selected halls as chips */}
                <div
                  onClick={() => setOpenHallDropdown(openHallDropdown === idx ? null : idx)}
                  className="flex flex-wrap gap-1 min-h-[28px] px-2 py-1 bg-white/8 border border-white/10 rounded-lg cursor-pointer hover:border-blue-400/60 transition-colors"
                >
                  {entry.location
                    ? entry.location.split(',').filter(Boolean).map((h) => h.trim()).map((hallName, hIdx) => (
                        <span
                          key={hIdx}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/25 text-blue-200 text-[10px] font-medium border border-blue-400/30"
                        >
                          <MapPin size={8} />
                          {hallName}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const halls = entry.location.split(',').map(h => h.trim()).filter(Boolean);
                              const updated = halls.filter((_, i) => i !== hIdx);
                              updateEntry(idx, 'location', updated.join(', '));
                            }}
                            className="ml-0.5 text-blue-300 hover:text-white"
                          >
                            <X size={8} />
                          </button>
                        </span>
                      ))
                    : <span className="text-slate-600 text-[10px] self-center">Halle(n) wählen...</span>
                  }
                  <span className="ml-auto text-slate-500 self-center"><ChevronDown size={10} /></span>
                </div>

                {/* Hall dropdown */}
                {openHallDropdown === idx && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-900 border border-white/15 rounded-xl shadow-2xl overflow-hidden p-1.5 max-h-40 overflow-y-auto">
                    {availableHalls.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-2">Keine Hallen gefunden</p>
                    ) : (
                      availableHalls.map((hall) => {
                        const selectedNames = entry.location ? entry.location.split(',').map(h => h.trim()).filter(Boolean) : [];
                        const isSelected = selectedNames.includes(hall.name);
                        return (
                          <div
                            key={hall.id}
                            onClick={() => {
                              const currentHalls = entry.location ? entry.location.split(',').map(h => h.trim()).filter(Boolean) : [];
                              let newHalls: string[];
                              if (isSelected) {
                                newHalls = currentHalls.filter(h => h !== hall.name);
                              } else {
                                newHalls = [...currentHalls, hall.name];
                              }
                              updateEntry(idx, 'location', newHalls.join(', '));
                            }}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-600 text-white font-semibold' : 'text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            <MapPin size={10} className={isSelected ? 'text-white' : 'text-blue-400'} />
                            {hall.name}
                            {isSelected && <span className="ml-auto text-[9px] font-bold text-blue-200">✓</span>}
                          </div>
                        );
                      })
                    )}
                    <div className="border-t border-white/10 mt-1 pt-1">
                      <input
                        type="text"
                        placeholder="Oder manuell eingeben..."
                        value={entry.location && !entry.location.split(',').every(h => availableHalls.some(ah => ah.name === h.trim())) ? entry.location.split(',').filter(h => !availableHalls.some(ah => ah.name === h.trim())).join(', ') : ''}
                        onChange={(e) => {
                          const manual = e.target.value;
                          const fromList = entry.location ? entry.location.split(',').map(h => h.trim()).filter(h => availableHalls.some(ah => ah.name === h)) : [];
                          const combined = [...fromList, ...(manual ? [manual] : [])].join(', ');
                          updateEntry(idx, 'location', combined);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white/8 border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-400/60"
                      />
                    </div>
                  </div>
                )}
              </div>
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
          className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all text-sm disabled:opacity-60 cursor-pointer"
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
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-blue-400 shadow-sm"
          >
            <option value="">Alle Status (Gesamt)</option>
            <option value="PENDING_REVIEW">Ausstehend (PENDING_REVIEW)</option>
            <option value="CONFIRMED">Bestätigt (CONFIRMED)</option>
          </select>

          {/* Aktualisieren button with NO hover color change */}
          <button
            onClick={loadList}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 text-sm font-medium shadow-sm cursor-pointer disabled:opacity-50"
            title="Liste neu laden"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-500' : 'text-slate-500'} />
            <span>Aktualisieren</span>
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
            <span>Klicke auf den Pfeil zum Aufklappen der Tagesstunden</span>
          </div>

          {filtered.map((item, index) => {
            const isExpanded = expandedId === item.id;
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-blue-300 transition-colors overflow-hidden group"
              >
                {/* Header Row */}
                <div className="flex items-center gap-4 p-4">
                  {/* Numeric Index Badge (#1, #2, #3...) */}
                  <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    #{index + 1}
                  </div>

                  {/* Timesheet Employee info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-slate-900 font-semibold text-sm truncate">
                        {item.employee?.name ?? item.employeeName}
                      </p>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="text-slate-500 text-xs flex items-center gap-3">
                      <span>📅 {getWeekRange(item.weekStartDate)}</span>
                      <span>⏱️ {item.entryCount} Tage ({item.totalHours.toFixed(2)} h)</span>
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Expand Details Button */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors text-xs font-medium cursor-pointer"
                    >
                      <span>Tageszeiten</span>
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
                          <span>PDF</span>
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
                          <span>Excel</span>
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
                      className="bg-slate-50 border-t border-slate-200 p-4"
                    >
                      <h4 className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                        <Clock size={12} /> Detaillierte Tagesstunden für {item.employee?.name ?? item.employeeName}:
                      </h4>

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
        setRecords(Array.isArray(json) ? json : []);
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
          setDbEmployees(Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []));
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
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Calendar size={18} className="text-blue-600" />
          <span className="text-slate-900 font-semibold text-sm">Datum wählen:</span>
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-semibold">
              <Users size={12} className="inline mr-1.5" />
              Mitarbeiter am Tag: <strong className="text-blue-900">{records.length}</strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
              <Clock size={12} className="inline mr-1.5" />
              Gesamte Schichtstunden: <strong className="text-emerald-900">{totalShiftHours.toFixed(2)} h</strong>
            </div>
          </div>

          <button
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer"
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
  const [isPrinterScan, setIsPrinterScan] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshListKey, setRefreshListKey] = useState(0);

  // ── Multi-photo queue ────────────────────────────────────────────────────────
  type QueueStatus = 'waiting' | 'scanning' | 'review' | 'done' | 'error' | 'skipped';
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueStatuses, setQueueStatuses] = useState<QueueStatus[]>([]);

  const hasQueue = fileQueue.length > 1;
  const isLastInQueue = queueIndex >= fileQueue.length - 1;

  // Mark status of a specific queue item
  const markStatus = (idx: number, status: QueueStatus) =>
    setQueueStatuses(prev => { const next = [...prev]; next[idx] = status; return next; });

  // Start a queue of files — process the first one immediately
  const handleFilesSelect = (files: File[]) => {
    const validFiles = files.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (validFiles.length === 0) return;
    if (validFiles.length === 1) {
      // Single file — bypass queue
      handleFileSelect(validFiles[0]);
      return;
    }
    setFileQueue(validFiles);
    setQueueIndex(0);
    setQueueStatuses(validFiles.map(() => 'waiting'));
    processSingleFile(validFiles[0], 0, validFiles);
  };

  // Add more files to an existing queue mid-flow
  const addToQueue = (files: File[]) => {
    const valid = files.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!valid.length) return;
    setFileQueue(prev => [...prev, ...valid]);
    setQueueStatuses(prev => [...prev, ...valid.map(() => 'waiting' as QueueStatus)]);
  };

  // Skip current photo and advance to next
  const skipCurrent = () => {
    markStatus(queueIndex, 'skipped');
    advanceQueue(fileQueue, queueIndex + 1);
  };

  // Advance to the next item in the queue
  const advanceQueue = (queue: File[], nextIdx: number) => {
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
      setError(e.message ?? 'Unbekannter Fehler');
      // On error: stay in queue, allow skip or retry
      setViewMode('upload');
    }
  };

  // File-upload Handler (single file — also used by queue processor)
  const handleFileSelect = async (file: File) => {
    // If there's no active queue, process as standalone
    if (fileQueue.length <= 1) {
      setFileQueue([file]);
      setQueueIndex(0);
      setQueueStatuses(['scanning']);
      await processSingleFile(file, 0, [file]);
    }
    // If queue is active, processSingleFile is called directly by advanceQueue
  };

  // Direct Printer Scanner Handler
  const handlePrinterScan = async (settings: { scannerIp?: string; scannerPort?: number; dpi?: number }) => {
    setCurrentFileName('Direkt-Scan vom Netzwerkdrucker');
    setIsPrinterScan(true);
    setError(null);
    setViewMode('scanning');
    setIsLoading(true);

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
      setViewMode('upload');
    } finally {
      setIsLoading(false);
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
        }, 1800);
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
    setScanResult(null);
    setSavedId(null);
    setSavedName('');
    setCurrentFileName('');
    setIsPrinterScan(false);
    setError(null);
    setFileQueue([]);
    setQueueIndex(0);
    setQueueStatuses([]);
    setViewMode('upload');
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200">
                <ScanLine size={24} className="text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  Zeiterfassung & Stundenzettel-Scanner
                </h1>
                <p className="text-slate-500 text-sm">
                  Wochenstundenzettel per Fotos oder direkt vom Netzwerkdrucker erfassen & verwalten
                </p>
              </div>
            </div>

            {/* Quick Direct Scan Button in Page Header */}
            {viewMode === 'upload' && activeTab === 'scanner' && (
              <button
                onClick={() => handlePrinterScan({})}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-sm font-semibold transition-all shadow-sm cursor-pointer"
              >
                <Printer size={16} />
                <span>Direkt vom Drucker scannen</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 mb-6 w-fit">
          {[
            { key: 'scanner', label: 'Stundenzettel Scannen', icon: ScanLine },
            { key: 'list', label: 'Wochenzettel Übersicht', icon: FileText },
            { key: 'daily', label: 'Tages-Übersicht (Alle Mitarbeiter)', icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key as ActiveTab);
                if (key === 'list') setRefreshListKey((prev) => prev + 1);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === key
                  ? 'bg-blue-600 text-white shadow-md font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Icon size={16} />
              {label}
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

              {/* Queue Progress Bar */}
              {hasQueue && (
                <div className="mb-5 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Images size={16} className="text-blue-400" />
                      <span>Foto-Warteschlange</span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-600/30 text-blue-300 text-xs font-bold border border-blue-400/30">
                        {queueIndex + 1} / {fileQueue.length}
                      </span>
                    </div>
                    {viewMode === 'review' && !isLastInQueue && (
                      <button
                        onClick={skipCurrent}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 hover:text-white text-xs border border-white/10 transition-colors cursor-pointer"
                      >
                        <SkipForward size={12} /> Foto überspringen
                      </button>
                    )}
                  </div>

                  {/* Progress dots */}
                  <div className="flex gap-1.5 flex-wrap">
                    {fileQueue.map((f, i) => {
                      const st = queueStatuses[i] ?? 'waiting';
                      const isActive = i === queueIndex;
                      const dotColor =
                        st === 'done'    ? 'bg-emerald-400 border-emerald-300' :
                        st === 'error'   ? 'bg-red-400 border-red-300' :
                        st === 'skipped' ? 'bg-slate-500 border-slate-400' :
                        st === 'scanning'|| st === 'review' ? (isActive ? 'bg-blue-400 border-blue-300 animate-pulse' : 'bg-blue-400 border-blue-300') :
                        'bg-white/20 border-white/10';
                      return (
                        <div
                          key={i}
                          title={`${f.name} — ${st}`}
                          className={`h-2.5 flex-1 min-w-[20px] max-w-[60px] rounded-full border transition-all ${
                            dotColor
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* File names strip */}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {fileQueue.map((f, i) => {
                      const st = queueStatuses[i] ?? 'waiting';
                      const isActive = i === queueIndex;
                      return (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] border ${
                            isActive
                              ? 'bg-blue-600/30 text-blue-200 border-blue-400/40 font-semibold'
                              : st === 'done'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-400/20'
                              : st === 'error'
                              ? 'bg-red-500/15 text-red-400 border-red-400/20'
                              : st === 'skipped'
                              ? 'bg-slate-500/15 text-slate-500 border-slate-500/20 line-through'
                              : 'bg-white/5 text-slate-500 border-white/8'
                          }`}
                        >
                          {st === 'done'    && <CheckCircle size={8} />}
                          {st === 'error'   && <AlertCircle size={8} />}
                          {st === 'scanning'&& <Loader2 size={8} className="animate-spin" />}
                          {f.name.length > 18 ? f.name.slice(0, 15) + '...' : f.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step Indicator */}
              {(viewMode === 'upload' || viewMode === 'review') && (
                <div className="flex items-center gap-2 mb-6 text-xs text-slate-500">
                  {['Erfassen (Upload / Drucker)', 'KI-Analyse', 'Prüfen & Speichern'].map((step, i) => {
                    const stepIndex = viewMode === 'upload' ? 0 : viewMode === 'review' ? 2 : 1;
                    const isActive = i === stepIndex;
                    const isDone = i < stepIndex;
                    return (
                      <div key={step} className="flex items-center gap-2">
                        <div
                          className={`flex items-center gap-1.5 ${
                            isActive ? 'text-blue-300 font-semibold' : isDone ? 'text-emerald-400' : 'text-slate-600'
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
                <UploadZone
                  onFileSelect={handleFileSelect}
                  onFilesSelect={handleFilesSelect}
                  onPrinterScan={handlePrinterScan}
                  isLoading={isLoading}
                />
              )}
              {viewMode === 'scanning' && (
                <ScanningView fileName={currentFileName} isPrinterScan={isPrinterScan} />
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
