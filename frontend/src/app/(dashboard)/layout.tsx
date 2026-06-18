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
} from "lucide-react";

interface SidebarLink {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
}

const sidebarLinks: SidebarLink[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Planning", href: "/planning", icon: Calendar },
  { name: "Employees", href: "/employees", icon: Users },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const [userName, setUserName] = useState("M. Warehouse");
  const [userRole, setUserRole] = useState("Manager");
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

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    window.location.href = "/login";
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-surface-container-low text-on-surface border-r border-outline-variant">
      {/* Brand logo */}
      <div className="px-container-margin py-stack-md flex items-center gap-stack-sm border-b border-outline-variant">
        <div className="w-10 h-10 bg-secondary flex items-center justify-center rounded-lg text-white">
          <Warehouse className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-headline-md font-black text-secondary tracking-tight leading-none">
            LogiFlow
          </h1>
          <p className="text-on-surface-variant text-label-md">Operational Hub</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-stack-md px-2 flex flex-col gap-1">
        {sidebarLinks.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.name}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-label-md transition-all ${
                isActive
                  ? "bg-secondary-container text-white font-bold"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-on-surface-variant"}`} />
              <span>{link.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / logout */}
      <div className="p-stack-md flex flex-col gap-1 border-t border-outline-variant">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-on-surface-variant hover:bg-error-container hover:text-error rounded-lg text-label-md transition-all text-left"
        >
          <LogOut className="w-5 h-5" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background" suppressHydrationWarning>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[280px] lg:flex-col fixed inset-y-0 z-40 print:hidden">
        <SidebarContent />
      </aside>

      {/* Main Container */}
      <div className="flex flex-col flex-1 lg:pl-[280px] print:pl-0">
        {/* Top Header */}
        <header className="h-16 bg-surface border-b border-outline-variant flex justify-between items-center px-container-margin sticky top-0 z-30 print:hidden">
          <div className="flex items-center gap-stack-sm">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -ml-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg lg:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="font-headline-md font-bold text-primary lg:hidden">
              LogiFlow
            </h2>
          </div>

          <div className="flex items-center gap-stack-md">
            {/* Search */}
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                type="text"
                placeholder="Search SKU, Hall..."
                className="pl-9 pr-4 py-1.5 bg-surface-container-low border border-outline-variant rounded-full text-body-sm w-64 focus:ring-1 focus:ring-secondary focus:border-transparent outline-none"
              />
            </div>

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
                <p className="text-[10px] text-outline uppercase tracking-wider mt-1">{userRole.replace("_", " ")}</p>
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
