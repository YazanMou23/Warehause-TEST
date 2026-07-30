"use client";

import React, { useEffect, useRef } from "react";
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

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle2,
    iconColor: "#16a34a",
    iconBg: "#f0fdf4",
    badgeBg: "#dcfce7",
    badgeText: "#15803d",
    badgeLabel: "Erfolg",
    confirmBg: "#16a34a",
    confirmHover: "#15803d",
    accent: "#16a34a",
    headerBorder: "#bbf7d0",
  },
  error: {
    icon: XCircle,
    iconColor: "#dc2626",
    iconBg: "#fff5f5",
    badgeBg: "#fee2e2",
    badgeText: "#b91c1c",
    badgeLabel: "Fehler",
    confirmBg: "#dc2626",
    confirmHover: "#b91c1c",
    accent: "#dc2626",
    headerBorder: "#fecaca",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "#d97706",
    iconBg: "#fffbeb",
    badgeBg: "#fef3c7",
    badgeText: "#b45309",
    badgeLabel: "Achtung",
    confirmBg: "#d97706",
    confirmHover: "#b45309",
    accent: "#d97706",
    headerBorder: "#fde68a",
  },
  info: {
    icon: Info,
    iconColor: "#2563eb",
    iconBg: "#eff6ff",
    badgeBg: "#dbeafe",
    badgeText: "#1d4ed8",
    badgeLabel: "Hinweis",
    confirmBg: "#2563eb",
    confirmHover: "#1d4ed8",
    accent: "#2563eb",
    headerBorder: "#bfdbfe",
  },
} as const;

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
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus confirm button for keyboard accessibility
      setTimeout(() => confirmBtnRef.current?.focus(), 50);
      // Prevent background scroll
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "alertFadeIn 0.2s ease-out",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          maxWidth: "420px",
          width: "100%",
          boxShadow:
            "0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06)",
          overflow: "hidden",
          animation: "alertScaleIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
          transformOrigin: "center center",
        }}
      >
        {/* Accent top stripe */}
        <div
          style={{
            height: "4px",
            background: `linear-gradient(90deg, ${cfg.accent}, ${cfg.accent}aa)`,
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: "20px 20px 12px 20px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* Icon bubble */}
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                backgroundColor: cfg.iconBg,
                border: `1.5px solid ${cfg.headerBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon
                style={{ width: "24px", height: "24px", color: cfg.iconColor }}
              />
            </div>

            {/* Badge + title */}
            <div>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 10px",
                  borderRadius: "9999px",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  backgroundColor: cfg.badgeBg,
                  color: cfg.badgeText,
                  marginBottom: "4px",
                }}
              >
                {cfg.badgeLabel}
              </span>
              <h4
                id="alert-modal-title"
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#0f172a",
                  lineHeight: "1.3",
                }}
              >
                {title || cfg.badgeLabel}
              </h4>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={handleCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              padding: "4px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f1f5f9";
              (e.currentTarget as HTMLButtonElement).style.color = "#475569";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8";
            }}
          >
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        {/* Message body */}
        <div
          style={{
            padding: "4px 20px 20px 20px",
            fontSize: "14px",
            color: "#475569",
            lineHeight: "1.6",
            fontWeight: 400,
          }}
        >
          {message}
        </div>

        {/* Divider */}
        <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "0 0" }} />

        {/* Action buttons */}
        <div
          style={{
            padding: "16px 20px",
            backgroundColor: "#f8fafc",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          {cancelText && (
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: "9px 20px",
                borderRadius: "10px",
                border: "1.5px solid #e2e8f0",
                backgroundColor: "#ffffff",
                color: "#374151",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f1f5f9";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#cbd5e1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#ffffff";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0";
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            style={{
              padding: "9px 24px",
              borderRadius: "10px",
              border: "none",
              backgroundColor: cfg.confirmBg,
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: `0 4px 12px -2px ${cfg.accent}55`,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = cfg.confirmHover;
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 16px -2px ${cfg.accent}66`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = cfg.confirmBg;
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 12px -2px ${cfg.accent}55`;
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes alertFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes alertScaleIn {
          from { opacity: 0; transform: scale(0.85) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
