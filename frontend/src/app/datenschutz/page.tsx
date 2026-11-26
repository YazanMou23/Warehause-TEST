"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ArrowLeft,
  Phone,
  Building2,
  Lock,
  Globe,
  FileText,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Clock,
} from "lucide-react";

export default function DatenschutzPage() {
  const [lang, setLang] = useState<"de" | "en">("de");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-blue-100 selection:text-blue-900">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {lang === "de" ? "Zurück zum Login" : "Back to Login"}
            </Link>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm font-black text-sm">
                L
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm leading-tight block">
                  LogiFlow
                </span>
                <span className="text-[10px] text-slate-500 block">Warehouse Management</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLang("de")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  lang === "de"
                    ? "bg-white text-blue-700 shadow-xs font-bold"
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
                    ? "bg-white text-blue-700 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header Badge & Title */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xs">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                DSGVO / GDPR Compliant
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                <Clock className="w-3.5 h-3.5" />
                {lang === "de" ? "Stand: November 2026 (Entwurf)" : "Effective: November 2026 (draft)"}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                Meta App & WhatsApp Cloud API
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {lang === "de" ? "Datenschutzerklärung" : "Privacy Policy"}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
              {lang === "de"
                ? "Informationen über die Erhebung, Verarbeitung und Nutzung personenbezogener Daten im Rahmen der LogiFlow Warehouse Management Plattform sowie über die Meta-Plattform und WhatsApp Cloud API Schnittstellen."
                : "Information regarding the collection, processing, and usage of personal data within the LogiFlow Warehouse Management platform, including Meta Platform and WhatsApp Cloud API integrations."}
            </p>

            {/* Quick Contact Card */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div className="flex items-start gap-2.5">
                <Building2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900">
                    {lang === "de" ? "Verantwortlicher" : "Data Controller"}
                  </div>
                  <div className="text-slate-600 font-medium">{lang === "de" ? "Ihr Arbeitgeber / Auftraggeber (Kunde)" : "Your employer / client (customer)"}</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Phone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900">
                    {lang === "de" ? "Anbieter" : "Provider"}
                  </div>
                  <Link href="/impressum" className="text-blue-600 hover:underline font-medium">Impressum</Link>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Trash2 className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900">
                    {lang === "de" ? "Datenlöschung" : "Data Deletion"}
                  </div>
                  <Link
                    href="/datenloeschung"
                    className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    {lang === "de" ? "Anleitung öffnen" : "View Instructions"}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Body */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-10 shadow-xs space-y-8 text-sm sm:text-base leading-relaxed">
            {lang === "de" ? (
              <>
                {/* 1. Verantwortlicher */}
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    Verantwortliche Stelle
                  </h2>
                  <p className="text-slate-700">
                    <strong>Rolle des Anbieters:</strong> Diese Plattform (LogiFlow / Warehause) wird als
                    Software-as-a-Service von <strong>Yazan Moussa</strong> (Einzelunternehmer),
                    Friedrich-Alfred-Str. 158, 47226 Duisburg, bereitgestellt (siehe{" "}
                    <Link href="/impressum" className="text-blue-600 hover:underline">Impressum</Link>).
                    Der Anbieter verarbeitet personenbezogene Daten in der Regel im Auftrag des jeweiligen
                    Kunden (Art. 28 DSGVO) und nach dessen Weisungen.
                  </p>
                  <p className="text-slate-700">
                    <strong>Verantwortlicher</strong> im Sinne von Art. 4 Nr. 7 DSGVO für die Daten der
                    Mitarbeitenden, Einsatzplanung, Stundennachweise und Dokumente ist das jeweilige
                    Unternehmen, das die Plattform einsetzt (Ihr Arbeitgeber bzw. Auftraggeber). Dessen
                    Angaben und Datenschutzkontakt stellt Ihnen dieses Unternehmen zur Verfügung.
                    Anfragen zu Ihren Daten richten Sie bitte zuerst an dieses Unternehmen.
                  </p>
                  <p className="text-slate-700">
                    Für Daten, die der Anbieter in eigener Verantwortung verarbeitet (Betrieb, Sicherheit,
                    Abrechnung mit dem Kunden), ist Verantwortlicher Yazan Moussa. Kontakt:{" "}
                    <a href="mailto:info@yazan-tech.com" className="text-blue-600 hover:underline">info@yazan-tech.com</a>.
                  </p>
                </section>

                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900">1a. Eingesetzte Dienstleister (Unterauftragsverarbeiter)</h2>
                  <p className="text-slate-700">
                    Der Anbieter setzt folgende Dienstleister ein. Welche davon bei einem Kunden aktiv sind,
                    hängt von der Konfiguration ab:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                    <li><strong>Vercel</strong> (Hosting der Weboberfläche)</li>
                    <li><strong>Render</strong> (Hosting der Server-Anwendung, Dateiablage für hochgeladene Dokumente)</li>
                    <li><strong>Neon</strong> (PostgreSQL-Datenbank)</li>
                    <li><strong>Meta Platforms Ireland Limited</strong> (WhatsApp Business Cloud API: Versand und Empfang von Nachrichten)</li>
                    <li><strong>Resend</strong> (Versand von System-E-Mails, z. B. Schichtzuweisung, Passwort-Zurücksetzen)</li>
                    <li><strong>OpenAI</strong> (Texterkennung und Auswertung hochgeladener Stundenzettel, Dokumente und Containerlisten; Bilder und Dokumentinhalte werden dafür an die API übermittelt)</li>
                  </ul>
                  <p className="text-slate-700 text-sm">
                    Einige dieser Dienstleister können Daten in Drittländern (z. B. USA) verarbeiten.
                    Grundlage sind Angemessenheitsbeschlüsse bzw. Standardvertragsklauseln nach
                    Art. 44 ff. DSGVO. Die aktuelle Liste stellt der Anbieter Kunden auf Anfrage zur Verfügung.
                  </p>
                </section>

                {/* 2. Geltungsbereich & Verarbeitungszweck */}
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      2
                    </span>
                    Geltungsbereich & Zweck der Datenverarbeitung
                  </h2>
                  <p className="text-slate-700">
                    Die Plattform <strong>LogiFlow Warehouse Management</strong> dient der
                    betrieblichen Steuerung logistischer Abläufe des jeweiligen Kunden, darunter:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                    <li>
                      Verwaltung von Mitarbeiterstammdaten, Zeiterfassung und Stundennachweisen.
                    </li>
                    <li>
                      Einsatz- und Schichtplanung von Lagerpersonal sowie Hallenzuweisung.
                    </li>
                    <li>
                      Verwaltung von Containern, Lieferscheinen, Frachtpapieren und
                      Begleitdokumenten.
                    </li>
                    <li>
                      Betriebliche Benachrichtigungen über anstehende Schichten, Planungsänderungen
                      und dringende Lagervorfälle über autorisierte Kommunikationskanäle (u. a.
                      WhatsApp).
                    </li>
                  </ul>
                </section>

                {/* 3. Meta Platforms & WhatsApp Cloud API */}
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      3
                    </span>
                    Einsatz der Meta Platforms & WhatsApp Cloud API
                  </h2>
                  <p className="text-slate-700">
                    Zur schnellen und zuverlässigen Übermittlung von Schichtplan-Informationen,
                    Arbeitszeiten und betrieblichen Aktualisierungen an unsere registrierten
                    Mitarbeiter nutzt LogiFlow die offizielle <strong>WhatsApp Cloud API</strong>{" "}
                    von <strong>Meta Platforms Ireland Limited</strong> (4 Grand Canal Square,
                    Grand Canal Harbour, Dublin 2, Irland).
                  </p>

                  <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 space-y-2 text-sm text-slate-800">
                    <p className="font-semibold text-blue-900">
                      Hierbei verarbeitete Datenkategorien:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-slate-700">
                      <li>
                        <strong>Mobiltelefonnummer</strong> des Empfängers (im internationalen
                        Format).
                      </li>
                      <li>
                        <strong>Vor- und Nachname bzw. Benutzerkennung</strong> im Schichtsystem.
                      </li>
                      <li>
                        <strong>Nachrichteninhalt:</strong> Schichttermine, Hallenzuweisung,
                        Arbeitsbeginn/Ende sowie systemische Bestätigungsmeldungen.
                      </li>
                      <li>
                        <strong>Metadaten & Zeitstempel:</strong> Zeitpunkt des Versands,
                        Zustellungsstatus (Delivered, Read), Fehlermeldungen bei unzustellbaren
                        Nachrichten.
                      </li>
                    </ul>
                  </div>

                  <p className="text-slate-700">
                    Meta verarbeitet Daten unter Einhaltung der europäischen
                    Standardvertragsklauseln (Standard Contractual Clauses – SCCs) sowie der
                    Datenverarbeitungsbedingungen für Meta Business Tools. Eine Weitergabe der
                    Telefonnummern für Werbezwecke durch uns ist strikt ausgeschlossen.
                  </p>
                </section>

                {/* 4. Rechtsgrundlagen */}
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      4
                    </span>
                    Rechtsgrundlagen der Verarbeitung (DSGVO)
                  </h2>
                  <p className="text-slate-700">
                    Die Verarbeitung der personenbezogenen Daten stützt sich auf folgende
                    Grundlagen der DSGVO:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                    <li>
                      <strong>Art. 6 Abs. 1 lit. b DSGVO:</strong> Zur Erfüllung des
                      Arbeits- bzw. Dienstverhältnisses, der Schichtzuweisung und der
                      Zeiterfassung.
                    </li>
                    <li>
                      <strong>Art. 6 Abs. 1 lit. f DSGVO:</strong> Unser berechtigtes Interesse
                      an einem reibungslosen, effizienten und sicheren Lager- und
                      Logistikbetrieb.
                    </li>
                    <li>
                      <strong>Art. 6 Abs. 1 lit. a DSGVO:</strong> Sofern eine freiwillige
                      Zustimmung zur Kontaktaufnahme über Instant-Messaging-Dienste erteilt wurde.
                    </li>
                  </ul>
                </section>

                {/* 5. Speicherdauer */}
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      5
                    </span>
                    Speicherdauer & Aufbewahrungsfristen
                  </h2>
                  <p className="text-slate-700">
                    Personenbezogene Daten werden nur so lange gespeichert, wie es für die
                    Erreichung der Zwecke (Betrieb der Lagerverwaltung, Nachweis von Arbeitszeiten)
                    erforderlich ist oder gesetzliche gesetzliche Aufbewahrungsfristen (z. B. nach
                    Handels- und Steuerrecht, Arbeitszeitgesetz) dies vorschreiben.
                  </p>
                  <p className="text-slate-700">
                    Temporäre Kommunikationslogs (z. B. API-Statusmeldungen) werden in regelmäßigen
                    Abständen bereinigt.
                  </p>
                </section>

                {/* 6. Betroffenenrechte */}
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      6
                    </span>
                    Ihre Rechte als betroffene Person
                  </h2>
                  <p className="text-slate-700">
                    Sie haben nach der DSGVO jederzeit folgende Rechte:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="font-semibold text-slate-900 text-xs">
                        Auskunftsrecht (Art. 15 DSGVO)
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        Recht auf Bestätigung und Auskunft über die zu Ihrer Person verarbeiteten
                        Daten.
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="font-semibold text-slate-900 text-xs">
                        Berichtigung (Art. 16 DSGVO)
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        Recht auf unverzügliche Korrektur unrichtiger oder unvollständiger Daten.
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="font-semibold text-slate-900 text-xs">
                        Löschung (Art. 17 DSGVO)
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        Recht auf Löschung („Recht auf Vergessenwerden“), sofern keine gesetzlichen
                        Aufbewahrungspflichten entgegenstehen.
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="font-semibold text-slate-900 text-xs">
                        Widerspruch (Art. 21 DSGVO)
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        Recht auf jederzeitigen Widerspruch gegen die Datenverarbeitung aus
                        besonderen Gründen.
                      </p>
                    </div>
                  </div>
                </section>

                {/* 7. Nutzerdatenlöschung */}
                <section className="space-y-3 bg-rose-50/50 border border-rose-200 rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-base">
                    <Trash2 className="w-5 h-5 text-rose-600" />
                    7. Spezielle Anweisungen zur Datenlöschung (Meta User Data Deletion)
                  </div>
                  <p className="text-slate-700 text-sm">
                    Gemäß den Richtlinien der Meta Platform und Art. 17 DSGVO stellen wir einen
                    einfachen und transparenten Weg zur Verfügung, um Ihre bei uns gespeicherten
                    Nutzerdaten (Telefonnummer, Chat-Historie, Schichtzuweisungen) vollständig
                    löschen zu lassen.
                  </p>
                  <div className="pt-2">
                    <Link
                      href="/datenloeschung"
                      className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Zur Schritt-für-Schritt Anleitung für Datenlöschung
                    </Link>
                  </div>
                </section>

                {/* 8. Datensicherheit */}
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      8
                    </span>
                    Datensicherheit
                  </h2>
                  <p className="text-slate-700">
                    Wir setzen technische und organisatorische Sicherheitsmaßnahmen nach Art. 32
                    DSGVO ein. Dazu zählen durchgängige TLS/HTTPS-Verschlüsselung, restriktive
                    Rollen- und Rechtekonzepte sowie sichere Serverinfrastrukturen, um Ihre Daten
                    gegen Manipulation, Verlust oder unbefugten Zugriff Dritter zu schützen.
                  </p>
                </section>
              </>
            ) : (
              <>
                {/* English Translation */}
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    Data Controller
                  </h2>
                  <p className="text-slate-700">
                    <strong>Role of the provider:</strong> This platform (LogiFlow / Warehause) is provided
                    as software-as-a-service by <strong>Yazan Moussa</strong> (sole proprietor),
                    Friedrich-Alfred-Str. 158, 47226 Duisburg, Germany (see{" "}
                    <Link href="/impressum" className="text-blue-600 hover:underline">Legal notice</Link>).
                    The provider generally processes personal data on behalf of the respective customer
                    (Art. 28 GDPR) and on its instructions.
                  </p>
                  <p className="text-slate-700">
                    The <strong>controller</strong> (Art. 4(7) GDPR) for employee data, shift planning, timesheets
                    and documents is the company that uses the platform (your employer or client). That company
                    provides its own details and privacy contact. Please send requests about your data to that
                    company first.
                  </p>
                  <p className="text-slate-700">
                    For data the provider processes under its own responsibility (operation, security, billing
                    of the customer), the controller is Yazan Moussa. Contact:{" "}
                    <a href="mailto:info@yazan-tech.com" className="text-blue-600 hover:underline">info@yazan-tech.com</a>.
                  </p>
                </section>

                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900">1a. Service providers (sub-processors)</h2>
                  <p className="text-slate-700">
                    The provider uses the following service providers. Which of them are active for a customer
                    depends on its configuration:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                    <li><strong>Vercel</strong> (hosting of the web interface)</li>
                    <li><strong>Render</strong> (hosting of the server application, storage of uploaded documents)</li>
                    <li><strong>Neon</strong> (PostgreSQL database)</li>
                    <li><strong>Meta Platforms Ireland Limited</strong> (WhatsApp Business Cloud API: sending and receiving messages)</li>
                    <li><strong>Resend</strong> (system emails, e.g. shift assignment, password reset)</li>
                    <li><strong>OpenAI</strong> (text recognition and analysis of uploaded timesheets, documents and container lists; images and document content are sent to the API for this)</li>
                  </ul>
                  <p className="text-slate-700 text-sm">
                    Some of these providers may process data in third countries (e.g. USA), based on adequacy
                    decisions or standard contractual clauses (Art. 44 et seq. GDPR). The provider supplies the
                    current list to customers on request.
                  </p>
                </section>

                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      2
                    </span>
                    Scope & Purpose of Processing
                  </h2>
                  <p className="text-slate-700">
                    The <strong>LogiFlow Warehouse Management</strong> platform is used for
                    operational management of logistics processes of the respective customer, including:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                    <li>Employee data management, attendance, and timesheets.</li>
                    <li>Shift scheduling and warehouse hall assignments.</li>
                    <li>Container, delivery slip, and freight document processing.</li>
                    <li>
                      Operational alerts regarding shifts, schedule updates, and urgent logistics
                      announcements via authorized channels (e.g. WhatsApp).
                    </li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      3
                    </span>
                    Meta Platforms & WhatsApp Cloud API Integration
                  </h2>
                  <p className="text-slate-700">
                    To deliver reliable shift notifications and operational logistics alerts to
                    registered workers, LogiFlow integrates the official{" "}
                    <strong>WhatsApp Cloud API</strong> provided by{" "}
                    <strong>Meta Platforms Ireland Limited</strong> (4 Grand Canal Square, Grand
                    Canal Harbour, Dublin 2, Ireland).
                  </p>
                  <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 space-y-2 text-sm text-slate-800">
                    <p className="font-semibold text-blue-900">Categories of processed data:</p>
                    <ul className="list-disc pl-5 space-y-1 text-slate-700">
                      <li>
                        <strong>Mobile phone number</strong> in international format.
                      </li>
                      <li>
                        <strong>First and last name / user identifier</strong> in the scheduling
                        system.
                      </li>
                      <li>
                        <strong>Message content:</strong> Shift dates, hall assignments, starting/ending
                        times, and operational confirmations.
                      </li>
                      <li>
                        <strong>Metadata & timestamps:</strong> Time sent, delivery status
                        (Delivered, Read), and delivery failure diagnostic logs.
                      </li>
                    </ul>
                  </div>
                  <p className="text-slate-700">
                    Meta processes this information under EU Standard Contractual Clauses (SCCs).
                    We do not sell, rent, or distribute telephone numbers for marketing or
                    third-party profiling purposes.
                  </p>
                </section>

                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      4
                    </span>
                    Legal Basis for Processing (GDPR)
                  </h2>
                  <p className="text-slate-700">
                    Processing of personal data is founded upon the following legal provisions:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                    <li>
                      <strong>Art. 6(1)(b) GDPR:</strong> Performance of an employment or service
                      contract (scheduling, time recording).
                    </li>
                    <li>
                      <strong>Art. 6(1)(f) GDPR:</strong> Legitimate interest in maintaining efficient,
                      secure, and timely warehouse logistics operations.
                    </li>
                    <li>
                      <strong>Art. 6(1)(a) GDPR:</strong> Explicit consent where granted by the user.
                    </li>
                  </ul>
                </section>

                <section className="space-y-3 bg-rose-50/50 border border-rose-200 rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-base">
                    <Trash2 className="w-5 h-5 text-rose-600" />
                    Meta User Data Deletion Instructions
                  </div>
                  <p className="text-slate-700 text-sm">
                    In compliance with Meta Platform Terms and Art. 17 GDPR, we provide a direct,
                    transparent method to request full erasure of your personal data and telephone
                    numbers from our systems.
                  </p>
                  <div className="pt-2">
                    <Link
                      href="/datenloeschung"
                      className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      View Step-by-Step Data Deletion Guide
                    </Link>
                  </div>
                </section>
              </>
            )}

            {/* Footer Note */}
            <div className="border-t border-slate-200 pt-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p>© {new Date().getFullYear()} Yazan Moussa · LogiFlow Warehouse Management</p>
              <div className="flex items-center gap-4">
                <Link href="/datenloeschung" className="hover:text-blue-600 underline">
                  {lang === "de" ? "Anleitung zur Datenlöschung" : "Data Deletion Instructions"}
                </Link>
                <Link href="/login" className="hover:text-blue-600 underline">
                  {lang === "de" ? "Zum Login" : "To Login"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
