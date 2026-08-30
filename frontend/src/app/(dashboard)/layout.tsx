"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Warehouse,
  Grid,
  Package,
  Clock,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  FileSpreadsheet,
  User,
  Shield,
  ChevronRight,
  FileCheck,
  MessageSquare,
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";
import { getAuthToken, clearAuthToken } from "../utils/auth";

interface SidebarLink {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  section?: string;
}

const sidebarLinks: SidebarLink[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, section: "main" },
  { name: "Planning", href: "/planning", icon: Calendar, section: "main" },
  { name: "Chat", href: "/chat", icon: MessageSquare, section: "main" },
  { name: "Employees", href: "/employees", icon: Users, section: "people" },
  { name: "Admins", href: "/admins", icon: Shield, section: "people" },
  { name: "Warehouses", href: "/warehouses", icon: Warehouse, section: "resources" },
  { name: "Halls", href: "/halls", icon: Grid, section: "resources" },
  { name: "Containers", href: "/containers", icon: Package, section: "resources" },
  { name: "Attendance", href: "/attendance", icon: Clock, section: "ops" },
  { name: "Stundenzettel", href: "/timesheets", icon: FileCheck, section: "ops" },
  { name: "Reports", href: "/reports", icon: FileSpreadsheet, section: "ops" },
  { name: "Profile", href: "/profile", icon: User, section: "system" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const [userName, setUserName] = useState("M. Warehouse");
  const [userRole, setUserRole] = useState("MANAGER");
  const [userInitials, setUserInitials] = useState("MW");
  const [userId, setUserId] = useState("");
  const [photoTrigger, setPhotoTrigger] = useState(0);
  const [mounted, setMounted] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const fetchNotifications = async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/notifications`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error("Failed to fetch notifications", e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  const markAllRead = async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/notifications/read-all`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        fetchNotifications();
      }
    } catch (e) {}
  };

  const markRead = async (id: string) => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/notifications/${id}/read`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        fetchNotifications();
      }
    } catch (e) {}
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    setMounted(true);
    const token = getAuthToken();
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
    } else {
      router.push("/login");
    }

    const handleProfileUpdate = () => {
      setPhotoTrigger((prev) => prev + 1);
      const updatedToken = getAuthToken();
      if (updatedToken) {
        try {
          const payload = JSON.parse(atob(updatedToken.split(".")[1]));
          if (payload.name) setUserName(payload.name);
        } catch (e) {}
      }
    };
    window.addEventListener("profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("profile-updated", handleProfileUpdate);
  }, [router]);

  const handleLogout = async () => {
    const token = getAuthToken();
    if (token) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {}
    }
    clearAuthToken();
    window.location.href = "/login";
  };

  const getTranslationKey = (name: string): any => {
    const map: Record<string, string> = {
      Dashboard: "dashboard",
      Planning: "planning",
      Chat: "chat",
      Employees: "employees",
      Admins: "admins",
      Warehouses: "warehouses",
      Halls: "halls",
      Containers: "containers",
      Attendance: "attendance",
      Stundenzettel: "stundenzettel",
      Reports: "reports",
      Profile: "profile",
    };
    return map[name] || name;
  };

  const SidebarContent = () => {
    const allowedLinks = sidebarLinks.filter((link) => {
      if (userRole === "EMPLOYEE") return ["Dashboard", "Profile", "Chat"].includes(link.name);
      if (userRole === "ADMIN") return !["Reports", "Admins"].includes(link.name);
      return true;
    });

    const sections = [
      { id: "main", title: "Overview" },
      { id: "ops", title: "Operations" },
      { id: "resources", title: "Inventory & Assets" },
      { id: "people", title: "Users & Staff" },
      { id: "system", title: "System" },
    ];

    return (
      /* Dark navy sidebar — enterprise SaaS standard (Vercel/Linear style) */
      <div className="flex flex-col h-full bg-[#0b0f19] text-[#94a3b8] border-r border-[#1e293b]">
        
        {/* Brand */}
        <div className="px-6 py-5 flex items-center gap-3 border-b border-[#111827]">
          <div className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 shadow-lg shadow-[#1d4ed8]/10 overflow-hidden">
            <img src="/icon.png" alt="LogiFlow" className="w-8 h-8 object-cover rounded-lg" />
          </div>
          <div>
            <h1 className="font-extrabold text-white tracking-tight leading-none text-sm">LogiFlow</h1>
            <p className="text-[#4b5563] text-[10px] uppercase font-bold tracking-wider mt-1">WMS Portal</p>
          </div>
        </div>

        {/* Navigation grouped by sections */}
        <nav className="flex-1 overflow-y-auto py-5 px-4 space-y-5">
          {sections.map((sec) => {
            const sectionLinks = allowedLinks.filter(l => l.section === sec.id);
            if (sectionLinks.length === 0) return null;
            return (
              <div key={sec.id} className="space-y-1">
                <span className="text-[10px] font-bold tracking-widest text-[#4b5563] uppercase px-3 block mb-1.5">
                  {sec.title}
                </span>
                <div className="space-y-0.5">
                  {sectionLinks.map((link) => {
                    const isActive = pathname === link.href;
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.name}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all group ${
                          isActive
                            ? "bg-[#1d4ed8] text-white shadow-sm shadow-[#1d4ed8]/10"
                            : "text-[#9ca3af] hover:bg-[#111827] hover:text-white"
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-white" : "text-[#4b5563] group-hover:text-white"}`} />
                        <span className="flex-1">{t(getTranslationKey(link.name))}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div className="p-4 border-t border-[#111827] bg-[#070a12] space-y-2">
          <Link
            href="/profile"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#111827] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#1d4ed8] flex items-center justify-center font-bold text-xs text-white shrink-0 overflow-hidden relative shadow-inner">
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
              <p className="text-xs font-bold text-white truncate">{userName}</p>
              <p className="text-[9px] text-[#4b5563] uppercase tracking-wider font-extrabold mt-0.5">
                {userRole === "MANAGER" ? t("roleManager") : userRole === "ADMIN" ? t("roleAdmin") : t("roleEmployee")}
              </p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-[#4b5563] hover:bg-red-950/20 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>{t("logout")}</span>
          </button>
        </div>
      </div>
    );
  };

  // Breadcrumbs logic
  const getBreadcrumbs = () => {
    const segments: Array<{ label: string; href: string }> = [];
    if (pathname === "/") {
      segments.push({ label: t("dashboard"), href: "/" });
    } else {
      const activeLink = sidebarLinks.find(l => l.href === pathname);
      if (activeLink) {
        segments.push({ label: "LogiFlow", href: "/" });
        segments.push({ label: t(getTranslationKey(activeLink.name)), href: activeLink.href });
      } else {
        segments.push({ label: "LogiFlow", href: "/" });
      }
    }
    return segments;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex h-screen bg-[#f8fafc] text-[#0f172a]" suppressHydrationWarning>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[260px] lg:flex-col fixed inset-y-0 z-40 print:hidden">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:pl-[260px] min-h-screen">

        {/* Top Header */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-[#e2e8f0] bg-white print:hidden shrink-0 shadow-sm shadow-slate-100/50">
          {/* Left side: Breadcrumbs or mobile menu button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-[#64748b] hover:bg-[#f1f5f9] rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Premium Breadcrumbs */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              {breadcrumbs.map((b, idx) => (
                <React.Fragment key={b.href}>
                  {idx > 0 && <span className="text-slate-300">/</span>}
                  {idx === breadcrumbs.length - 1 ? (
                    <span className="text-slate-700 font-bold">{b.label}</span>
                  ) : (
                    <Link href={b.href} className="hover:text-slate-600 transition-colors">
                      {b.label}
                    </Link>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-8 h-8 flex items-center justify-center hover:bg-[#f1f5f9] rounded-lg relative transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4 text-[#64748b]" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 flex items-center justify-center bg-red-600 rounded-full text-[9px] font-bold text-white leading-none">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1rem))] bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="font-bold text-slate-800 text-xs">Benachrichtigungen</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-[10px] text-blue-600 hover:text-blue-700 font-bold transition-colors cursor-pointer"
                      >
                        Alle lesen
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400">
                        Keine Benachrichtigungen
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-3 text-left transition-colors flex gap-2.5 items-start ${
                            n.read ? "bg-white" : "bg-blue-50/30"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className={`text-xs truncate ${n.read ? "text-slate-700 font-medium" : "text-slate-900 font-bold"}`}>
                                {n.title}
                              </p>
                              {!n.read && (
                                <button
                                  onClick={() => markRead(n.id)}
                                  className="text-[9px] text-slate-400 hover:text-blue-600 font-medium shrink-0 transition-colors cursor-pointer"
                                >
                                  Gelesen
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 whitespace-pre-wrap leading-relaxed">
                              {n.message}
                            </p>
                            <p className="text-[9px] text-slate-400 mt-1">
                              {new Date(n.createdAt).toLocaleDateString("de-DE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Chip */}
            <Link
              href="/profile"
              className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#1d4ed8] text-white flex items-center justify-center font-bold text-xs overflow-hidden relative shadow-sm">
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
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold text-slate-700 leading-none">{userName}</p>
                <p className="text-[9px] text-[#64748b] uppercase tracking-wider font-bold mt-0.5">
                  {userRole === "MANAGER" ? t("roleManager") : userRole === "ADMIN" ? t("roleAdmin") : t("roleEmployee")}
                </p>
              </div>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 print:p-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
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
          className="absolute top-4 right-4 p-1.5 text-white hover:bg-[#1e293b] rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
