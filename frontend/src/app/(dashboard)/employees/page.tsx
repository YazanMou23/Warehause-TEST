"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  AlertTriangle,
  UserCheck,
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  Phone,
  Mail,
  Send,
  X,
  CheckSquare,
  Square,
  Lock,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
  isActive: boolean;
  telegramId: string | null;
  warehouseId?: string | null;
  hallId?: string | null;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [halls, setHalls] = useState<any[]>([]);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("EMPLOYEE");
  const [formWarehouse, setFormWarehouse] = useState("");
  const [formHall, setFormHall] = useState("");
  const [formTelegram, setFormTelegram] = useState("");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Bulk Selection
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  const router = useRouter();

  const loadEmployees = async () => {
    setLoading(true);
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees`, { headers });
      const empJson = res.ok ? await res.json() : null;
      const empList = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
      setEmployees(empList);
      setIsOffline(false);
    } catch (err) {
      setIsOffline(true);
      setEmployees([
        { id: "emp-1", name: "Johannes Müller", phone: "+491704444444", email: "j.mueller@logiflow.de", role: "EMPLOYEE", isActive: true, telegramId: "@jmueller", warehouseId: "wh-1", hallId: "hall-1" },
        { id: "emp-2", name: "Dieter Schmidt", phone: "+491705555555", email: null, role: "EMPLOYEE", isActive: true, telegramId: null, warehouseId: "wh-1", hallId: "hall-2" },
        { id: "emp-3", name: "Anna Weber", phone: "+491706666666", email: "a.weber@logiflow.de", role: "TEAM_LEADER", isActive: true, telegramId: "@aweber", warehouseId: "wh-2", hallId: "hall-3" },
        { id: "emp-4", name: "M. Warehouse", phone: "+491701111111", email: "manager@logiflow.de", role: "ADMIN", isActive: true, telegramId: "@mwarehouse", warehouseId: null, hallId: null },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUserRole(payload.role || "");
      } catch (e) {}
    }

    const loadInfo = async () => {
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const [whRes, hRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/warehouses`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/halls`, { headers })
        ]);
        if (whRes.ok) {
          const data = await whRes.json();
          setWarehouses(data.data || data);
        }
        if (hRes.ok) {
          const data = await hRes.json();
          setHalls(data.data || data);
        }
      } catch (e) {}
    };

    loadEmployees();
    if (token) loadInfo();
  }, [router]);

  const openAddModal = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("EMPLOYEE");
    setFormWarehouse("");
    setFormHall("");
    setFormTelegram("");
    setFormError("");
    setAddModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setSelectedEmp(emp);
    setFormName(emp.name);
    setFormPhone(emp.phone);
    setFormEmail(emp.email || "");
    setFormPassword("");
    setFormRole(emp.role);
    setFormWarehouse(emp.warehouseId || "");
    setFormHall(emp.hallId || "");
    setFormTelegram(emp.telegramId || "");
    setFormError("");
    setEditModalOpen(true);
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");

    const token = localStorage.getItem("accessToken");
    try {
      if (isOffline) {
        const newEmp: Employee = {
          id: "emp-" + Date.now(),
          name: formName,
          phone: formPhone,
          email: formEmail || null,
          role: formRole,
          isActive: true,
          telegramId: formTelegram || null,
          warehouseId: formWarehouse || null,
          hallId: formHall || null,
        };
        setEmployees(prev => [...prev, newEmp]);
        setAddModalOpen(false);
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formName,
          phone: formPhone,
          email: formEmail || undefined,
          passwordHash: formPassword,
          role: formRole,
          warehouseId: formWarehouse || undefined,
          hallId: formHall || undefined,
          telegramId: formTelegram || undefined,
        }),
      });

      if (res.ok) {
        setAddModalOpen(false);
        loadEmployees();
      } else {
        const err = await res.json();
        setFormError(err.message || "Failed to add employee");
      }
    } catch (err: any) {
      setFormError(err.message || "Network error occurred.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    setFormLoading(true);
    setFormError("");

    const token = localStorage.getItem("accessToken");
    try {
      if (isOffline) {
        setEmployees(prev => prev.map(emp => emp.id === selectedEmp.id ? {
          ...emp,
          name: formName,
          phone: formPhone,
          email: formEmail || null,
          role: formRole,
          telegramId: formTelegram || null,
          warehouseId: formWarehouse || null,
          hallId: formHall || null,
        } : emp));
        setEditModalOpen(false);
        return;
      }

      const body: any = {
        name: formName,
        phone: formPhone,
        email: formEmail || null,
        role: formRole,
        warehouseId: formWarehouse || null,
        hallId: formHall || null,
        telegramId: formTelegram || null,
      };

      if (formPassword) {
        body.password = formPassword;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${selectedEmp.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setEditModalOpen(false);
        loadEmployees();
      } else {
        const err = await res.json();
        setFormError(err.message || "Failed to update employee");
      }
    } catch (err: any) {
      setFormError(err.message || "Network error occurred.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeactivate = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to deactivate employee ${name}?`)) {
      return;
    }

    const token = localStorage.getItem("accessToken");
    try {
      if (isOffline) {
        setEmployees(prev => prev.filter(emp => emp.id !== id));
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        loadEmployees();
      } else {
        alert("Failed to deactivate employee");
      }
    } catch (e) {
      console.error(e);
      alert("Error occurred");
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedEmpIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to deactivate the ${selectedEmpIds.length} selected employee(s)?`)) {
      return;
    }

    const token = localStorage.getItem("accessToken");
    try {
      if (isOffline) {
        setEmployees(prev => prev.filter(emp => !selectedEmpIds.includes(emp.id)));
        setSelectedEmpIds([]);
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/bulk`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selectedEmpIds }),
      });

      if (res.ok) {
        setSelectedEmpIds([]);
        loadEmployees();
      } else {
        alert("Failed to deactivate employees");
      }
    } catch (e) {
      console.error(e);
      alert("Error occurred");
    }
  };

  const getWhatsAppLink = (phone: string, name: string) => {
    const cleaned = phone.replace(/\D/g, "");
    const text = encodeURIComponent(`Hallo ${name}, dies ist eine Nachricht von LogiFlow Warehouse Management.`);
    return `https://wa.me/${cleaned}?text=${text}`;
  };

  const getSmsLink = (phone: string) => {
    return `sms:${phone}`;
  };

  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.phone.includes(searchTerm)
  );

  const isAdmin = userRole === "ADMIN";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-stack-lg animate-fadeIn text-on-background">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-headline-lg font-bold text-on-surface">Staff Directory</h3>
          <p className="text-on-surface-variant font-body-sm">
            Overview of registered warehouse workers, team leaders, and administrative accounts.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={openAddModal}
            className="bg-primary text-on-primary px-4 py-2.5 rounded-lg font-label-md uppercase tracking-wider flex items-center gap-2 hover:bg-neutral-800 transition-colors shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        )}
      </div>

      {isOffline && (
        <div className="bg-tertiary-container text-on-tertiary-container border border-on-tertiary-container/20 px-3.5 py-2 rounded-lg flex items-center gap-2 text-label-md">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Offline mock active. Displaying local staff listings.</span>
        </div>
      )}

      {/* Bulk Delete & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input
            type="text"
            placeholder="Search Name or Phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm outline-none focus:ring-1 focus:ring-secondary focus:border-transparent text-on-surface"
          />
        </div>

        {isAdmin && selectedEmpIds.length > 0 && (
          <div className="flex items-center gap-3 bg-error-container/20 px-3 py-1.5 rounded-lg border border-error-container/20 text-xs">
            <span className="text-error font-medium">{selectedEmpIds.length} selected</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedEmpIds([])}
                className="text-on-surface hover:underline font-bold px-1.5 py-0.5"
              >
                Clear
              </button>
              <button
                onClick={handleBulkDeactivate}
                className="bg-error text-white px-2.5 py-1 rounded font-bold hover:bg-red-700 transition-colors shadow-sm"
              >
                Deactivate Selected
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Staff Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-outline uppercase tracking-wider">
              {isAdmin && (
                <th className="p-3 w-12 text-center">
                  <button
                    onClick={() => {
                      if (selectedEmpIds.length === filteredEmployees.length) {
                        setSelectedEmpIds([]);
                      } else {
                        setSelectedEmpIds(filteredEmployees.map((e) => e.id));
                      }
                    }}
                    className="text-outline hover:text-secondary"
                  >
                    {selectedEmpIds.length === filteredEmployees.length && filteredEmployees.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-secondary inline" />
                    ) : (
                      <Square className="w-4 h-4 inline" />
                    )}
                  </button>
                </th>
              )}
              <th className="px-4 py-3">Staff Name</th>
              <th className="px-4 py-3">Phone number</th>
              <th className="px-4 py-3">Security Role</th>
              <th className="px-4 py-3">Telegram Username</th>
              <th className="px-4 py-3">Quick Actions</th>
              {isAdmin && <th className="px-4 py-3 text-right">Settings</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
            {filteredEmployees.map((emp) => (
              <tr key={emp.id} className={`hover:bg-surface-bright transition-colors ${selectedEmpIds.includes(emp.id) ? "bg-secondary-container/5" : ""}`}>
                {isAdmin && (
                  <td className="p-3 text-center">
                    <button
                      onClick={() => {
                        if (selectedEmpIds.includes(emp.id)) {
                          setSelectedEmpIds(prev => prev.filter(id => id !== emp.id));
                        } else {
                          setSelectedEmpIds(prev => [...prev, emp.id]);
                        }
                      }}
                      className="text-outline hover:text-secondary"
                    >
                      {selectedEmpIds.includes(emp.id) ? (
                        <CheckSquare className="w-4 h-4 text-secondary inline" />
                      ) : (
                        <Square className="w-4 h-4 inline" />
                      )}
                    </button>
                  </td>
                )}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8.5 h-8.5 rounded-full bg-secondary/15 text-secondary flex items-center justify-center font-bold text-sm relative overflow-hidden">
                      <img
                        src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${emp.id}/photo`}
                        alt={emp.name}
                        className="w-full h-full object-cover absolute inset-0 z-10"
                        style={{ display: "none" }}
                        onLoad={(e) => {
                          e.currentTarget.style.display = "block";
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                      <span className="text-xs font-bold">
                        {emp.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-on-surface block leading-tight">{emp.name}</span>
                      {emp.email && <span className="text-[10px] text-outline">{emp.email}</span>}
                    </div>
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
                    <span className="text-secondary flex items-center gap-1 font-bold">
                      <MessageSquare className="w-3.5 h-3.5" /> {emp.telegramId}
                    </span>
                  ) : (
                    <span className="text-outline italic">Not linked</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <a
                      href={getWhatsAppLink(emp.phone, emp.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 rounded-lg transition-colors inline-flex items-center gap-1 text-[11px] font-bold"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                    <a
                      href={getSmsLink(emp.phone)}
                      className="p-1.5 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors inline-flex items-center gap-1 text-[11px] font-bold"
                    >
                      <Phone className="w-3.5 h-3.5" /> SMS
                    </a>
                  </div>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => openEditModal(emp)}
                        className="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-secondary-container/10 rounded transition-colors"
                        title="Edit Employee"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeactivate(emp.id, emp.name)}
                        className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded transition-colors"
                        title="Deactivate"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal - Add Employee */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-lg w-full p-stack-md shadow-2xl relative">
            <button
              onClick={() => setAddModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-body-lg text-on-surface mb-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-secondary" /> Add New Employee
            </h3>
            <p className="text-on-surface-variant text-xs mb-4">
              Register a new worker or manager inside the LogiFlow system.
            </p>

            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Max Mustermann"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. +491701234567"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      placeholder="e.g. max@logiflow.de"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      placeholder="Password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Security Role
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="TEAM_LEADER">Team Leader</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Telegram Username
                  </label>
                  <div className="relative">
                    <Send className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. @maxmuster"
                      value={formTelegram}
                      onChange={(e) => setFormTelegram(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Warehouse Depot
                  </label>
                  <select
                    value={formWarehouse}
                    onChange={(e) => setFormWarehouse(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                  >
                    <option value="">Not Assigned</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Staging Hall
                  </label>
                  <select
                    value={formHall}
                    onChange={(e) => setFormHall(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                  >
                    <option value="">Not Assigned</option>
                    {halls
                      .filter((h) => !formWarehouse || h.warehouseId === formWarehouse)
                      .map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              {formError && (
                <div className="bg-error-container text-on-error-container px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant hover:bg-surface-container-high rounded-lg text-label-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-secondary text-white hover:bg-secondary-container rounded-lg text-label-md transition-colors font-bold disabled:opacity-50"
                >
                  {formLoading ? "Adding..." : "Add Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Edit Employee */}
      {editModalOpen && selectedEmp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-outline-variant rounded-xl max-w-lg w-full p-stack-md shadow-2xl relative">
            <button
              onClick={() => setEditModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-body-lg text-on-surface mb-1 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-secondary" /> Edit Employee: {selectedEmp.name}
            </h3>
            <p className="text-on-surface-variant text-xs mb-4">
              Update profiles and warehouse assignments for this employee.
            </p>

            <form onSubmit={handleEditEmployee} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Change Password (Optional)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      placeholder="Leave blank to keep current"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Security Role
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="TEAM_LEADER">Team Leader</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Telegram Username
                  </label>
                  <div className="relative">
                    <Send className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={formTelegram}
                      onChange={(e) => setFormTelegram(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Warehouse Depot
                  </label>
                  <select
                    value={formWarehouse}
                    onChange={(e) => setFormWarehouse(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                  >
                    <option value="">Not Assigned</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    Staging Hall
                  </label>
                  <select
                    value={formHall}
                    onChange={(e) => setFormHall(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                  >
                    <option value="">Not Assigned</option>
                    {halls
                      .filter((h) => !formWarehouse || h.warehouseId === formWarehouse)
                      .map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              {formError && (
                <div className="bg-error-container text-on-error-container px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant hover:bg-surface-container-high rounded-lg text-label-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-secondary text-white hover:bg-secondary-container rounded-lg text-label-md transition-colors font-bold disabled:opacity-50"
                >
                  {formLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
