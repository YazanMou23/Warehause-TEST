"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

export interface CustomAlertOptions {
  isOpen: boolean;
  title?: string;
  message: string;
  type?: "success" | "error" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface CustomAlertModalProps extends CustomAlertOptions {
  onClose: () => void;
}

export default function CustomAlertModal({
  isOpen,
  title,
  message,
  type = "info",
  confirmText = "OK",
  cancelText,
  onConfirm,
  onCancel,
  onClose,
}: CustomAlertModalProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    onClose();
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-7 h-7 text-emerald-500" />;
      case "error":
        return <XCircle className="w-7 h-7 text-rose-500" />;
      case "warning":
        return <AlertTriangle className="w-7 h-7 text-amber-500" />;
      case "info":
      default:
        return <Info className="w-7 h-7 text-blue-600" />;
    }
  };

  const getHeaderBadgeClass = () => {
    switch (type) {
      case "success":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "error":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "warning":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "info":
      default:
        return "bg-blue-50 text-blue-700 border-blue-200";
    }
  };

  const getConfirmBtnClass = () => {
    switch (type) {
      case "error":
        return "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20";
      case "warning":
        return "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20";
      case "success":
        return "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20";
      case "info":
      default:
        return "bg-[#1d4ed8] hover:bg-blue-700 text-white shadow-blue-500/20";
    }
  };

  const defaultTitle = () => {
    switch (type) {
      case "success":
        return "Erfolg";
      case "error":
        return "Fehler";
      case "warning":
        return "Achtung";
      case "info":
      default:
        return "Hinweis";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-fadeIn">
      <div className="bg-white border border-slate-100 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-scaleIn transform transition-all">
        {/* Top Header Bar */}
        <div className="px-6 pt-6 pb-2 flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 shrink-0">
              {getIcon()}
            </div>
            <div>
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border mb-1 ${getHeaderBadgeClass()}`}>
                {type}
              </span>
              <h4 className="font-extrabold text-slate-800 text-base leading-snug">
                {title || defaultTitle()}
              </h4>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Body */}
        <div className="px-6 py-4 text-xs text-slate-600 leading-relaxed font-medium">
          {message}
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
          {cancelText && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-5 py-2 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 ${getConfirmBtnClass()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
