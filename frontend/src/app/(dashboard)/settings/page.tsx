"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, Bell, Shield, MessageSquare, AlertTriangle, CheckCircle, Info, Globe } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import ConnectorSettingsCard from "../../components/ConnectorSettingsCard";

export default function SettingsPage() {
  const { t, language, changeLanguage } = useTranslation();
  const [apiEndpoint, setApiEndpoint] = useState(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}`);
  const [broadcastMessage, setBroadcastMessage] = useState("LogiFlow system maintenance tonight at 22:00 CET.");
  
  const [isOffline, setIsOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ text: "", type: "" });
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    // Verify online status
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setIsOffline(!res.ok))
      .catch(() => setIsOffline(true));
  }, [router]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;

    setSubmitting(true);
    setToast({ text: "", type: "" });

    const token = localStorage.getItem("accessToken");

    if (isOffline) {
      setTimeout(() => {
        setToast({ text: "Emergency broadcast sent via mock channel successfully!", type: "success" });
        setSubmitting(false);
      }, 600);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/telegram/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: broadcastMessage })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to broadcast");

      setToast({
        text: `Broadcast successful! Sent to ${data.successCount || 0} active employees.`,
        type: "success"
      });
    } catch (err: any) {
      setToast({ text: err.message || "Broadcast request failed.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-stack-lg animate-fadeIn max-w-4xl text-on-background">
      <div>
        <h3 className="font-headline-lg font-bold text-on-surface">{t("systemControlSettings")}</h3>
        <p className="text-on-surface-variant font-body-sm">
          {t("settingsSubtitle")}
        </p>
      </div>

      {isOffline && (
        <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-2 rounded-lg flex items-center gap-2 text-label-md">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>{t("sandboxMode")}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
        
        {/* Language Selection Card */}
        <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm space-y-4">
          <h5 className="font-bold text-body-lg flex items-center gap-2 text-on-surface">
            <Globe className="w-5 h-5 text-secondary" /> {t("languageSelection")}
          </h5>
          
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
              {t("languageSelectLabel")}
            </label>
            <select
              value={language}
              onChange={(e) => changeLanguage(e.target.value as any)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2.5 text-body-sm outline-none focus:ring-1 focus:ring-secondary focus:border-transparent font-medium"
            >
              <option value="de">{t("german")}</option>
              <option value="en">{t("english")}</option>
            </select>
          </div>
        </div>

        {/* API Settings */}
        <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm space-y-4">
          <h5 className="font-bold text-body-lg flex items-center gap-2 text-on-surface">
            <Shield className="w-5 h-5 text-secondary" /> {t("connectionConfig")}
          </h5>
          
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
              {t("backendEndpoint")}
            </label>
            <input
              type="text"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm outline-none focus:ring-1 focus:ring-secondary focus:border-transparent font-mono"
            />
          </div>

          <div className="text-[12px] text-outline flex items-start gap-1.5 bg-surface-container-low p-2.5 rounded border border-outline-variant">
            <Info className="w-4 h-4 shrink-0 text-secondary mt-0.5" />
            <span>{t("connectionTip")}</span>
          </div>
        </div>

        {/* Scanner Connector Card — full width */}
        <div className="md:col-span-2">
          <ConnectorSettingsCard />
        </div>

        {/* Telegram broadcast panel */}
        <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm space-y-4 md:col-span-2">
          <h5 className="font-bold text-body-lg flex items-center gap-2 text-on-surface">
            <Bell className="w-5 h-5 text-secondary" /> {t("emergencyAlert")}
          </h5>

          <form onSubmit={handleBroadcast} className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-outline uppercase tracking-wider">
                {t("broadcastMessageLabel")}
              </label>
              <textarea
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                rows={3}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm outline-none focus:ring-1 focus:ring-secondary focus:border-transparent resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer text-body-sm"
            >
              <MessageSquare className="w-4 h-4" /> {t("triggerAlert")}
            </button>
          </form>
        </div>
      </div>

      {/* Toast Notification */}
      {toast.text && (
        <div
          className={`p-4 rounded-lg flex items-start gap-2.5 text-body-sm shadow-md animate-slideUp ${
            toast.type === "success"
              ? "bg-emerald-100 border border-emerald-300 text-emerald-800"
              : "bg-error-container border border-[#ffdad6] text-error"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-error" />
          )}
          <div>
            <p className="font-bold">{toast.type === "success" ? t("success") : t("errorOccurred")}</p>
            <p className="text-[13px] opacity-90">{toast.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
