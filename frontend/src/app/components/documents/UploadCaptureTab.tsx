"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, FileText, Image as ImageIcon, CheckCircle2, AlertTriangle, X } from "lucide-react";

interface UploadedDocumentItem {
  originalFileName: string;
  source: "UPLOAD" | "DRAG_AND_DROP";
  mimeType: string;
  pages: { pageNumber: number; base64Data: string; mimeType: string }[];
}

interface UploadCaptureTabProps {
  onFilesAdded: (docs: UploadedDocumentItem[]) => void;
}

export default function UploadCaptureTab({ onFilesAdded }: UploadCaptureTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files), "DRAG_AND_DROP");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files), "UPLOAD");
      e.target.value = "";
    }
  };

  const processFiles = async (
    files: File[],
    source: "UPLOAD" | "DRAG_AND_DROP"
  ) => {
    setLoading(true);
    setErrorMsg("");

    const validDocs: UploadedDocumentItem[] = [];

    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      if (!isImage && !isPdf) {
        setErrorMsg(`Format von "${file.name}" wird nicht unterstützt. Bitte PDF oder Bilddateien (JPG, PNG) hochladen.`);
        continue;
      }

      try {
        let pages: { pageNumber: number; base64Data: string; mimeType: string }[];
        let mimeType: string;

        if (isPdf) {
          // Split a multi-page PDF into individual page images so the
          // processing pipeline reads and OCRs every page one by one.
          const rendered = await convertPdfToPageImages(file);
          if (rendered.length === 0) {
            throw new Error("Das PDF enthält keine lesbaren Seiten.");
          }
          pages = rendered;
          // Pages are rendered as JPEG images for OCR; keeping this as the
          // document mime type ensures the backend stores/OCR's images.
          mimeType = "image/jpeg";
        } else {
          const base64 = await readFileAsBase64(file);
          mimeType = file.type || "image/jpeg";
          pages = [
            {
              pageNumber: 1,
              base64Data: base64,
              mimeType,
            },
          ];
        }

        validDocs.push({
          originalFileName: file.name,
          source,
          mimeType,
          pages,
        });
      } catch (err: any) {
        setErrorMsg(`Fehler beim Lesen von "${file.name}": ${err.message}`);
      }
    }

    setLoading(false);
    if (validDocs.length > 0) {
      onFilesAdded(validDocs);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Render every page of a PDF to a JPEG image using pdf.js.
  const convertPdfToPageImages = async (
    file: File
  ): Promise<{ pageNumber: number; base64Data: string; mimeType: string }[]> => {
    // Lazily load pdf.js only when a PDF is actually uploaded, and only in
    // the browser (this handler runs client-side). This keeps the library out
    // of the initial bundle and avoids Node/SSR evaluation of the module.
    const pdfjs = await import("pdfjs-dist");
    const pdfjsLib: any = (pdfjs as any).default || pdfjs;

    if (pdfjsLib?.GlobalWorkerOptions) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
      } catch {
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '6.3.289'}/build/pdf.worker.min.mjs`;
        } catch {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        }
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const scale = 2; // high quality for OCR

    try {
      const pageImages: { pageNumber: number; base64Data: string; mimeType: string }[] = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas-Rendering wird nicht unterstützt.");
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const base64Data = canvas.toDataURL("image/jpeg", 0.9);
        pageImages.push({ pageNumber: pageNum, base64Data, mimeType: "image/jpeg" });
        page.cleanup();
      }
      return pageImages;
    } finally {
      loadingTask.destroy();
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Drag and Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
            : "border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/60"
        }`}
      >
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shadow-lg shadow-blue-500/10">
            <UploadCloud className="w-8 h-8" />
          </div>

          <div className="space-y-1 max-w-md">
            <p className="text-base font-semibold text-slate-100">
              Dateien hier ablegen oder zum Durchsuchen klicken
            </p>
            <p className="text-xs text-slate-400">
              Unterstützt mehrseitige PDFs, hochauflösende Dokumentfotos (JPG, PNG, WEBP) bis 25 MB pro Datei.
            </p>
          </div>

          <button
            type="button"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            Dateien auswählen
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-2 text-xs text-blue-400 animate-pulse">
          Dateien werden vorbereitet...
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
