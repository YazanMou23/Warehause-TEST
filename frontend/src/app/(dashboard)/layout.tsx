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
} from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

interface SidebarLink {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
}

const sidebarLinks: SidebarLink[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Planning", href: "/planning", icon: Calendar },
  { name: "Employees", href: "/employees", icon: Users },
  { name: "Admins", href: "/admins", icon: Shield },
  { name: "Warehouses", href: "/warehouses", icon: Warehouse },
  { name: "Halls", href: "/halls", icon: Grid },
  { name: "Containers", href: "/containers", icon: Package },
  { name: "Attendance", href: "/attendance", icon: Clock },
  { name: "OCR Upload", href: "/ocr", icon: Scan },
  { name: "Reports", href: "/reports", icon: FileSpreadsheet },
  { name: "Profile", href: "/profile", icon: User },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const [userName, setUserName] = useState("M. Warehouse");
  const [userRole, setUserRole] = useState("MANAGER");
  const [userInitials, setUserInitials] = useState("MW");
  const [userId, setUserId] = useState("");
  const [photoTrigger, setPhotoTrigger] = useState(0);

  useEffect(() => {
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
        if (payload.role) {
          setUserRole(payload.role);
        }
        if (payload.sub) {
          setUserId(payload.sub);
        }
      } catch (e) {
        console.error("Failed to decode token", e);
      }
    }

    // Listen to profile updates
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
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } catch (e) {}
    }
    localStorage.removeItem("accessToken");
    window.location.href = "/login";
  };

  const getTranslationKey = (name: string): any => {
    const map: Record<string, string> = {
      "Dashboard": "dashboard",
      "Planning": "planning",
      "Employees": "employees",
      "Admins": "admins",
      "Warehouses": "warehouses",
      "Halls": "halls",
      "Containers": "containers",
      "Attendance": "attendance",
      "OCR Upload": "ocrUpload",
      "Reports": "reports",
      "Profile": "profile",
      "Settings": "settings"
    };
    return map[name] || name;
  };

  const SidebarContent = () => {
    const allowedLinks = sidebarLinks.filter((link) => {
      if (userRole === "EMPLOYEE") {
        return ["Dashboard", "Profile", "Settings"].includes(link.name);
      }
      if (userRole === "ADMIN") {
        return !["Reports", "Admins"].includes(link.name);
      }
      return true; // MANAGER sees all
    });

    return (
      <div className="flex flex-col h-full bg-surface-container-low text-on-surface border-r border-outline-variant">
        {/* Brand logo */}
        <div className="px-container-margin py-stack-md flex items-center gap-stack-sm border-b border-outline-variant">
          <div className="w-10 h-10 bg-secondary flex items-center justify-center rounded-lg text-white">
            <Warehouse className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-headline-md font-black text-secondary tracking-tight leading-none">
              {t("appName")}
            </h1>
            <p className="text-on-surface-variant text-label-md">Operational Hub</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-stack-md px-2 flex flex-col gap-1">
          {allowedLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 text-body-sm font-medium rounded-lg transition-all ${
                  isActive
                    ? "bg-secondary text-white font-bold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-outline"}`} />
                <span>{t(getTranslationKey(link.name))}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout Section */}
        <div className="p-stack-md border-t border-outline-variant">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-body-sm font-medium text-error hover:bg-error-container/10 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            <span>{t("logout")}</span>
          </button>
        </div>
      </div>
    );
  };

  const displayRoleText = () => {
    if (userRole === "MANAGER") return t("roleManager");
    if (userRole === "ADMIN") return t("roleAdmin");
    return t("roleEmployee");
  };

  return (
    <div className="flex h-screen bg-[#0f1117] text-white" suppressHydrationWarning>
      {/* 1. Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[280px] lg:flex-col fixed inset-y-0 z-40 print:hidden">
        <SidebarContent />
      </aside>

      {/* 2. Main content area */}
      <div className="flex-1 flex flex-col lg:pl-[280px] min-h-screen">
        
        {/* Dashboard Header */}
        <header className="h-16 flex items-center justify-between px-container-margin border-b border-outline-variant bg-surface-container-low print:hidden shrink-0">
          
          {/* Menu button for mobile */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Search bar placeholder */}
          <div className="relative hidden md:block w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              placeholder="Search operations..."
              disabled
              className="w-full bg-[#0f1117] border border-[#334155] rounded-full pl-9 pr-4 py-1.5 text-body-sm text-on-surface-variant outline-none opacity-60"
            />
          </div>

          <div className="flex items-center gap-4">
            {/* Notifications */}
            <button className="w-10 h-10 flex items-center justify-center hover:bg-surface-container-high rounded-full relative transition-colors">
              <Bell className="w-5 h-5 text-on-surface-variant" />
              <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-error rounded-full border-2 border-surface"></span>
            </button>

            {/* User Profile */}
            <Link
              href="/profile"
              className="flex items-center gap-2 pl-4 border-l border-outline-variant hover:opacity-80 transition-all"
            >
              <div className="text-right hidden sm:block">
                <p className="font-label-md text-on-surface leading-none">{userName}</p>
                <p className="text-[10px] text-outline uppercase tracking-wider mt-1">{displayRoleText()}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-secondary-container text-white flex items-center justify-center font-bold text-sm border border-outline-variant overflow-hidden relative">
                {userId && (
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${userId}/photo?t=${photoTrigger}`}
                    alt={userName}
                    className="w-full h-full object-cover absolute inset-0 z-10"
                    style={{ display: "none" }}
                    onLoad={(e) => {
                      e.currentTarget.style.display = "block";
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <span className="w-full h-full flex items-center justify-center bg-secondary-container text-white text-xs font-bold">
                  {userInitials}
                </span>
              </div>
            </Link>
          </div>
        </header>

        {/* Scrollable Dashboard Area */}
        <main className="flex-1 overflow-y-auto p-container-margin print:p-0">
          {children}
        </main>
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 lg:hidden animate-fadeIn"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer Content */}
      <div
        className={`fixed inset-y-0 left-0 w-[280px] z-50 lg:hidden transform transition-transform duration-300 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 right-4 p-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
