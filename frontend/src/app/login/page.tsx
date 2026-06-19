"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Warehouse, Key, User, AlertCircle, Eye, EyeOff, Globe } from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

export default function LoginPage() {
  const { t, language, changeLanguage } = useTranslation();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("adminpassword");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // If already logged in, redirect to home
    const token = localStorage.getItem("accessToken");
    if (token) {
      router.push("/");
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t("loginError"));
      }

      // Save token and navigate
      localStorage.setItem("accessToken", data.accessToken);
      router.push("/");
    } catch (err: any) {
      setError(err.message || t("loginError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    alert(language === "de" 
      ? "Bitte wenden Sie sich an Ihren Manager oder Administrator, um Ihr Passwort zurückzusetzen."
      : "Please contact your Manager or Administrator to reset your password.");
  };

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-4 relative" suppressHydrationWarning>
      
      {/* Floating Language Switcher */}
      <div className="absolute top-4 right-4 flex items-center gap-2 bg-[#1e293b] border border-[#334155] px-2.5 py-1.5 rounded-lg shadow-md">
        <Globe className="w-4 h-4 text-secondary" />
        <select
          value={language}
          onChange={(e) => changeLanguage(e.target.value as any)}
          className="bg-transparent text-[12px] font-bold text-white outline-none cursor-pointer"
        >
          <option value="de" className="bg-[#1e293b]">DE</option>
          <option value="en" className="bg-[#1e293b]">EN</option>
        </select>
      </div>

      <div className="max-w-md w-full bg-[#1e293b] border border-[#334155] rounded-xl shadow-xl p-8 space-y-6">
        
        {/* Header logo */}
        <div className="text-center">
          <div className="inline-flex w-12 h-12 bg-secondary items-center justify-center rounded-lg text-white mb-3 shadow-md">
            <Warehouse className="w-7 h-7" />
          </div>
          <h1 className="font-headline-lg font-black text-secondary leading-tight tracking-tight">
            {t("appName")}
          </h1>
          <p className="text-on-surface-variant text-body-sm">
            {t("loginSubtitle")}
          </p>
        </div>

        {/* Credentials table helper */}
        <div className="bg-[#0f1117] border border-[#1e3a5f] rounded-lg p-4 space-y-2">
          <h3 className="text-label-md text-secondary font-bold flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
            <Key className="w-3.5 h-3.5" /> {t("demoAccounts")}
          </h3>
          <table className="w-full text-left border-collapse text-[12px] text-[#cbd5e1]">
            <thead>
              <tr className="border-b border-[#1e293b] text-[#64748b]">
                <th className="pb-1 font-semibold">{t("roleColumn")}</th>
                <th className="pb-1 font-semibold">{t("usernameLabel")}</th>
                <th className="pb-1 font-semibold">{t("passwordLabel")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]">
              <tr>
                <td className="py-1 text-[#94a3b8]">{t("roleManager")}</td>
                <td className="py-1 font-mono text-[#f472b6]">manager</td>
                <td className="py-1 font-mono">managerpassword</td>
              </tr>
              <tr>
                <td className="py-1 text-[#94a3b8]">{t("roleAdmin")}</td>
                <td className="py-1 font-mono text-[#f472b6]">admin</td>
                <td className="py-1 font-mono">adminpassword</td>
              </tr>
              <tr>
                <td className="py-1 text-[#94a3b8]">{t("roleEmployee")}</td>
                <td className="py-1 font-mono text-[#f472b6]">employee1</td>
                <td className="py-1 font-mono">employeepassword</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-error-container border border-error/30 text-error p-3 rounded-lg flex items-start gap-2.5 text-body-sm animate-shake">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{t("accessDenied")}</p>
              <p className="text-[13px] opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-label-md font-bold text-[#cbd5e1] uppercase tracking-wider text-[11px]">
              {t("usernameLabel")}
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("usernamePlaceholder")}
                className="w-full bg-[#0f1117] border border-[#334155] focus:border-secondary rounded-lg pl-10 pr-4 py-2.5 text-body-sm text-white outline-none transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-label-md font-bold text-[#cbd5e1] uppercase tracking-wider text-[11px]">
              {t("passwordLabel")}
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0f1117] border border-[#334155] focus:border-secondary rounded-lg pl-10 pr-12 py-2.5 text-body-sm text-white outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-[#cbd5e1] transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-body-sm pt-2">
            <label className="flex items-center gap-2 text-[#94a3b8] hover:text-[#cbd5e1] cursor-pointer selection:bg-transparent">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={() => setShowPassword(!showPassword)}
                className="w-4 h-4 rounded bg-[#0f1117] border border-[#334155] accent-secondary cursor-pointer"
              />
              <span>{t("showPassword")}</span>
            </label>

            <a
              href="#"
              onClick={handleForgotPassword}
              className="text-secondary hover:text-secondary/80 hover:underline font-semibold"
            >
              {t("forgotPassword")}
            </a>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-6 cursor-pointer"
          >
            {isLoading ? t("loggingIn") : t("loginButton")}
          </button>
        </form>
      </div>
    </div>
  );
}
