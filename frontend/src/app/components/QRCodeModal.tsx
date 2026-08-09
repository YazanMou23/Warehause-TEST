'use client';

import React, { useState, useEffect } from 'react';
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

export default function QRCodeModal({ isOpen, onClose, hall }: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrSvgString, setQrSvgString] = useState<string>('');

  // Build the payload string (stable across renders)
  const payloadString = isOpen && hall ? JSON.stringify({
    type: 'LOGIFLOW_HALL_QR',
    warehouseId: hall.warehouseId,
    hallId: hall.id,
    hallName: hall.name,
    warehouseName: hall.warehouseName || 'Lager',
  }) : '';

  // ─── Generate REAL scannable QR code via qrcode library ───────────────────
  useEffect(() => {
    if (!isOpen || !payloadString) {
      setQrDataUrl('');
      setQrSvgString('');
      return;
    }

    let cancelled = false;

    const generate = async () => {
      try {
        const QRCode = (await import('qrcode')).default;

        const dataUrl = await QRCode.toDataURL(payloadString, {
          errorCorrectionLevel: 'H',
          width: 280,
          margin: 2,
          color: { dark: '#0f172a', light: '#ffffff' },
        });

        const svgStr = await QRCode.toString(payloadString, {
          type: 'svg',
          errorCorrectionLevel: 'H',
          width: 280,
          margin: 2,
          color: { dark: '#0f172a', light: '#ffffff' },
        });

        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setQrSvgString(svgStr);
        }
      } catch (err) {
        console.error('[QRCodeModal] QR generation failed:', err);
      }
    };

    generate();
    return () => { cancelled = true; };
  }, [isOpen, payloadString]);

  if (!isOpen || !hall) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!qrSvgString) return;
    const blob = new Blob([qrSvgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR-Halle-${hall.name.replace(/\s+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!qrSvgString) return;
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code - ${hall.name}</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; color: #0f172a; }
            .card { border: 4px solid #0f172a; border-radius: 24px; padding: 40px; display: inline-block; background: #fff; }
            h1 { margin: 0 0 8px; font-size: 28px; text-transform: uppercase; letter-spacing: 1px; }
            h2 { margin: 0 0 24px; color: #475569; font-size: 18px; font-weight: 500; }
            .qr-box { padding: 20px; background: #fff; border-radius: 16px; display: inline-block; border: 2px solid #e2e8f0; }
            p { font-size: 13px; color: #64748b; margin-top: 24px; }
            .badge { display: inline-block; padding: 6px 16px; background: #2563eb; color: #fff; border-radius: 20px; font-weight: bold; font-size: 14px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">EINGANG / AUSGANG SCAN</div>
            <h1>${hall.name}</h1>
            <h2>${hall.warehouseName || 'Logistiklager'}</h2>
            <div class="qr-box">${qrSvgString}</div>
            <p>Mitarbeiter: QR-Code beim Betreten &amp; Verlassen der Halle scannen um Arbeitszeit zu erfassen.</p>
          </div>
          <script>window.onload = function() { window.print(); window.close(); }<\/script>
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
            <QrCode size={14} /> Hallen QR-Code (Ein- &amp; Ausgang)
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

        {/* Real Scannable QR Code */}
        <div className="flex flex-col items-center justify-center bg-white p-5 rounded-2xl border-4 border-blue-500/30 shadow-inner min-h-[200px]">
          {qrDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`QR Code ${hall.name}`}
                width={260}
                height={260}
                style={{ imageRendering: 'pixelated', display: 'block' }}
              />
              <p className="text-[11px] font-semibold text-slate-600 mt-2 font-mono text-center">
                {hall.name} &bull; {hall.warehouseName || 'Lager'}
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400">QR-Code wird generiert…</p>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3.5 text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-blue-300 flex items-center gap-1.5">
            <CheckCircle size={14} /> Vorarbeiter &amp; Admin Info:
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
            disabled={!qrSvgString}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-600/30 hover:bg-blue-600/40 text-blue-200 border border-blue-400/30 text-xs font-semibold transition-all cursor-pointer disabled:opacity-40"
          >
            <Download size={14} />
            <span>SVG Speichern</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={!qrSvgString}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-md cursor-pointer disabled:opacity-40"
          >
            <Printer size={14} />
            <span>Drucken</span>
          </button>
        </div>
      </div>
    </div>
  );
}
