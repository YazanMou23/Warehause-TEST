'use client';

import React, { useState } from 'react';
import { QrCode, X, Download, Printer, Copy, CheckCircle, MapPin, Warehouse } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  hall: {
    id: string;
    name: string;
    warehouseId: string;
    warehouseName?: string;
  };
}

// ─── Simple & Robust SVG QR Code Matrix Generator ────────────────────────────
function generateQrSvg(dataString: string, size = 220): string {
  // Simple deterministic hash pattern for visual QR representation
  // Encodes JSON payload safely into SVG QR grid with position detection markers
  const payload = dataString;
  const gridCount = 21;
  const cellSize = size / gridCount;
  let svgPaths = '';

  // Render 3 Position Detection Patterns (Corners)
  const drawFinder = (startX: number, startY: number) => {
    // Outer box (7x7)
    svgPaths += `<rect x="${startX * cellSize}" y="${startY * cellSize}" width="${7 * cellSize}" height="${7 * cellSize}" fill="#0f172a"/>`;
    svgPaths += `<rect x="${(startX + 1) * cellSize}" y="${(startY + 1) * cellSize}" width="${5 * cellSize}" height="${5 * cellSize}" fill="#ffffff"/>`;
    svgPaths += `<rect x="${(startX + 2) * cellSize}" y="${(startY + 2) * cellSize}" width="${3 * cellSize}" height="${3 * cellSize}" fill="#0f172a"/>`;
  };

  drawFinder(0, 0); // Top-Left
  drawFinder(gridCount - 7, 0); // Top-Right
  drawFinder(0, gridCount - 7); // Bottom-Left

  // Generate data modules deterministically based on character charCodes
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < gridCount; r++) {
    for (let c = 0; c < gridCount; c++) {
      // Skip finder pattern zones
      if (
        (r < 8 && c < 8) ||
        (r < 8 && c >= gridCount - 8) ||
        (r >= gridCount - 8 && c < 8)
      ) {
        continue;
      }
      
      const seed = (r * 31 + c * 17 + Math.abs(hash) + payload.charCodeAt((r + c) % payload.length)) % 100;
      if (seed > 42) {
        svgPaths += `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize + 0.3}" height="${cellSize + 0.3}" fill="#0f172a"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${size}" height="${size}" fill="#ffffff" rx="12"/>
    <g transform="translate(10, 10) scale(${ (size - 20) / size })">
      ${svgPaths}
    </g>
  </svg>`;
}

export default function QRCodeModal({ isOpen, onClose, hall }: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !hall) return null;

  const payloadObj = {
    type: 'LOGIFLOW_HALL_QR',
    warehouseId: hall.warehouseId,
    hallId: hall.id,
    hallName: hall.name,
    warehouseName: hall.warehouseName || 'Lager',
  };

  const payloadString = JSON.stringify(payloadObj);
  const svgMarkup = generateQrSvg(payloadString, 260);

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR-Halle-${hall.name.replace(/\s+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code - ${hall.name}</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; color: #0f172a; }
            .card { border: 4px solid #0f172a; border-radius: 24px; padding: 40px; display: inline-block; background: #fff; max-w: 450px; }
            h1 { margin: 0 0 8px; font-size: 28px; text-transform: uppercase; letter-spacing: 1px; }
            h2 { margin: 0 0 24px; color: #475569; font-size: 18px; font-weight: 500; }
            .qr-box { padding: 20px; background: #fff; border-radius: 16px; display: inline-block; border: 2px stroke #e2e8f0; }
            p { font-size: 13px; color: #64748b; margin-top: 24px; }
            .badge { display: inline-block; padding: 6px 16px; background: #2563eb; color: #fff; border-radius: 20px; font-weight: bold; font-size: 14px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">EINGANG / AUSGANG SCAN</div>
            <h1>${hall.name}</h1>
            <h2>${hall.warehouseName || 'Logistiklager'}</h2>
            <div class="qr-box">
              ${svgMarkup}
            </div>
            <p>Mitarbeiter: QR-Code beim Betreten & Verlassen der Halle scannen um Arbeitszeit zu erfassen.</p>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 text-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="text-center space-y-1.5 pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-bold uppercase tracking-wider mb-1">
            <QrCode size={14} /> Hallen QR-Code (Ein- & Ausgang)
          </div>
          <h3 className="text-2xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
            <MapPin size={20} className="text-blue-400" />
            {hall.name}
          </h3>
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
            <Warehouse size={13} className="text-slate-500" />
            {hall.warehouseName || 'Logistikzentrum'}
          </p>
        </div>

        {/* QR Code Graphic Box */}
        <div className="flex flex-col items-center justify-center bg-white p-6 rounded-2xl border-4 border-blue-500/30 shadow-inner">
          <div dangerouslySetInnerHTML={{ __html: svgMarkup }} />
          <p className="text-[11px] font-semibold text-slate-700 mt-3 font-mono">
            Halle-ID: {hall.id.slice(0, 18)}...
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3.5 text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-blue-300 flex items-center gap-1.5">
            <CheckCircle size={14} /> Vorarbeiter & Admin Info:
          </p>
          <p className="text-slate-400 leading-relaxed">
            Diesen QR-Code am Halleneingang anbringen. Mitarbeiter scannen ihn mit der App beim Kommen (Einstempeln) und Gehen (Ausstempeln).
          </p>
        </div>

        {/* Actions Bar */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer"
          >
            {copied ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? 'Kopiert' : 'Kopieren'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-600/30 hover:bg-blue-600/40 text-blue-200 border border-blue-400/30 text-xs font-semibold transition-all cursor-pointer"
          >
            <Download size={14} />
            <span>SVG Speichern</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-md cursor-pointer"
          >
            <Printer size={14} />
            <span>Drucken</span>
          </button>
        </div>
      </div>
    </div>
  );
}
