'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Upload, X, QrCode, AlertCircle, CheckCircle, RefreshCw, Zap } from 'lucide-react';
import jsQR from 'jsqr';

interface QRScannerCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (payload: { warehouseId: string; hallId: string; hallName?: string }) => void;
  title?: string;
  subtitle?: string;
}

export default function QRScannerCameraModal({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'Hallen QR-Code scannen',
  subtitle = 'Halten Sie Ihre Kamera auf den QR-Code am Halleneingang oder laden Sie ein Foto hoch.',
}: QRScannerCameraModalProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [cameraError, setCameraError] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string>('');
  const [successResult, setSuccessResult] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera stream cleanly
  const stopCamera = () => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  // Start live camera stream
  const startCamera = async () => {
    setCameraError('');
    setScanError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera-Zugriff wird von diesem Browser nicht unterstützt.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS Safari
        await videoRef.current.play();
        setIsScanning(true);
        requestAnimationFrame(tick);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(
        err.message || 'Kamera konnte nicht gestartet werden. Bitte gewähren Sie Kamera-Berechtigungen oder nutzen Sie Datei-Upload.'
      );
      setIsScanning(false);
    }
  };

  // Frame scanner loop
  const tick = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animFrameIdRef.current = requestAnimationFrame(tick);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        handleQrPayload(code.data);
        return; // Stop loop on success
      }
    }

    animFrameIdRef.current = requestAnimationFrame(tick);
  };

  // Parse QR Code payload
  const handleQrPayload = (rawData: string) => {
    try {
      let warehouseId = '';
      let hallId = '';
      let hallName = '';

      // Check JSON payload
      if (rawData.startsWith('{') && rawData.endsWith('}')) {
        const json = JSON.parse(rawData);
        if (json.warehouseId && json.hallId) {
          warehouseId = json.warehouseId;
          hallId = json.hallId;
          hallName = json.hallName || '';
        }
      } else if (rawData.startsWith('LOGIFLOW_HALL:')) {
        // Fallback string payload: LOGIFLOW_HALL:<whId>:<hallId>
        const parts = rawData.split(':');
        if (parts.length >= 3) {
          warehouseId = parts[1];
          hallId = parts[2];
        }
      }

      if (!warehouseId || !hallId) {
        setScanError('Ungültiger QR-Code. Bitte scannen Sie den offiziellen Hallen-QR-Code.');
        // Resume scanning after 2.5 seconds
        setTimeout(() => {
          setScanError('');
          if (streamRef.current) {
            animFrameIdRef.current = requestAnimationFrame(tick);
          }
        }, 2500);
        return;
      }

      // Valid QR code found!
      stopCamera();
      setSuccessResult(`Halle erkannt! (ID: ${hallId.slice(0, 8)}...)`);
      setTimeout(() => {
        onScanSuccess({ warehouseId, hallId, hallName });
        onClose();
      }, 600);
    } catch (err) {
      setScanError('Der gescannte QR-Code konnte nicht gelesen werden.');
    }
  };

  // Handle uploaded image file scanning
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError('');
    setSuccessResult('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (code && code.data) {
          handleQrPayload(code.data);
        } else {
          setScanError('Kein gültiger QR-Code im hochgeladenen Bild gefunden. Bitte deutliches Foto wählen.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 text-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 relative">
        {/* Close Button */}
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div className="text-center space-y-1 pt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-bold uppercase tracking-wider mb-1">
            <QrCode size={14} /> {title}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed px-4">{subtitle}</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs font-bold">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'camera' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera size={15} /> Kamera-Scanner
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'upload' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload size={15} /> QR-Foto hochladen
          </button>
        </div>

        {/* Camera View */}
        {activeTab === 'camera' && (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square border-2 border-slate-700 flex flex-col items-center justify-center">
            {isScanning && (
              <>
                <video ref={videoRef} className="w-full h-full object-cover" />
                {/* Target Overlay Laser Frame */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-56 h-56 border-2 border-blue-400 rounded-2xl relative shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                    <div className="w-full h-0.5 bg-blue-400/80 shadow-[0_0_10px_#3b82f6] animate-pulse absolute top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </>
            )}

            {cameraError && (
              <div className="p-6 text-center space-y-3">
                <AlertCircle size={36} className="text-amber-400 mx-auto" />
                <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
                >
                  <RefreshCw size={14} /> Erneut versuchen
                </button>
              </div>
            )}
          </div>
        )}

        {/* Upload View */}
        {activeTab === 'upload' && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500/60 bg-slate-800/40 p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all aspect-square"
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-3">
              <Upload size={28} />
            </div>
            <p className="font-bold text-sm text-white mb-1">QR-Code Bild auswählen</p>
            <p className="text-xs text-slate-400 mb-4 max-w-xs">
              Foto aus der Galerie wählen oder mit der Smartphone-Kamera aufnehmen.
            </p>
            <div className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all">
              Datei durchsuchen
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        )}

        {/* Scan Status Feedback */}
        {scanError && (
          <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-200 flex items-center gap-2 animate-fadeIn">
            <AlertCircle size={16} className="shrink-0 text-amber-400" />
            <span>{scanError}</span>
          </div>
        )}

        {successResult && (
          <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-200 flex items-center gap-2 animate-fadeIn">
            <CheckCircle size={16} className="shrink-0 text-emerald-400" />
            <span className="font-bold">{successResult}</span>
          </div>
        )}
      </div>
    </div>
  );
}
