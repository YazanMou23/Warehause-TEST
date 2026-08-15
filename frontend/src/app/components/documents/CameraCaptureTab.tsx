"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Camera,
  RotateCcw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Layers,
  ChevronRight,
  Eye,
} from "lucide-react";

interface CapturedPage {
  pageNumber: number;
  base64Data: string;
  mimeType: string;
  isBlurry?: boolean;
}

interface CameraCaptureTabProps {
  onDocumentCreated: (doc: {
    originalFileName: string;
    source: "CAMERA";
    mimeType: string;
    pages: { pageNumber: number; base64Data: string; mimeType: string }[];
  }) => void;
}

export default function CameraCaptureTab({ onDocumentCreated }: CameraCaptureTabProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>("");

  // Captured pages in current document session
  const [capturedPages, setCapturedPages] = useState<CapturedPage[]>([]);
  const [autoEnhance, setAutoEnhance] = useState<boolean>(true);
  const [qualityWarning, setQualityWarning] = useState<string>("");
  const [documentTitle, setDocumentTitle] = useState<string>(
    `Kamera_Dokument_${new Date().toISOString().slice(0, 10)}`
  );

  useEffect(() => {
    initCameraDevices();
    return () => {
      stopCameraStream();
    };
  }, []);

  const initCameraDevices = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error("Kamerazugriff wird von diesem Browser nicht unterstützt.");
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
      setDevices(videoDevices);

      if (videoDevices.length > 0) {
        // Prefer environment (back) camera if available
        const backCam = videoDevices.find((d) =>
          d.label.toLowerCase().includes("back") || d.label.toLowerCase().includes("rück")
        );
        const deviceId = backCam ? backCam.deviceId : videoDevices[0].deviceId;
        setSelectedDeviceId(deviceId);
        startCamera(deviceId);
      } else {
        // Try requesting default camera stream
        startCamera();
      }
    } catch (err: any) {
      setCameraError(err.message || "Kamera konnte nicht initialisiert werden.");
    }
  };

  const startCamera = async (deviceId?: string) => {
    stopCameraStream();
    setCameraError("");

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      setCameraActive(false);
      setCameraError(
        "Kamerazugriff verweigert oder keine Kamera verfügbar. Bitte erlaube den Zugriff im Browser."
      );
    }
  };

  const stopCameraStream = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  // Capture single photo from video element
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Optional Auto-Enhance Filter (increase contrast / sharpness)
    if (autoEnhance) {
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        const contrast = 1.15; // +15% contrast boost
        const intercept = 128 * (1 - contrast);
        for (let i = 0; i < d.length; i += 4) {
          d[i] = d[i] * contrast + intercept;     // R
          d[i + 1] = d[i + 1] * contrast + intercept; // G
          d[i + 2] = d[i + 2] * contrast + intercept; // B
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {}
    }

    const base64 = canvas.toDataURL("image/jpeg", 0.92);

    // Simple blur check (variance of Laplacian on small sample)
    const isBlurry = checkSimpleBlur(ctx, canvas.width, canvas.height);
    if (isBlurry) {
      setQualityWarning("Hinweis: Das aufgenommene Foto wirkt etwas unscharf. Für beste OCR-Ergebnisse ruhig halten.");
    } else {
      setQualityWarning("");
    }

    const newPage: CapturedPage = {
      pageNumber: capturedPages.length + 1,
      base64Data: base64,
      mimeType: "image/jpeg",
      isBlurry,
    };

    setCapturedPages((prev) => [...prev, newPage]);
  };

  const checkSimpleBlur = (ctx: CanvasRenderingContext2D, w: number, h: number): boolean => {
    try {
      const sample = ctx.getImageData(Math.floor(w / 4), Math.floor(h / 4), 100, 100).data;
      let totalDiff = 0;
      for (let i = 0; i < sample.length - 4; i += 4) {
        totalDiff += Math.abs(sample[i] - sample[i + 4]);
      }
      const avgDiff = totalDiff / (sample.length / 4);
      return avgDiff < 4.5; // low edge frequency indicates blur
    } catch {
      return false;
    }
  };

  const removePage = (pageNumber: number) => {
    setCapturedPages((prev) =>
      prev
        .filter((p) => p.pageNumber !== pageNumber)
        .map((p, idx) => ({ ...p, pageNumber: idx + 1 }))
    );
  };

  const handleFinishDocument = () => {
    if (capturedPages.length === 0) return;

    onDocumentCreated({
      originalFileName: `${documentTitle || "Kamera_Dokument"}.jpg`,
      source: "CAMERA",
      mimeType: "image/jpeg",
      pages: capturedPages,
    });

    setCapturedPages([]);
    setQualityWarning("");
  };

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Viewfinder & Controls */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
        {/* Device Switcher & Settings */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Camera className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-slate-100 text-sm">Live-Kamera Erfassung</h3>
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            {devices.length > 1 && (
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  startCamera(e.target.value);
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500"
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Kamera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}

            <label className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoEnhance}
                onChange={(e) => setAutoEnhance(e.target.checked)}
                className="rounded border-slate-700 text-purple-600 focus:ring-0 bg-slate-950"
              />
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Auto-Kontrast</span>
            </label>
          </div>
        </div>

        {/* Viewfinder Frame */}
        <div className="relative aspect-video max-h-[380px] w-full bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`}
          />

          {/* Document Framing Overlay Guide */}
          {cameraActive && (
            <div className="absolute inset-6 border-2 border-dashed border-purple-500/50 rounded-lg pointer-events-none flex items-center justify-center">
              <div className="absolute top-2 left-2 text-[10px] bg-black/60 px-2 py-0.5 rounded text-purple-300 backdrop-blur-sm">
                Dokument im Rahmen platzieren
              </div>
            </div>
          )}

          {!cameraActive && (
            <div className="text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto border border-purple-500/20">
                <Camera className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-400 max-w-sm">
                {cameraError || "Kamera ist nicht aktiv."}
              </p>
              <button
                type="button"
                onClick={() => startCamera(selectedDeviceId)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Kamera starten
              </button>
            </div>
          )}
        </div>

        {/* Shutter Button */}
        {cameraActive && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={capturePhoto}
              className="flex items-center space-x-2 px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm rounded-full shadow-lg shadow-purple-600/30 transition-all active:scale-95"
            >
              <Camera className="w-5 h-5" />
              <span>Foto aufnehmen (Seite {capturedPages.length + 1})</span>
            </button>
          </div>
        )}

        {qualityWarning && (
          <div className="flex items-center space-x-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{qualityWarning}</span>
          </div>
        )}
      </div>

      {/* Captured Pages Strip */}
      {capturedPages.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Aufgenommene Seiten ({capturedPages.length})</span>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                placeholder="Dokumentenname"
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Grid of thumbnails */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {capturedPages.map((page) => (
              <div
                key={page.pageNumber}
                className="relative group rounded-lg overflow-hidden border border-slate-800 bg-slate-950"
              >
                <img
                  src={page.base64Data}
                  alt={`Seite ${page.pageNumber}`}
                  className="w-full h-28 object-cover"
                />
                <div className="absolute top-1.5 left-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white">
                  Seite {page.pageNumber}
                </div>
                <button
                  type="button"
                  onClick={() => removePage(page.pageNumber)}
                  className="absolute top-1.5 right-1.5 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded transition-opacity opacity-0 group-hover:opacity-100"
                  title="Seite löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleFinishDocument}
              className="flex items-center space-x-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-lg shadow-emerald-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Dokument fertigstellen ({capturedPages.length} Seiten)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
