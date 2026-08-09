'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Upload, X, QrCode, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import jsQR from 'jsqr';

interface QRScannerCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (payload: { warehouseId: string; hallId: string; hallName?: string }) => void;
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
}

export default function QRScannerCameraModal({
  isOpen,
  onClose,
  onScanSuccess,
  isLoading = false,
  title = 'Hallen QR-Code scannen',
  subtitle = 'Halten Sie Ihre Kamera auf den QR-Code am Halleneingang oder laden Sie ein QR-Foto hoch.',
}: QRScannerCameraModalProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [cameraError, setCameraError] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string>('');
  const [successResult, setSuccessResult] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Prevent multiple simultaneous payload handling
  const handledRef = useRef<boolean>(false);

  // ─── Stop camera cleanly ───────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  // ─── Parse & validate QR payload ──────────────────────────────────────────
  const handleQrPayload = useCallback((rawData: string) => {
    if (handledRef.current) return;
    handledRef.current = true;

    try {
      let warehouseId = '';
      let hallId = '';
      let hallName = '';

      // JSON payload (from QRCodeModal.tsx generator)
      if (rawData.startsWith('{') && rawData.endsWith('}')) {
        const json = JSON.parse(rawData);
        if (json.warehouseId && json.hallId) {
          warehouseId = json.warehouseId;
          hallId = json.hallId;
          hallName = json.hallName || '';
        }
      } else if (rawData.startsWith('LOGIFLOW_HALL:')) {
        // Legacy string payload: LOGIFLOW_HALL:<whId>:<hallId>
        const parts = rawData.split(':');
        if (parts.length >= 3) {
          warehouseId = parts[1];
          hallId = parts[2];
        }
      }

      if (!warehouseId || !hallId) {
        setScanError('Ungültiger QR-Code. Bitte scannen Sie den offiziellen Hallen-QR-Code.');
        handledRef.current = false;
        // Resume scanning after 2 seconds
        setTimeout(() => {
          setScanError('');
          if (streamRef.current && animFrameIdRef.current === null) {
            animFrameIdRef.current = requestAnimationFrame(tick);
          }
        }, 2000);
        return;
      }

      // ✅ Valid — stop camera and notify parent. Parent controls when to close.
      stopCamera();
      setSuccessResult(`✅ Halle erkannt: ${hallName || hallId.slice(0, 12)}… Verbinde…`);
      onScanSuccess({ warehouseId, hallId, hallName });
    } catch {
      setScanError('QR-Code konnte nicht gelesen werden.');
      handledRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScanSuccess, onClose, stopCamera]);

  // ─── rAF tick loop ─────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
      animFrameIdRef.current = requestAnimationFrame(tick);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animFrameIdRef.current = requestAnimationFrame(tick);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code?.data) {
      handleQrPayload(code.data);
      return; // Stop loop — handleQrPayload will manage
    }

    animFrameIdRef.current = requestAnimationFrame(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleQrPayload]);

  // ─── Start camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError('');
    setScanError('');
    setSuccessResult('');
    handledRef.current = false;

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Kamera-Zugriff wird von Ihrem Browser nicht unterstützt. Bitte nutzen Sie den Datei-Upload-Tab.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;

      // Wait for videoRef to exist — it is always mounted in DOM when activeTab==='camera'
      const video = videoRef.current;
      if (!video) {
        // Tiny delay for React to commit the DOM node
        await new Promise((r) => setTimeout(r, 80));
      }

      const videoEl = videoRef.current;
      if (!videoEl) {
        throw new Error('Video-Element konnte nicht initialisiert werden. Bitte seite neu laden.');
      }

      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.muted = true;

      await videoEl.play();
      setIsStreaming(true);
      handledRef.current = false;
      animFrameIdRef.current = requestAnimationFrame(tick);
    } catch (err: any) {
      console.error('[QRScanner] Camera error:', err);
      const message =
        err.name === 'NotAllowedError'
          ? 'Kamera-Zugriff verweigert. Bitte erlauben Sie den Kamera-Zugriff in Ihren Browser-Einstellungen und versuchen Sie es erneut.'
          : err.name === 'NotFoundError'
          ? 'Keine Kamera gefunden. Bitte nutzen Sie den Datei-Upload-Tab.'
          : err.name === 'NotReadableError'
          ? 'Kamera wird bereits von einer anderen Anwendung verwendet.'
          : err.message || 'Kamera konnte nicht gestartet werden.';

      setCameraError(message);
      setIsStreaming(false);
    }
  }, [tick]);

  // ─── Handle file upload QR scan ────────────────────────────────────────────
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError('');
    setSuccessResult('');
    setIsProcessing(true);
    handledRef.current = false;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setIsProcessing(false); return; }
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        setIsProcessing(false);
        if (code?.data) {
          handleQrPayload(code.data);
        } else {
          setScanError('Kein gültiger QR-Code im Bild gefunden. Bitte deutliches, gut belichtetes Foto wählen.');
        }
      };
      img.onerror = () => {
        setIsProcessing(false);
        setScanError('Bild konnte nicht geladen werden.');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [handleQrPayload]);

  // ─── Lifecycle: open/close/tab change ─────────────────────────────────────
  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, startCamera, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700/80 text-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 relative">
        {/* Close */}
        <button
          onClick={() => { stopCamera(); onClose(); }}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-red-500/30 text-slate-300 hover:text-white transition-colors cursor-pointer z-10"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div className="text-center space-y-1 pt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-bold uppercase tracking-wider">
            <QrCode size={13} /> {title}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed px-4 pt-1">{subtitle}</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs font-bold gap-1">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'camera' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera size={14} /> Kamera-Scanner
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'upload' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload size={14} /> Foto hochladen
          </button>
        </div>

        {/* Camera tab */}
        {activeTab === 'camera' && (
          <div className="relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-700 flex items-center justify-center" style={{ aspectRatio: '4/3' }}>

            {/* Video — always mounted to preserve videoRef, hidden while not streaming */}
            <video
              ref={videoRef}
              className={`w-full h-full object-cover ${isStreaming ? 'block' : 'hidden'}`}
              playsInline
              muted
              autoPlay
            />

            {/* Scanning overlay — corners + laser */}
            {isStreaming && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-52 h-52 relative">
                  <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-blue-400 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-blue-400 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-blue-400 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-blue-400 rounded-br-lg" />
                  {/* Scanning laser */}
                  <div
                    className="absolute left-2 right-2 h-0.5 bg-blue-400 opacity-80 shadow-[0_0_8px_2px_#60a5fa]"
                    style={{ animation: 'scanLaser 2s linear infinite', top: '0%' }}
                  />
                </div>
                <p className="absolute bottom-3 text-[11px] text-blue-300 font-semibold tracking-wide">
                  QR-Code im Rahmen positionieren…
                </p>
              </div>
            )}

            {/* Loading state — camera starting */}
            {!isStreaming && !cameraError && !isLoading && (
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="w-10 h-10 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                <p className="text-xs text-slate-400">Kamera wird gestartet…</p>
              </div>
            )}

            {/* API processing state */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="w-10 h-10 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                <p className="text-xs text-emerald-300 font-semibold">Zeiterfassung wird gespeichert…</p>
              </div>
            )}

            {/* Error state */}
            {cameraError && !isLoading && (
              <div className="flex flex-col items-center gap-3 p-5 text-center">
                <AlertCircle size={32} className="text-amber-400" />
                <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} /> Erneut versuchen
                </button>
              </div>
            )}
          </div>
        )}

        {/* Upload tab */}
        {activeTab === 'upload' && (
          <div
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className="rounded-2xl border-2 border-dashed border-slate-600 hover:border-blue-500/70 bg-slate-800/30 p-7 flex flex-col items-center justify-center text-center cursor-pointer transition-all"
            style={{ aspectRatio: '4/3' }}
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-3">
              {isProcessing ? (
                <div className="w-8 h-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
              ) : (
                <Upload size={28} />
              )}
            </div>
            <p className="font-bold text-sm text-white mb-1">
              {isProcessing ? 'QR-Code wird analysiert…' : 'QR-Code Bild auswählen'}
            </p>
            <p className="text-xs text-slate-400 mb-4 max-w-xs">
              Foto aus der Galerie wählen — Smartphone, Tablet oder Desktop.
            </p>
            {!isProcessing && (
              <div className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all">
                Datei durchsuchen
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        )}

        {/* Feedback */}
        {scanError && (
          <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 text-amber-400 mt-0.5" />
            <span>{scanError}</span>
          </div>
        )}
        {successResult && (
          <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle size={15} className="shrink-0 text-emerald-400" />
            <span className="font-semibold">{successResult}</span>
          </div>
        )}
      </div>

      {/* Scanning laser animation */}
      <style>{`
        @keyframes scanLaser {
          0%   { top: 5%; }
          50%  { top: 90%; }
          100% { top: 5%; }
        }
      `}</style>

      {/* Hidden canvas for frame processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
