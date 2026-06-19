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
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

function ResetPasswordForm() {
  const { t, language, changeLanguage } = useTranslation();
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
    if (!token) {
      setStatus("invalid");
      return;
    }

    // Validate token
    const validateToken = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/validate-reset-token?token=${token}`
        );
        const data = await res.json();

        if (data.valid) {
          setUserName(data.name || "");
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      } catch (err) {
        setStatus("invalid");
      }
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

      if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
      }

      setStatus("success");
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        <p className="text-[#64748b] text-sm animate-pulse">
          {language === "de" ? "Link wird überprüft..." : "Validating link..."}
        </p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="max-w-sm w-full animate-fadeIn z-10">
        <div className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl p-8 space-y-5 text-center">
          <div className="inline-flex w-14 h-14 bg-red-950/40 border border-red-800/30 items-center justify-center rounded-xl text-red-400 mb-2">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">
            {language === "de" ? "Ungültiger Link" : "Invalid Link"}
          </h1>
          <p className="text-[#64748b] text-sm">
            {language === "de"
              ? "Dieser Link ist abgelaufen oder wurde bereits verwendet. Bitte fordern Sie einen neuen Reset-Link an."
              : "This link has expired or has already been used. Please request a new reset link."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-[#1e293b] hover:bg-[#334155] text-white font-semibold py-3 px-4 rounded-xl transition-colors mt-4"
          >
            {language === "de" ? "Zurück zum Login" : "Back to Login"}
          </button>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="max-w-sm w-full animate-fadeIn z-10">
        <div className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl p-8 space-y-5 text-center">
          <div className="inline-flex w-14 h-14 bg-green-950 border border-green-800/50 items-center justify-center rounded-xl text-green-400 mb-2">
            <CheckCircle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">
            {language === "de" ? "Passwort aktualisiert" : "Password Updated"}
          </h1>
          <p className="text-[#64748b] text-sm">
            {language === "de"
              ? "Ihr Passwort wurde erfolgreich geändert. Sie können sich nun mit Ihrem neuen Passwort einloggen."
              : "Your password has been successfully changed. You can now log in with your new password."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-secondary hover:bg-secondary/90 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-secondary/20 transition-colors mt-4 flex items-center justify-center gap-2"
          >
            {language === "de" ? "Zum Login" : "Go to Login"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm w-full animate-fadeIn z-10">
      <div className="text-center mb-8">
        <div className="inline-flex w-14 h-14 bg-[#111827] border border-[#1e293b] items-center justify-center rounded-xl text-secondary mb-4">
          <Lock className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-black text-white tracking-tight">
          {language === "de" ? "Neues Passwort vergeben" : "Set New Password"}
        </h1>
        <p className="text-[#64748b] text-sm mt-1 max-w-xs mx-auto">
          {language === "de"
            ? `Hallo ${userName}, bitte geben Sie Ihr neues Passwort ein.`
            : `Hello ${userName}, please enter your new password.`}
        </p>
      </div>

      <div className="bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl p-8 space-y-5">
        {error && (
          <div className="bg-red-950/60 border border-red-800/50 text-red-400 p-3 rounded-lg flex items-start gap-2.5 text-sm animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
              {language === "de" ? "Neues Passwort" : "New Password"}
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
              <input
                type={showPassword ? "text" : "password"}
                required
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

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
              {language === "de" ? "Passwort bestätigen" : "Confirm Password"}
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0d1117] border border-[#1e293b] focus:border-secondary rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-secondary/20 transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
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

      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center space-y-4 z-10">
            <Loader2 className="w-8 h-8 animate-spin text-secondary" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
      
      {/* Footer */}
      <p className="text-center text-[11px] text-[#334155] mt-6 z-10">
        LogiFlow Warehouse Management System
      </p>
    </div>
  );
}
