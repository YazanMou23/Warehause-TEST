"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

type View = "login" | "forgot" | "forgot-sent";

export default function LoginPage() {
  const { t, language, changeLanguage } = useTranslation();
  const [view, setView] = useState<View>("login");

  // Login form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Forgot password form
  const [resetEmail, setResetEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
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

      if (!response.ok) {
        throw new Error(data.message || t("loginError"));
      }

      localStorage.setItem("accessToken", data.accessToken);
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
      className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center p-4 relative overflow-hidden"
      suppressHydrationWarning
    >
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#0058be]/8 rounded-full blur-[100px]" />
      </div>

      {/* Language Switcher */}
      <div className="absolute top-5 right-5 flex items-center gap-2 bg-[#111827] border border-[#1e293b] px-3 py-1.5 rounded-lg shadow-md z-10">
        <Globe className="w-3.5 h-3.5 text-secondary" />
        <select
          value={language}
          onChange={(e) => changeLanguage(e.target.value as any)}
          className="bg-transparent text-[12px] font-bold text-[#94a3b8] outline-none cursor-pointer"
        >
          <option value="de" className="bg-[#111827]">DE</option>
          <option value="en" className="bg-[#111827]">EN</option>
        </select>
      </div>

      {/* ── LOGIN VIEW ── */}
      {view === "login" && (
        <div className="max-w-sm w-full animate-fadeIn z-10">
          {/* Brand Header */}
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 bg-secondary items-center justify-center rounded-xl text-white mb-4 shadow-lg shadow-secondary/20">
              <Warehouse className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">LogiFlow</h1>
            <p className="text-[#64748b] text-sm mt-1">{t("loginSubtitle")}</p>
          </div>

          {/* Card */}
          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl p-8 space-y-5">
            {/* Error */}
            {loginError && (
              <div className="bg-red-950/60 border border-red-800/50 text-red-400 p-3 rounded-lg flex items-start gap-2.5 text-sm animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Username */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                  {t("usernameLabel")}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("usernamePlaceholder")}
                    className="w-full bg-[#0d1117] border border-[#1e293b] focus:border-secondary rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#334155]"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                  {t("passwordLabel")}
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0d1117] border border-[#1e293b] focus:border-secondary rounded-xl pl-10 pr-11 py-2.5 text-sm text-white outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#94a3b8] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Options row */}
              <div className="flex items-center justify-between text-sm pt-1">
                <label className="flex items-center gap-2 text-[#64748b] hover:text-[#94a3b8] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={() => setShowPassword(!showPassword)}
                    className="w-3.5 h-3.5 rounded bg-[#0d1117] border border-[#1e293b] accent-secondary cursor-pointer"
                  />
                  <span className="text-xs">{t("showPassword")}</span>
                </label>

                <button
                  type="button"
                  onClick={() => { setView("forgot"); setForgotError(""); setResetEmail(""); }}
                  className="text-xs text-secondary hover:text-secondary/80 hover:underline font-semibold transition-colors"
                >
                  {t("forgotPassword")}
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-secondary/20 hover:shadow-secondary/30 transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer"
              >
                {loginLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t("loggingIn")}</>
                ) : (
                  t("loginButton")
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-[#334155] mt-6">
            LogiFlow Warehouse Management System
          </p>
        </div>
      )}

      {/* ── FORGOT PASSWORD VIEW ── */}
      {view === "forgot" && (
        <div className="max-w-sm w-full animate-fadeIn z-10">
          {/* Brand Header */}
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 bg-[#111827] border border-[#1e293b] items-center justify-center rounded-xl text-secondary mb-4">
              <Mail className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">
              {language === "de" ? "Passwort zurücksetzen" : "Reset Password"}
            </h1>
            <p className="text-[#64748b] text-sm mt-1 max-w-xs mx-auto">
              {language === "de"
                ? "Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Reset-Link."
                : "Enter your email address. We'll send you a reset link."}
            </p>
          </div>

          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl p-8 space-y-5">
            {forgotError && (
              <div className="bg-red-950/60 border border-red-800/50 text-red-400 p-3 rounded-lg flex items-start gap-2.5 text-sm animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{forgotError}</span>
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                  {language === "de" ? "E-Mail-Adresse" : "Email Address"}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder={language === "de" ? "ihre@email.de" : "your@email.com"}
                    className="w-full bg-[#0d1117] border border-[#1e293b] focus:border-secondary rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#334155]"
                  />
                </div>
                <p className="text-[11px] text-[#475569]">
                  {language === "de"
                    ? "Nur für Admin- und Manager-Konten verfügbar."
                    : "Available for Admin and Manager accounts only."}
                </p>
              </div>

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-secondary/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {forgotLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {language === "de" ? "Senden..." : "Sending..."}</>
                ) : (
                  language === "de" ? "Reset-Link senden" : "Send Reset Link"
                )}
              </button>
            </form>

            <button
              onClick={() => setView("login")}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-[#475569] hover:text-[#94a3b8] transition-colors pt-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {language === "de" ? "Zurück zum Login" : "Back to Login"}
            </button>
          </div>
        </div>
      )}

      {/* ── FORGOT SENT CONFIRMATION ── */}
      {view === "forgot-sent" && (
        <div className="max-w-sm w-full animate-fadeIn z-10">
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 bg-green-950 border border-green-800/50 items-center justify-center rounded-xl text-green-400 mb-4">
              <CheckCircle className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">
              {language === "de" ? "E-Mail gesendet" : "Email Sent"}
            </h1>
            <p className="text-[#64748b] text-sm mt-1">
              {language === "de"
                ? "Überprüfen Sie Ihren Posteingang."
                : "Check your inbox."}
            </p>
          </div>

          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl p-8 space-y-4 text-center">
            <div className="bg-green-950/40 border border-green-800/30 rounded-xl p-4">
              <p className="text-green-400 text-sm leading-relaxed">
                {language === "de"
                  ? `Falls ein Konto mit der E-Mail „${resetEmail}" existiert, wurde ein Reset-Link gesendet. Bitte prüfen Sie Ihren Posteingang und Spam-Ordner.`
                  : `If an account with the email "${resetEmail}" exists, a reset link has been sent. Please check your inbox and spam folder.`}
              </p>
            </div>
            <p className="text-[#475569] text-xs">
              {language === "de"
                ? "Der Link ist 1 Stunde gültig."
                : "The link is valid for 1 hour."}
            </p>
            <button
              onClick={() => { setView("login"); setUsername(""); setPassword(""); }}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-secondary hover:text-secondary/80 font-semibold hover:underline transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {language === "de" ? "Zurück zum Login" : "Back to Login"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
