"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users, Search, AlertTriangle, ShieldCheck, UserCheck, MessageSquare } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
  telegramId: string | null;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    const loadEmployees = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const res = await fetch("http://localhost:3000/employees", { headers });
        const empJson = res.ok ? await res.json() : null;
        const empList = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
        setEmployees(empList);
        setIsOffline(false);
      } catch (err) {
        setIsOffline(true);
        // Fallback mock
        setEmployees([
          { id: "emp-1", name: "Johannes Müller", phone: "+491704444444", role: "EMPLOYEE", isActive: true, telegramId: "@jmueller" },
          { id: "emp-2", name: "Dieter Schmidt", phone: "+491705555555", role: "EMPLOYEE", isActive: true, telegramId: null },
          { id: "emp-3", name: "Anna Weber", phone: "+491706666666", role: "TEAM_LEADER", isActive: true, telegramId: "@aweber" },
          { id: "emp-4", name: "M. Warehouse", phone: "+491701111111", role: "ADMIN", isActive: true, telegramId: "@mwarehouse" },
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadEmployees();
  }, [router]);

  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.phone.includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-stack-lg animate-fadeIn">
      <div>
        <h3 className="font-headline-lg font-bold text-on-surface">Staff Directory</h3>
        <p className="text-on-surface-variant font-body-sm">
          Overview of registered warehouse workers, team leaders, and administrative accounts.
        </p>
      </div>

      {isOffline && (
        <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-2 rounded-lg flex items-center gap-2 text-label-md">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline mock active. Displaying local staff listings.</span>
        </div>
      )}

      {/* Search */}
      <div className="bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input
            type="text"
            placeholder="Search Name or Phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm outline-none focus:ring-1 focus:ring-secondary focus:border-transparent"
          />
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider">
              <th className="px-container-margin py-3">Staff Name</th>
              <th className="px-4 py-3">Phone number</th>
              <th className="px-4 py-3">Security Role</th>
              <th className="px-4 py-3">Telegram Username</th>
              <th className="px-container-margin py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
            {filteredEmployees.map((emp) => (
              <tr key={emp.id} className="hover:bg-surface-bright transition-colors">
                <td className="px-container-margin py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8.5 h-8.5 rounded-full bg-secondary/15 text-secondary flex items-center justify-center font-bold text-sm">
                      {emp.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <span className="font-semibold text-on-surface">{emp.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 font-mono text-[12.5px] text-outline">
                  {emp.phone}
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono ${
                      emp.role === "ADMIN"
                        ? "bg-red-100 text-red-800"
                        : emp.role === "TEAM_LEADER"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {emp.role.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3.5 font-mono text-[12px]">
                  {emp.telegramId ? (
                    <span className="text-secondary flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" /> {emp.telegramId}
                    </span>
                  ) : (
                    <span className="text-outline italic">Not linked</span>
                  )}
                </td>
                <td className="px-container-margin py-3.5 text-right">
                  <span className="text-emerald-700 text-xs font-bold flex items-center justify-end gap-1 font-mono">
                    <UserCheck className="w-4 h-4 text-emerald-600" /> ACTIVE
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
