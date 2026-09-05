"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Warehouse,
  Key,
  User,
  AlertCircle,
  Eye,
  EyeOff,
  Globe,
  Mail,
  ArrowLeft,
  CheckCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";
import {
  getAuthToken,
  setAuthToken,
  getRememberedUser,
  setRememberedUser,
} from "../utils/auth";

type View = "login" | "forgot" | "forgot-sent";

export default function LoginPage() {
  const { t, language, changeLanguage } = useTranslation();
  const [view, setView] = useState<View>("login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const { username: savedUsername, rememberMe: savedRemember } = getRememberedUser();
    if (savedRemember && savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (token) router.push("/");
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t("loginError"));

      // Store token (localStorage if rememberMe is true, sessionStorage if false)
      setAuthToken(data.accessToken, rememberMe);
      // Persist / clear remembered user login credentials preference
      setRememberedUser(username, rememberMe);

      router.push("/");
    } catch (err: any) {
      setLoginError(err.message || t("loginError"));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError("");
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/forgot-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: resetEmail }),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Something went wrong.");
      }
      setView("forgot-sent");
    } catch (err: any) {
      setForgotError(err.message || "Failed to send reset email.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f8fafc] flex"
      suppressHydrationWarning
    >
      {/* ── Left Panel — Branding ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0f172a] flex-col justify-between p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-[#1d4ed8]/10 rounded-full blur-[100px]" />
          <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] bg-[#1e3a8a]/20 rounded-full blur-[80px]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-[#1d4ed8] rounded-xl flex items-center justify-center shadow-lg">
              <Warehouse className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-black text-xl tracking-tight">LogiFlow</span>
          </div>

          <div className="space-y-6">
            <h2 className="text-4xl font-black text-white leading-tight tracking-tight">
              {(!mounted || language === "de") ? "Lagerverwaltung\nder Zukunft." : "Warehouse\nManagement\nReimagined."}
            </h2>
            <p className="text-[#64748b] text-base leading-relaxed max-w-sm">
              {(!mounted || language === "de")
                ? "Verwalten Sie Schichtpläne, Container und Teams von einem einzigen, leistungsstarken Dashboard aus."
                : "Manage shift plans, containers, and teams from a single, powerful dashboard."}
            </p>
          </div>
        </div>

        {/* Feature pills */}
        <div className="relative z-10 space-y-3">
          {[
            { icon: "⚡", text: (!mounted || language === "de") ? "Echtzeit-Planung" : "Real-time Planning" },
            { icon: "👥", text: (!mounted || language === "de") ? "Team-Management" : "Team Management" },
            { icon: "📊", text: (!mounted || language === "de") ? "Berichte & Analytics" : "Reports & Analytics" },
          ].map((f) => (
            <div key={f.text} className="flex items-center gap-3 text-sm text-[#94a3b8]">
              <span className="text-base">{f.icon}</span>
              {f.text}
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Panel — Forms ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
        {/* Language switcher */}
        <div className="absolute top-5 right-5 flex items-center gap-2 bg-white border border-[#e2e8f0] px-3 py-1.5 rounded-lg shadow-sm">
          <Globe className="w-3.5 h-3.5 text-[#64748b]" />
          <select
            value={language}
            onChange={(e) => changeLanguage(e.target.value as any)}
            className="bg-transparent text-xs font-semibold text-[#64748b] outline-none cursor-pointer"
          >
            <option value="de">DE</option>
            <option value="en">EN</option>
          </select>
        </div>

        {/* ── LOGIN VIEW ── */}
        {view === "login" && (
          <div className="w-full max-w-sm animate-fadeIn">
            {/* Mobile brand header */}
            <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
              <div className="w-8 h-8 bg-[#1d4ed8] rounded-lg flex items-center justify-center">
                <Warehouse className="w-5 h-5 text-white" />
              </div>
              <span className="font-black text-[#0f172a] text-lg">LogiFlow</span>
            </div>

            <div className="mb-8">
              <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">
                {(!mounted || language === "de") ? "Willkommen zurück" : "Welcome back"}
              </h1>
              <p className="text-[#64748b] text-sm mt-1">{t("loginSubtitle")}</p>
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-start gap-2.5 text-sm animate-shake mb-5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
                  {t("usernameLabel")}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("usernamePlaceholder")}
                    className="w-full bg-white border border-[#e5e7eb] focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#1d4ed8]/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#0f172a] outline-none transition-all placeholder:text-[#9ca3af]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
                  {t("passwordLabel")}
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white border border-[#e5e7eb] focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#1d4ed8]/10 rounded-xl pl-10 pr-11 py-2.5 text-sm text-[#0f172a] outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-[#64748b] hover:text-[#374151] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[#d1d5db] text-[#1d4ed8] accent-[#1d4ed8] focus:ring-[#1d4ed8]/20 cursor-pointer"
                  />
                  <span className="font-medium">{t("rememberMe")}</span>
                </label>
                <button
                  type="button"
                  onClick={() => { setView("forgot"); setForgotError(""); setResetEmail(""); }}
                  className="text-xs font-semibold text-[#1d4ed8] hover:text-[#1d4ed8] hover:underline transition-colors"
                >
                  {t("forgotPassword")}
                </button>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-[#1d4ed8] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-blue-200 hover:shadow-blue-300 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loginLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t("loggingIn")}</>
                ) : (
                  <>{t("loginButton")} <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <div className="text-center mt-8 space-y-1.5">
              <p className="text-[11px] text-[#94a3b8]">
                LogiFlow Warehouse Management System · MDL
              </p>
              <div className="flex items-center justify-center gap-3 text-[11px] text-[#64748b]">
                <Link
                  href="/datenschutz"
                  className="hover:text-[#1d4ed8] underline transition-colors"
                >
                  {language === "de" ? "Datenschutz" : "Privacy Policy"}
                </Link>
                <span>•</span>
                <Link
                  href="/datenloeschung"
                  className="hover:text-[#1d4ed8] underline transition-colors"
                >
                  {language === "de" ? "Datenlöschung" : "Data Deletion"}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── FORGOT PASSWORD VIEW ── */}
        {view === "forgot" && (
          <div className="w-full max-w-sm animate-fadeIn">
            <div className="mb-8">
              <div className="w-10 h-10 bg-[#eff6ff] rounded-xl flex items-center justify-center mb-4">
                <Mail className="w-5 h-5 text-[#1d4ed8]" />
              </div>
              <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">
                {(!mounted || language === "de") ? "Passwort zurücksetzen" : "Reset Password"}
              </h1>
              <p className="text-[#64748b] text-sm mt-1">
                {(!mounted || language === "de")
                  ? "Wir senden einen sicheren Link an Ihre E-Mail."
                  : "We'll send a secure reset link to your email."}
              </p>
            </div>

            {forgotError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-start gap-2.5 text-sm animate-shake mb-5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{forgotError}</span>
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
                  {language === "de" ? "E-Mail-Adresse" : "Email Address"}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder={language === "de" ? "ihre@email.de" : "your@email.com"}
                    className="w-full bg-white border border-[#e5e7eb] focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#1d4ed8]/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#0f172a] outline-none transition-all placeholder:text-[#9ca3af]"
                  />
                </div>
                <p className="text-[11px] text-[#94a3b8]">
                  {language === "de"
                    ? "Nur für Admin- und Manager-Konten verfügbar."
                    : "Available for Admin and Manager accounts only."}
                </p>
              </div>

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-[#1d4ed8] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-blue-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {forgotLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {language === "de" ? "Senden..." : "Sending..."}</>
                ) : (
                  language === "de" ? "Reset-Link senden" : "Send Reset Link"
                )}
              </button>

              <button
                type="button"
                onClick={() => setView("login")}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-[#64748b] hover:text-[#374151] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {language === "de" ? "Zurück zum Login" : "Back to Login"}
              </button>
            </form>
          </div>
        )}

        {/* ── CONFIRMATION VIEW ── */}
        {view === "forgot-sent" && (
          <div className="w-full max-w-sm animate-fadeIn">
            <div className="mb-8 text-center">
              <div className="w-14 h-14 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">
                {language === "de" ? "E-Mail gesendet" : "Email Sent"}
              </h1>
              <p className="text-[#64748b] text-sm mt-1">
                {language === "de" ? "Überprüfen Sie Ihren Posteingang." : "Check your inbox."}
              </p>
            </div>

            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-green-800 text-sm leading-relaxed">
                  {language === "de"
                    ? `Falls ein Konto mit „${resetEmail}" existiert, haben wir einen Reset-Link gesendet. Prüfen Sie Posteingang und Spam-Ordner.`
                    : `If an account with "${resetEmail}" exists, we've sent a reset link. Check your inbox and spam folder.`}
                </p>
              </div>
              <p className="text-xs text-[#94a3b8] text-center">
                {language === "de" ? "Der Link ist 1 Stunde gültig." : "The link is valid for 1 hour."}
              </p>
              <button
                onClick={() => { setView("login"); setUsername(""); setPassword(""); }}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-[#1d4ed8] hover:text-[#1d4ed8] hover:underline transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {language === "de" ? "Zurück zum Login" : "Back to Login"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
