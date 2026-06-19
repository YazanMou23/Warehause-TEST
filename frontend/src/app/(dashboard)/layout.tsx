"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Warehouse,
  Grid,
  Package,
  Clock,
  Scan,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  FileSpreadsheet,
  User,
  Shield,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

interface SidebarLink {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  section?: string;
}

const sidebarLinks: SidebarLink[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, section: "main" },
  { name: "Planning", href: "/planning", icon: Calendar, section: "main" },
  { name: "Employees", href: "/employees", icon: Users, section: "people" },
  { name: "Admins", href: "/admins", icon: Shield, section: "people" },
  { name: "Warehouses", href: "/warehouses", icon: Warehouse, section: "resources" },
  { name: "Halls", href: "/halls", icon: Grid, section: "resources" },
  { name: "Containers", href: "/containers", icon: Package, section: "resources" },
  { name: "Attendance", href: "/attendance", icon: Clock, section: "ops" },
  { name: "OCR Upload", href: "/ocr", icon: Scan, section: "ops" },
  { name: "Reports", href: "/reports", icon: FileSpreadsheet, section: "ops" },
  { name: "Profile", href: "/profile", icon: User, section: "system" },
  { name: "Settings", href: "/settings", icon: Settings, section: "system" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const [userName, setUserName] = useState("M. Warehouse");
  const [userRole, setUserRole] = useState("MANAGER");
  const [userInitials, setUserInitials] = useState("MW");
  const [userId, setUserId] = useState("");
  const [photoTrigger, setPhotoTrigger] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("accessToken");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.name) {
          setUserName(payload.name);
          const initials = payload.name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          setUserInitials(initials || "U");
        }
        if (payload.role) setUserRole(payload.role);
        if (payload.sub) setUserId(payload.sub);
      } catch (e) {
        console.error("Failed to decode token", e);
      }
    }

    const handleProfileUpdate = () => {
      setPhotoTrigger(prev => prev + 1);
      const updatedToken = localStorage.getItem("accessToken");
      if (updatedToken) {
        try {
          const payload = JSON.parse(atob(updatedToken.split(".")[1]));
          if (payload.name) setUserName(payload.name);
        } catch (e) {}
      }
    };
    window.addEventListener("profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("profile-updated", handleProfileUpdate);
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {}
    }
    localStorage.removeItem("accessToken");
    window.location.href = "/login";
  };

  const getTranslationKey = (name: string): any => {
    const map: Record<string, string> = {
      Dashboard: "dashboard",
      Planning: "planning",
      Employees: "employees",
      Admins: "admins",
      Warehouses: "warehouses",
      Halls: "halls",
      Containers: "containers",
      Attendance: "attendance",
      "OCR Upload": "ocrUpload",
      Reports: "reports",
      Profile: "profile",
      Settings: "settings",
    };
    return map[name] || name;
  };

  const SidebarContent = () => {
    const allowedLinks = sidebarLinks.filter((link) => {
      if (userRole === "EMPLOYEE") return ["Dashboard", "Profile", "Settings"].includes(link.name);
      if (userRole === "ADMIN") return !["Reports", "Admins"].includes(link.name);
      return true;
    });

    return (
      /* Dark navy sidebar — enterprise SaaS standard */
      <div className="flex flex-col h-full bg-[#0f172a] text-white border-r border-[#1e293b]">
        
        {/* Brand */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-[#1e293b]">
          <div className="w-9 h-9 bg-[#2563eb] flex items-center justify-center rounded-lg shrink-0 shadow-lg">
            <Warehouse className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-black text-white tracking-tight leading-none text-[15px]">LogiFlow</h1>
            <p className="text-[#64748b] text-[11px] mt-0.5">Warehouse Management</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-0.5">
          {allowedLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all group ${
                  isActive
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "text-[#94a3b8] hover:bg-[#1e293b] hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-[#64748b] group-hover:text-white"}`} />
                <span className="flex-1">{t(getTranslationKey(link.name))}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/60" />}
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div className="p-4 border-t border-[#1e293b] space-y-2">
          <Link
            href="/profile"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1e293b] transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#2563eb] flex items-center justify-center font-bold text-xs text-white shrink-0 overflow-hidden relative">
              {mounted && userId && (
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${userId}/photo?t=${photoTrigger}`}
                  alt={userName}
                  className="w-full h-full object-cover absolute inset-0"
                  style={{ display: "none" }}
                  onLoad={(e) => { e.currentTarget.style.display = "block"; }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              <span className="text-white text-xs font-bold">{userInitials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{userName}</p>
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider">
                {userRole === "MANAGER" ? t("roleManager") : userRole === "ADMIN" ? t("roleAdmin") : t("roleEmployee")}
              </p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-[#64748b] hover:bg-red-950/30 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t("logout")}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] text-[#0f172a]" suppressHydrationWarning>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[260px] lg:flex-col fixed inset-y-0 z-40 print:hidden">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:pl-[260px] min-h-screen">

        {/* Top Header */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-[#e2e8f0] bg-white print:hidden shrink-0 shadow-sm">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 text-[#64748b] hover:bg-[#f1f5f9] rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div className="relative hidden md:block w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input
              type="text"
              placeholder="Search operations..."
              disabled
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-full pl-9 pr-4 py-1.5 text-sm text-[#64748b] outline-none opacity-70"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <button className="w-8 h-8 flex items-center justify-center hover:bg-[#f1f5f9] rounded-lg relative transition-colors">
              <Bell className="w-4 h-4 text-[#64748b]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#dc2626] rounded-full border-2 border-white" />
            </button>

            {/* Profile chip */}
            <Link
              href="/profile"
              className="flex items-center gap-2.5 pl-3 border-l border-[#e2e8f0] hover:opacity-80 transition-opacity"
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-[#0f172a] leading-none">{userName}</p>
                <p className="text-[10px] text-[#64748b] uppercase tracking-wider mt-0.5">
                  {userRole === "MANAGER" ? t("roleManager") : userRole === "ADMIN" ? t("roleAdmin") : t("roleEmployee")}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#2563eb] text-white flex items-center justify-center font-bold text-sm overflow-hidden relative">
                {mounted && userId && (
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${userId}/photo?t=${photoTrigger}`}
                    alt={userName}
                    className="w-full h-full object-cover absolute inset-0 z-10"
                    style={{ display: "none" }}
                    onLoad={(e) => { e.currentTarget.style.display = "block"; }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <span className="text-white text-xs font-bold">{userInitials}</span>
              </div>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 print:p-0">
          {children}
        </main>
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 lg:hidden animate-fadeIn"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-y-0 left-0 w-[260px] z-50 lg:hidden transform transition-transform duration-300 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-[#64748b] hover:bg-[#1e293b] rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
