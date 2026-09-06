"use client";

import React, { useState } from "react";
import { API_URL } from "@/config/api";

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientName: string;
  recipientPhone: string;
  onSuccess?: (msg: string) => void;
  onError?: (err: string) => void;
}

interface ButtonItem {
  id: string;
  title: string;
}

export default function WhatsAppModal({
  isOpen,
  onClose,
  recipientName,
  recipientPhone,
  onSuccess,
  onError,
}: WhatsAppModalProps) {
  const [mode, setMode] = useState<"interactive" | "text">("interactive");
  const [header, setHeader] = useState("LogiFlow Schichtplan");
  const [body, setBody] = useState(
    `Hallo ${recipientName}, bitte bestätige deine Schichteinteilung für die kommende Arbeitswoche.`
  );
  const [footer, setFooter] = useState("LogiFlow Warehouse");
  const [buttons, setButtons] = useState<ButtonItem[]>([
    { id: "btn_accept", title: "✅ Bestätigen" },
    { id: "btn_decline", title: "❌ Ablehnen" },
  ]);

  const [textMessage, setTextMessage] = useState(
    `Hallo ${recipientName}, dies ist eine Nachricht aus dem LogiFlow Warehouse Management.`
  );

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!isOpen) return null;

  const handleAddButton = () => {
    if (buttons.length >= 3) return;
    const nextIdx = buttons.length + 1;
    setButtons([...buttons, { id: `btn_${nextIdx}`, title: `Option ${nextIdx}` }]);
  };

  const handleRemoveButton = (index: number) => {
    if (buttons.length <= 1) return;
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const handleButtonChange = (index: number, field: "id" | "title", value: string) => {
    const updated = [...buttons];
    // Meta limits button title to max 20 chars
    const cleanValue = field === "title" ? value.substring(0, 20) : value;
    updated[index] = { ...updated[index], [field]: cleanValue };
    setButtons(updated);
  };

  const applyPreset = (preset: "shift" | "reminder" | "announcement") => {
    if (preset === "shift") {
      setMode("interactive");
      setHeader("LogiFlow Schichtzuweisung");
      setBody(`Hallo ${recipientName}, du bist für die nächste Schicht eingeteilt. Bitte bestätige kurz deine Teilnahme.`);
      setFooter("LogiFlow Warehouse");
      setButtons([
        { id: "btn_shift_yes", title: "✅ Ich bin dabei" },
        { id: "btn_shift_no", title: "❌ Kann nicht" },
      ]);
    } else if (preset === "reminder") {
      setMode("interactive");
      setHeader("Zeiterfassung Erinnerung");
      setBody(`Hallo ${recipientName}, bitte denke daran, deinen Stundenzettel für diese Woche zu prüfen und zu bestätigen.`);
      setFooter("LogiFlow Personal");
      setButtons([
        { id: "btn_timesheet_done", title: "⏱️ Erledigt" },
        { id: "btn_timesheet_help", title: "❓ Frage an Admin" },
      ]);
    } else if (preset === "announcement") {
      setMode("interactive");
      setHeader("Wichtige Mitteilung");
      setBody(`Hallo ${recipientName}, es gibt eine neue betriebliche Mitteilung im LogiFlow System.`);
      setFooter("LogiFlow Management");
      setButtons([
        { id: "btn_ack", title: "👍 Verstanden" },
      ]);
    }
  };

  const handleSendViaApi = async () => {
    setLoading(true);
    setFeedback(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      let endpoint = `${API_URL}/messaging/whatsapp/interactive`;
      let payload: any;

      if (mode === "interactive") {
        payload = {
          phone: recipientPhone,
          header: header.trim() || undefined,
          body: body.trim(),
          footer: footer.trim() || undefined,
          buttons: buttons.map((b) => ({
            id: b.id.trim() || "btn_1",
            title: b.title.trim().substring(0, 20),
          })),
        };
      } else {
        endpoint = `${API_URL}/messaging/whatsapp/send`;
        payload = {
          phone: recipientPhone,
          message: textMessage.trim(),
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({
          type: "success",
          text: "✅ WhatsApp-Nachricht wurde erfolgreich versendet!",
        });
        if (onSuccess) onSuccess("WhatsApp-Nachricht gesendet");
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        const errorDetail = data.error || data.message || "Fehler beim Senden über Meta API";
        setFeedback({
          type: "error",
          text: `❌ ${errorDetail}`,
        });
        if (onError) onError(errorDetail);
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: `Netzwerkfehler: ${err.message}`,
      });
      if (onError) onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWaLink = () => {
    const rawText = mode === "interactive" ? body : textMessage;
    const cleanPhone = recipientPhone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("0")
      ? "49" + cleanPhone.substring(1)
      : cleanPhone;
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(rawText)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg">
              💬
            </div>
            <div>
              <h3 className="font-bold text-lg">WhatsApp Nachricht</h3>
              <p className="text-xs text-emerald-100">
                An: <span className="font-semibold text-white">{recipientName}</span> ({recipientPhone})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Preset Buttons */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
              Vorlagen (Presets)
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset("shift")}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 transition"
              >
                📅 Schichteinteilung
              </button>
              <button
                type="button"
                onClick={() => applyPreset("reminder")}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 hover:bg-sky-100 transition"
              >
                ⏱️ Zeiterfassung
              </button>
              <button
                type="button"
                onClick={() => applyPreset("announcement")}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 hover:bg-purple-100 transition"
              >
                📢 Mitteilung
              </button>
            </div>
          </div>

          {/* Mode Switch */}
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setMode("interactive")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === "interactive"
                  ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              🔘 Interaktive Buttons (Meta Cloud)
            </button>
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === "text"
                  ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              📝 Standard Freitext
            </button>
          </div>

          {mode === "interactive" ? (
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              {/* Header */}
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  Kopfzeile (Optional)
                </label>
                <input
                  type="text"
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                  maxLength={60}
                  placeholder="z. B. LogiFlow Schichtplan"
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  Nachrichtentext <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  placeholder="Deine Nachricht an den Mitarbeiter..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100 resize-none"
                />
              </div>

              {/* Buttons Section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Antwort-Buttons (max. 3 Buttons, max. 20 Zeichen)
                  </label>
                  {buttons.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddButton}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      + Button hinzufügen
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {buttons.map((btn, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={btn.title}
                        onChange={(e) => handleButtonChange(idx, "title", e.target.value)}
                        maxLength={20}
                        placeholder={`Button ${idx + 1} Titel`}
                        className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none font-medium text-slate-800 dark:text-slate-100"
                      />
                      {buttons.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveButton(idx)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                          title="Entfernen"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  Fußzeile (Optional)
                </label>
                <input
                  type="text"
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  maxLength={60}
                  placeholder="z. B. LogiFlow Warehouse"
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  Nachrichtentext
                </label>
                <textarea
                  value={textMessage}
                  onChange={(e) => setTextMessage(e.target.value)}
                  rows={4}
                  placeholder="Freitextnachricht eingeben..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100 resize-none"
                />
              </div>
            </div>
          )}

          {/* Feedback message */}
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                feedback.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
                  : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800"
              }`}
            >
              <span>{feedback.text}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleOpenWaLink}
            className="px-3 py-2 text-xs font-medium rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            🔗 In WhatsApp Web öffnen
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSendViaApi}
              disabled={loading || (mode === "interactive" && !body.trim()) || (mode === "text" && !textMessage.trim())}
              className="px-5 py-2 text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md hover:shadow-lg transition disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Sendet...</span>
                </>
              ) : (
                <>
                  <span>💬 Über Meta API senden</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
