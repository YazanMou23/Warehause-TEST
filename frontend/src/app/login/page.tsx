"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Warehouse, Key, Phone, AlertCircle, ShieldAlert } from "lucide-react";

export default function LoginPage() {
  const [phone, setPhone] = useState("+491701111111");
  const [password, setPassword] = useState("adminpassword");
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
        body: JSON.stringify({ phone, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to log in");
      }

      // Save token and navigate
      localStorage.setItem("accessToken", data.accessToken);
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-4" suppressHydrationWarning>
      <div className="max-w-md w-full bg-[#1e293b] border border-[#334155] rounded-xl shadow-xl p-8 space-y-6">
        
        {/* Header logo */}
        <div className="text-center">
          <div className="inline-flex w-12 h-12 bg-secondary items-center justify-center rounded-lg text-white mb-3 shadow-md">
            <Warehouse className="w-7 h-7" />
          </div>
          <h1 className="font-headline-lg font-black text-secondary leading-tight tracking-tight">
            LogiFlow
          </h1>
          <p className="text-on-surface-variant text-body-sm">
            Warehouse Operations Sign In
          </p>
        </div>

        {/* Credentials table helper */}
        <div className="bg-[#0f1117] border border-[#1e3a5f] rounded-lg p-4 space-y-2">
          <h3 className="text-label-md text-secondary font-bold flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
            <Key className="w-3.5 h-3.5" /> Login Credentials
          </h3>
          <table className="w-full text-left border-collapse text-[12px] text-[#cbd5e1]">
            <thead>
              <tr className="border-b border-[#1e293b] text-[#64748b]">
                <th className="pb-1 font-semibold">Role</th>
                <th className="pb-1 font-semibold">Phone</th>
                <th className="pb-1 font-semibold">Password</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]">
              <tr>
                <td className="py-1 text-[#94a3b8]">Admin</td>
                <td className="py-1 font-mono text-[#f472b6]">+491701111111</td>
                <td className="py-1 font-mono">adminpassword</td>
              </tr>
              <tr>
                <td className="py-1 text-[#94a3b8]">Leader</td>
                <td className="py-1 font-mono text-[#f472b6]">+491702222222</td>
                <td className="py-1 font-mono">leaderpassword</td>
              </tr>
              <tr>
                <td className="py-1 text-[#94a3b8]">Worker</td>
                <td className="py-1 font-mono text-[#f472b6]">+491704444444</td>
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
              <p className="font-bold">Access Denied</p>
              <p className="text-[13px] opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-label-md font-bold text-[#cbd5e1] uppercase tracking-wider text-[11px]">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+491701111111"
                className="w-full bg-[#0f1117] border border-[#334155] focus:border-secondary rounded-lg pl-10 pr-4 py-2.5 text-body-sm text-white outline-none transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-label-md font-bold text-[#cbd5e1] uppercase tracking-wider text-[11px]">
              Password
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0f1117] border border-[#334155] focus:border-secondary rounded-lg pl-10 pr-4 py-2.5 text-body-sm text-white outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-6 cursor-pointer"
          >
            {isLoading ? "Authenticating..." : "Authenticate Access"}
          </button>
        </form>
      </div>
    </div>
  );
}
