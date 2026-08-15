"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, HelpCircle, X } from "lucide-react";

export interface CustomAlertOptions {
  isOpen: boolean;
  title?: string;
  message: string;
  type?: "success" | "error" | "warning" | "info" | "prompt";
  confirmText?: string;
  cancelText?: string;
  inputPlaceholder?: string;
  defaultValue?: string;
  inputType?: "text" | "password" | "number" | "email";
  onConfirm?: (inputValue?: string) => void;
  onCancel?: () => void;
}

export interface CustomAlertModalProps extends Partial<CustomAlertOptions> {
  isOpen?: boolean;
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
  prompt: {
    icon: HelpCircle,
    iconColor: "#4f46e5",
    iconBg: "#eef2ff",
    badgeBg: "#e0e7ff",
    badgeText: "#4338ca",
    badgeLabel: "Eingabe",
    confirmBg: "#4f46e5",
    confirmHover: "#4338ca",
    accent: "#4f46e5",
    headerBorder: "#c7d2fe",
  },
} as const;

export default function CustomAlertModal({
  isOpen,
  title,
  message,
  type = "info",
  confirmText = "OK",
  cancelText,
  inputPlaceholder = "Eingabe...",
  defaultValue = "",
  inputType = "text",
  onConfirm,
  onCancel,
  onClose,
}: CustomAlertModalProps) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.info;
  const Icon = cfg.icon;
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(defaultValue);

  // Sync defaultValue when modal opens
  useEffect(() => {
    if (isOpen) {
      setInputValue(defaultValue);
      setTimeout(() => {
        if (type === "prompt" && inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        } else {
          confirmBtnRef.current?.focus();
        }
      }, 60);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, defaultValue, type]);

  // Handle keyboard shortcuts (Escape -> Cancel, Enter -> Confirm for prompt)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter" && type === "prompt" && document.activeElement === inputRef.current) {
        e.preventDefault();
        handleConfirm();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, inputValue, type]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm(type === "prompt" ? inputValue : undefined);
    }
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
      aria-labelledby="custom-alert-modal-title"
      aria-describedby="custom-alert-modal-desc"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "alertFadeIn 0.18s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCancel();
        }
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          maxWidth: "440px",
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.08)",
          overflow: "hidden",
          animation: "alertScaleIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
          transformOrigin: "center center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent top stripe */}
        <div
          style={{
            height: "4px",
            background: `linear-gradient(90deg, ${cfg.accent}, ${cfg.accent}99)`,
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
                width: "46px",
                height: "46px",
                borderRadius: "14px",
                backgroundColor: cfg.iconBg,
                border: `1.5px solid ${cfg.headerBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon style={{ width: "24px", height: "24px", color: cfg.iconColor }} />
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
                id="custom-alert-modal-title"
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
            type="button"
            onClick={handleCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              padding: "6px",
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
            aria-label="Schließen"
          >
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        {/* Message body */}
        <div
          id="custom-alert-modal-desc"
          style={{
            padding: "4px 20px 16px 20px",
            fontSize: "14px",
            color: "#475569",
            lineHeight: "1.6",
            fontWeight: 400,
            whiteSpace: "pre-line",
          }}
        >
          {message}
        </div>

        {/* Prompt Input field if type === 'prompt' */}
        {type === "prompt" && (
          <div style={{ padding: "0 20px 18px 20px" }}>
            <input
              ref={inputRef}
              type={inputType}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "14px",
                borderRadius: "10px",
                border: "1.5px solid #cbd5e1",
                outline: "none",
                color: "#0f172a",
                backgroundColor: "#f8fafc",
                transition: "all 0.15s ease",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = cfg.accent;
                e.currentTarget.style.backgroundColor = "#ffffff";
                e.currentTarget.style.boxShadow = `0 0 0 3px ${cfg.accent}25`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#cbd5e1";
                e.currentTarget.style.backgroundColor = "#f8fafc";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
        )}

        {/* Divider */}
        <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: 0 }} />

        {/* Action buttons */}
        <div
          style={{
            padding: "14px 20px",
            backgroundColor: "#f8fafc",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {cancelText && (
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: "9px 18px",
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
              padding: "9px 22px",
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
          from { opacity: 0; transform: scale(0.88) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

