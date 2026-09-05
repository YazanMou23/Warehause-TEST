"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Trash2,
  ArrowLeft,
  Phone,
  Building2,
  Mail,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  ShieldAlert,
  Clock,
  ExternalLink,
} from "lucide-react";

export default function DatenloeschungPage() {
  const [lang, setLang] = useState<"de" | "en">("de");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-rose-100 selection:text-rose-900">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/datenschutz"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {lang === "de" ? "Zur Datenschutzerklärung" : "To Privacy Policy"}
            </Link>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white shadow-sm font-black text-sm">
                L
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm leading-tight block">
                  LogiFlow
                </span>
                <span className="text-[10px] text-slate-500 block">MDL Datenverwaltung</span>
              </div>
            </div>
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setLang("de")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                lang === "de"
                  ? "bg-white text-rose-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              DE
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                lang === "en"
                  ? "bg-white text-rose-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header Card */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xs">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <Trash2 className="w-3.5 h-3.5" />
                Meta User Data Deletion Instructions
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                DSGVO Art. 17
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {lang === "de"
                ? "Anleitung zur Löschung von Nutzerdaten"
                : "User Data Deletion Instructions"}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
              {lang === "de"
                ? "Gemäß den Richtlinien der Meta Platform (Facebook / WhatsApp Business) und Artikel 17 der DSGVO („Recht auf Löschung“) erfahren Sie hier, wie Sie die vollständige Löschung Ihrer Daten beantragen können."
                : "In compliance with Meta Platform Terms (Facebook / WhatsApp Business) and Article 17 GDPR ('Right to erasure'), this guide explains how you can request the complete deletion of your data from our systems."}
            </p>

            {/* Direct Contact for Deletion */}
            <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {lang === "de" ? "Verantwortliche Kontaktstelle für Datenlöschung:" : "Direct Contact for Erasure Requests:"}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  MDL
                </div>
                <div className="hidden sm:block text-slate-300">•</div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <a href="tel:017663477268" className="text-blue-600 hover:underline font-semibold">
                    017663477268 (+49 176 63477268)
                  </a>
                </div>
                <div className="hidden sm:block text-slate-300">•</div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail className="w-4 h-4 text-slate-500" />
                  <span>datenschutz@mdl-lager.de</span>
                </div>
              </div>
            </div>
          </div>

          {/* Steps for Deletion */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-10 shadow-xs space-y-8">
            <h2 className="text-lg font-bold text-slate-900">
              {lang === "de"
                ? "Wie Sie Ihre Daten in 3 Schritten löschen lassen:"
                : "How to request data erasure in 3 steps:"}
            </h2>

            <div className="space-y-6">
              {/* Step 1 */}
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                  1
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-base">
                    {lang === "de" ? "Löschanfrage einreichen" : "Submit Deletion Request"}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {lang === "de" ? (
                      <>
                        Senden Sie uns eine formlose Anfrage per Telefon unter{" "}
                        <a href="tel:017663477268" className="text-blue-600 hover:underline font-semibold">
                          017663477268
                        </a>{" "}
                        oder per E-Mail an <strong>datenschutz@mdl-lager.de</strong> mit dem
                        Betreff <em>„Antrag auf Datenlöschung / Meta App Data Deletion“</em>.
                        Geben Sie bitte Ihre registrierte Mobiltelefonnummer bzw. Ihren
                        Mitarbeiternamen an.
                      </>
                    ) : (
                      <>
                        Contact us by phone at{" "}
                        <a href="tel:017663477268" className="text-blue-600 hover:underline font-semibold">
                          +49 176 63477268
                        </a>{" "}
                        or by email to <strong>datenschutz@mdl-lager.de</strong> with the subject{" "}
                        <em>&quot;Meta App Data Deletion Request&quot;</em>. Please provide your
                        registered mobile phone number or username.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                  2
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-base">
                    {lang === "de" ? "Verifikation & Prüfung" : "Verification & Processing"}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {lang === "de" ? (
                      <>
                        Zum Schutz vor unbefugten Löschungen verifizieren wir kurz Ihre
                        Identität (z. B. durch einen kurzen SMS-/WhatsApp-Bestätigungscode oder
                        Rückruf). Anschließend stoppen wir sofort alle weiteren
                        WhatsApp-Benachrichtigungen an diese Rufnummer.
                      </>
                    ) : (
                      <>
                        To protect your identity against unauthorized deletion attempts, we verify
                        ownership of the phone number. All automated notifications and messaging
                        dispatch to this number will immediately be paused.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                  3
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-base">
                    {lang === "de"
                      ? "Vollständige Löschung & Bestätigung"
                      : "Complete Erasure & Confirmation"}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {lang === "de" ? (
                      <>
                        Wir löschen Ihre Telefonnummer, Profilverknüpfungen und temporären
                        Nachrichten-Logs vollständig aus unserer LogiFlow-Datenbank und trennen
                        alle Meta WhatsApp Cloud API Verknüpfungen. Nach Abschluss erhalten Sie eine
                        schriftliche Bestätigung über die erfolgte Datenlöschung (Bearbeitungszeit
                        in der Regel unter 48 Stunden, spätestens innerhalb der gesetzlichen Frist
                        von 30 Tagen).
                      </>
                    ) : (
                      <>
                        We permanently erase your telephone number, profile connections, and
                        temporary messaging logs from our LogiFlow database, and sever any Meta
                        WhatsApp Cloud API linkages. You will receive written confirmation once the
                        erasure has been completed (typically within 48 hours, at most 30 days as
                        mandated by GDPR).
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Note on Facebook / Meta Account Settings */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5 text-xs sm:text-sm text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                {lang === "de"
                  ? "Zusätzlicher Hinweis für verbundene Meta-Dienste:"
                  : "Additional notice for linked Meta services:"}
              </div>
              <p className="leading-relaxed">
                {lang === "de"
                  ? "Falls Sie eine App über Ihr Facebook-Konto autorisiert haben, können Sie den Zugriff auch direkt in Ihrem Meta-Konto widerrufen: Gehen Sie zu Facebook Einstellungen & Privatsphäre > Einstellungen > Apps und Websites > LogiFlow / MDL auswählen und auf „Entfernen“ klicken."
                  : "If you connected an app via your Facebook profile, you can also revoke authorization via Meta account settings: Go to Facebook Settings & Privacy > Settings > Apps and Websites > Select LogiFlow / MDL and click 'Remove'."}
              </p>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <Link
                href="/datenschutz"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
              >
                <FileCheck className="w-4 h-4" />
                {lang === "de" ? "Vollständige Datenschutzerklärung lesen" : "Read Full Privacy Policy"}
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {lang === "de" ? "Zurück zum Login" : "Back to Login"}
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} MDL · LogiFlow Warehouse Management System
      </footer>
    </div>
  );
}
