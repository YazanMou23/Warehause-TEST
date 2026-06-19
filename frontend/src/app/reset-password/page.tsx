"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Key,
  AlertCircle,
  Eye,
  EyeOff,
  Globe,
  CheckCircle,
  Loader2,
  Lock,
  ArrowRight,
  Warehouse,
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

function ResetPasswordForm() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "invalid" | "valid" | "success">("loading");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }

    const validateToken = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/validate-reset-token?token=${token}`
        );
        const data = await res.json();
        if (data.valid) { setUserName(data.name || ""); setStatus("valid"); }
        else setStatus("invalid");
      } catch { setStatus("invalid"); }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(language === "de" ? "Die Passwörter stimmen nicht überein." : "Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError(language === "de" ? "Das Passwort muss mindestens 8 Zeichen lang sein." : "Password must be at least 8 characters long.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, newPassword: password }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Something went wrong.");
      setStatus("success");
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-[#2563eb]" />
        <p className="text-[#64748b] text-sm">
          {language === "de" ? "Link wird überprüft..." : "Validating link..."}
        </p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="w-full max-w-sm animate-fadeIn">
        <div className="bg-white border border-[#e2e8f0] rounded-2xl shadow-sm p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 border border-red-200 rounded-xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h1 className="text-xl font-black text-[#0f172a]">
            {language === "de" ? "Ungültiger Link" : "Invalid Link"}
          </h1>
          <p className="text-[#64748b] text-sm">
            {language === "de"
              ? "Dieser Link ist abgelaufen oder wurde bereits verwendet."
              : "This link has expired or has already been used."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold py-2.5 px-4 rounded-xl transition-colors mt-2"
          >
            {language === "de" ? "Zurück zum Login" : "Back to Login"}
          </button>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="w-full max-w-sm animate-fadeIn">
        <div className="bg-white border border-[#e2e8f0] rounded-2xl shadow-sm p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center mx-auto">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="text-xl font-black text-[#0f172a]">
            {language === "de" ? "Passwort aktualisiert" : "Password Updated"}
          </h1>
          <p className="text-[#64748b] text-sm">
            {language === "de"
              ? "Ihr Passwort wurde erfolgreich geändert."
              : "Your password has been successfully changed."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-blue-200 transition-all flex items-center justify-center gap-2"
          >
            {language === "de" ? "Zum Login" : "Go to Login"} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm animate-fadeIn">
      <div className="mb-8">
        <div className="w-10 h-10 bg-[#eff6ff] rounded-xl flex items-center justify-center mb-4">
          <Lock className="w-5 h-5 text-[#2563eb]" />
        </div>
        <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">
          {language === "de" ? "Neues Passwort" : "New Password"}
        </h1>
        <p className="text-[#64748b] text-sm mt-1">
          {language === "de"
            ? `Hallo ${userName}, wählen Sie Ihr neues Passwort.`
            : `Hello ${userName}, set your new password.`}
        </p>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-2xl shadow-sm p-8 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-start gap-2.5 text-sm animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
              {language === "de" ? "Neues Passwort" : "New Password"}
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-[#e5e7eb] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 rounded-xl pl-10 pr-11 py-2.5 text-sm text-[#0f172a] outline-none transition-all"
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

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider">
              {language === "de" ? "Passwort bestätigen" : "Confirm Password"}
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-[#e5e7eb] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#0f172a] outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-blue-200 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {language === "de" ? "Speichern..." : "Saving..."}</>
            ) : (
              language === "de" ? "Passwort speichern" : "Save Password"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const { language, changeLanguage } = useTranslation();

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 relative" suppressHydrationWarning>
      {/* Language Switcher */}
      <div className="absolute top-5 right-5 flex items-center gap-2 bg-white border border-[#e2e8f0] px-3 py-1.5 rounded-lg shadow-sm z-10">
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

      {/* Brand */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-8 h-8 bg-[#2563eb] rounded-lg flex items-center justify-center">
          <Warehouse className="w-5 h-5 text-white" />
        </div>
        <span className="font-black text-[#0f172a] text-lg">LogiFlow</span>
      </div>

      <Suspense
        fallback={
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#2563eb]" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>

      <p className="text-center text-[11px] text-[#94a3b8] mt-8">
        LogiFlow Warehouse Management System
      </p>
    </div>
  );
}
