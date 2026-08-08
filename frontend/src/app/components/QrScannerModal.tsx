"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Camera, RefreshCw, CheckCircle2, AlertCircle, Scan, Keyboard } from "lucide-react";

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (qrCode: string) => Promise<void>;
  title?: string;
}

export default function QrScannerModal({
  isOpen,
  onClose,
  onScan,
  title = "QR-Code scannen (Ein- / Ausstempeln)",
}: QrScannerModalProps) {
  const [activeTab, setActiveTab] = useState<"camera" | "manual">("camera");
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && activeTab === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  const startCamera = async () => {
    setCameraError(null);
    setIsScanning(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Kamera wird von diesem Browser nicht unterstützt.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        scanFrames();
      }
    } catch (err: any) {
      console.warn("Camera access failed:", err);
      setCameraError(
        err.message || "Kamerazugriff verweigert oder nicht verfügbar. Bitte manuelle Eingabe nutzen."
      );
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  const scanFrames = () => {
    if (!videoRef.current || processing) {
      animationRef.current = requestAnimationFrame(scanFrames);
      return;
    }

    // Check for native BarcodeDetector if available
    if ("BarcodeDetector" in window) {
      try {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        detector
          .detect(videoRef.current)
          .then(async (barcodes: any[]) => {
            if (barcodes.length > 0 && !processing) {
              const qrValue = barcodes[0].rawValue;
              if (qrValue) {
                await handleCodeDetected(qrValue);
                return;
              }
            }
            animationRef.current = requestAnimationFrame(scanFrames);
          })
          .catch(() => {
            animationRef.current = requestAnimationFrame(scanFrames);
          });
        return;
      } catch (e) {}
    }

    animationRef.current = requestAnimationFrame(scanFrames);
  };

  const handleCodeDetected = async (code: string) => {
    if (processing) return;
    setProcessing(true);
    stopCamera();

    try {
      await onScan(code);
      setFeedback({ type: "success", message: "QR-Code erfolgreich gescannt!" });
      setTimeout(() => {
        setFeedback(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Fehler beim Verarbeiten des QR-Codes." });
      setTimeout(() => {
        setFeedback(null);
        setProcessing(false);
        if (activeTab === "camera") startCamera();
      }, 2000);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim() || processing) return;
    await handleCodeDetected(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white border border-slate-100 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-scaleIn">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Scan className="w-4 h-4 text-blue-600" /> {title}
            </h4>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
              Hallen-QR-Code an der Tür oder in der Halle scannen
            </p>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          <button
            onClick={() => setActiveTab("camera")}
            className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              activeTab === "camera"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> Kamera-Scan
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              activeTab === "manual"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" /> Manuelle Eingabe
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {activeTab === "camera" && (
            <div className="space-y-3 text-center">
              {cameraError ? (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-800 space-y-3 text-left">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Kamera nicht aktiv</span>
                  </div>
                  <p className="text-[11px] text-amber-700">{cameraError}</p>
                  <button
                    onClick={() => setActiveTab("manual")}
                    className="w-full btn-primary py-2 text-xs"
                  >
                    Zur manuellen QR-Code Eingabe
                  </button>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-square max-w-[280px] mx-auto border-2 border-slate-800 shadow-inner flex items-center justify-center">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    muted
                  />
                  
                  {/* Viewfinder Target overlay */}
                  <div className="absolute inset-0 border-[36px] border-slate-950/60 pointer-events-none flex items-center justify-center">
                    <div className="w-full h-full border-2 border-blue-400 rounded-lg relative animate-pulse">
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-blue-500"></div>
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-blue-500"></div>
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-blue-500"></div>
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-500"></div>
                    </div>
                  </div>

                  {processing && (
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
                      <span className="text-xs font-bold">Verarbeite Scan...</span>
                    </div>
                  )}
                </div>
              )}

              {!cameraError && (
                <p className="text-[11px] text-slate-400 italic">
                  Halte die Kamera auf den Hallen-QR-Code
                </p>
              )}
            </div>
          )}

          {activeTab === "manual" && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  QR-Code Payload / Hallen-ID eingeben
                </label>
                <input
                  type="text"
                  placeholder="z.B. LOGIFLOW:HALL:... oder Hallen-ID"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="input-premium py-2.5 text-xs font-mono"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={!manualCode.trim() || processing}
                className="w-full btn-primary py-2.5 text-xs shadow-sm hover:shadow"
              >
                {processing ? "Wird verarbeitet..." : "QR-Code bestätigen"}
              </button>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="btn-secondary py-1.5 px-4 text-xs"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
