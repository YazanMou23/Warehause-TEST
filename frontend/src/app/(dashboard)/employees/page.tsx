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
  Calendar,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";

interface Employee {
  id: string;
  username: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  role: string;
  isActive: boolean;
  telegramId: string | null;
  warehouseId?: string | null;
  hallId?: string | null;
  employmentStart?: string;
}

export default function EmployeesPage() {
  const { t, language } = useTranslation();
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
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formWarehouse, setFormWarehouse] = useState("");
  const [formHall, setFormHall] = useState("");
  const [formTelegram, setFormTelegram] = useState("");
  const [formEmploymentStart, setFormEmploymentStart] = useState("");
  const [formRole, setFormRole] = useState("EMPLOYEE");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Bulk Selection
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  // Email Modal State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTargetEmp, setEmailTargetEmp] = useState<Employee | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");

  // Excel Import State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState("");

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
      // Request ONLY employees from backend
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees?role=EMPLOYEE&limit=1000`, { headers });
      const empJson = res.ok ? await res.json() : null;
      const empList = empJson && Array.isArray(empJson.data) ? empJson.data : (Array.isArray(empJson) ? empJson : []);
      setEmployees(empList);
      setIsOffline(false);
    } catch (err) {
      setIsOffline(true);
      setEmployees([
        { id: "emp-1", username: "employee1", name: "Johannes Müller", phone: "+491704444444", email: "j.mueller@logiflow.de", role: "EMPLOYEE", isActive: true, telegramId: "@jmueller", warehouseId: "wh-1", hallId: "hall-1", employmentStart: "2025-01-15T00:00:00.000Z" },
        { id: "emp-2", username: "employee2", name: "Dieter Schmidt", phone: "+491705555555", email: null, role: "EMPLOYEE", isActive: true, telegramId: null, warehouseId: "wh-1", hallId: "hall-2", employmentStart: "2025-02-10T00:00:00.000Z" },
        { id: "emp-3", username: "employee3", name: "Anna Weber", phone: "+491706666666", email: "a.weber@logiflow.de", role: "EMPLOYEE", isActive: true, telegramId: "@aweber", warehouseId: "wh-2", hallId: "hall-3", employmentStart: "2025-03-01T00:00:00.000Z" },
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
        if (payload.role === "EMPLOYEE") {
          // Employees have no access here
          router.push("/");
          return;
        }
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
    setFormUsername("");
    setFormPassword("");
    setFormWarehouse("");
    setFormHall("");
    setFormTelegram("");
    setFormRole("EMPLOYEE");
    setFormEmploymentStart(new Date().toISOString().split("T")[0]);
    setFormError("");
    setAddModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setSelectedEmp(emp);
    setFormName(emp.name);
    setFormPhone(emp.phone);
    setFormEmail(emp.email || "");
    setFormUsername(emp.username);
    setFormPassword("");
    setFormWarehouse(emp.warehouseId || "");
    setFormHall(emp.hallId || "");
    setFormTelegram(emp.telegramId || "");
    setFormRole(emp.role);
    setFormEmploymentStart(emp.employmentStart ? emp.employmentStart.split("T")[0] : new Date().toISOString().split("T")[0]);
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
          username: formUsername,
          name: formName,
          phone: formPhone,
          email: formEmail || null,
          role: "EMPLOYEE",
          isActive: true,
          telegramId: formTelegram || null,
          warehouseId: formWarehouse || null,
          hallId: formHall || null,
          employmentStart: new Date(formEmploymentStart).toISOString(),
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
          username: formUsername,
          name: formName,
          phone: formPhone,
          email: formEmail || undefined,
          passwordHash: formPassword,
          role: "EMPLOYEE", // Enforced for standard worker creations
          warehouseId: formWarehouse || undefined,
          hallId: formHall || undefined,
          telegramId: formTelegram || undefined,
          employmentStart: new Date(formEmploymentStart).toISOString(),
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
          username: formUsername,
          name: formName,
          phone: formPhone,
          email: formEmail || null,
          role: userRole === "MANAGER" ? formRole : emp.role,
          telegramId: formTelegram || null,
          warehouseId: formWarehouse || null,
          hallId: formHall || null,
          employmentStart: new Date(formEmploymentStart).toISOString(),
        } : emp));
        setEditModalOpen(false);
        return;
      }

      const body: any = {
        username: formUsername,
        name: formName,
        phone: formPhone,
        email: formEmail || null,
        warehouseId: formWarehouse || null,
        hallId: formHall || null,
        telegramId: formTelegram || null,
        employmentStart: new Date(formEmploymentStart).toISOString(),
      };

      if (userRole === "MANAGER") {
        body.role = formRole;
      }

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
    if (!window.confirm(language === "de" ? `Sind Sie sicher, dass Sie den Mitarbeiter ${name} deactivieren möchten?` : `Are you sure you want to deactivate employee ${name}?`)) {
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
    if (!window.confirm(language === "de" ? `Sind Sie sicher, dass Sie die ${selectedEmpIds.length} ausgewählten Mitarbeiter deactivieren möchten?` : `Are you sure you want to deactivate the ${selectedEmpIds.length} selected employee(s)?`)) {
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

  const openEmailModal = (emp: Employee) => {
    setEmailTargetEmp(emp);
    setEmailSubject("");
    setEmailMessage("");
    setEmailError("");
    setEmailSuccess("");
    setEmailModalOpen(true);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailTargetEmp) return;

    if (!emailSubject.trim()) {
      setEmailError("Please enter an email subject.");
      return;
    }
    if (!emailMessage.trim()) {
      setEmailError("Please enter an email message.");
      return;
    }

    setEmailLoading(true);
    setEmailError("");
    setEmailSuccess("");

    const token = localStorage.getItem("accessToken");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${emailTargetEmp.id}/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            subject: emailSubject.trim(),
            message: emailMessage.trim(),
          }),
        }
      );

      const data = await res.json();

      if (res.ok) {
        setEmailSuccess(data.message || `Email sent to ${emailTargetEmp.email}`);
        setEmailSubject("");
        setEmailMessage("");
      } else {
        setEmailError(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message || "Failed to send email."
        );
      }
    } catch (err: any) {
      setEmailError(err.message || "Network error occurred.");
    } finally {
      setEmailLoading(false);
    }
  };

  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.phone.includes(searchTerm) ||
    emp.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canManage = userRole === "ADMIN" || userRole === "MANAGER";

  const handleDownloadTemplate = async () => {
    const token = localStorage.getItem("accessToken");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/excel-template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mitarbeiter_import_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to download template. Make sure you are logged in.");
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    setImportLoading(true);
    setImportError("");
    setImportResult(null);
    setImportModalOpen(true);

    const token = localStorage.getItem("accessToken");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/import-excel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        if (data.summary?.createdCount > 0) loadEmployees();
      } else {
        setImportError(Array.isArray(data.message) ? data.message.join(", ") : data.message || "Import failed");
      }
    } catch (err: any) {
      setImportError(err.message || "Network error");
    } finally {
      setImportLoading(false);
    }
  };

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
          <h3 className="font-headline-lg font-bold text-on-surface">{t("employeeManagement")}</h3>
          <p className="text-on-surface-variant font-body-sm">
            {t("staffSubtitle")}
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Download Template */}
            <button
              onClick={handleDownloadTemplate}
              title="Download Excel template"
              className="border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-white px-3 py-2.5 rounded-lg font-label-md uppercase tracking-wider flex items-center gap-2 transition-colors shadow-sm cursor-pointer text-xs"
            >
              <Download className="w-4 h-4" /> Template
            </button>

            {/* Upload Excel */}
            <label
              title="Import employees from Excel"
              className="border border-blue-500/40 text-blue-400 hover:bg-blue-500 hover:text-white px-3 py-2.5 rounded-lg font-label-md uppercase tracking-wider flex items-center gap-2 transition-colors shadow-sm cursor-pointer text-xs"
            >
              <Upload className="w-4 h-4" /> Import Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportExcel}
              />
            </label>

            {/* Add Single Employee */}
            <button
              onClick={openAddModal}
              className="bg-primary text-on-primary px-4 py-2.5 rounded-lg font-label-md uppercase tracking-wider flex items-center gap-2 hover:bg-neutral-800 transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> {t("addEmployee")}
            </button>
          </div>
        )}
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, username or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm outline-none focus:ring-1 focus:ring-secondary focus:border-transparent text-on-surface"
          />
        </div>

        {canManage && selectedEmpIds.length > 0 && (
          <button
            onClick={handleBulkDeactivate}
            className="px-4 py-2 bg-error hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors self-start cursor-pointer shadow-sm"
          >
            <Trash2 className="w-4 h-4" /> {t("deactivateSelected")} ({selectedEmpIds.length})
          </button>
        )}
      </div>

      {/* Grid List */}
      <div className="bg-white border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant text-[#64748b] font-semibold text-xs uppercase tracking-wider">
                {canManage && (
                  <th className="p-3 text-center w-12">
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
                        <CheckSquare className="w-4 h-4 inline" />
                      ) : (
                        <Square className="w-4 h-4 inline" />
                      )}
                    </button>
                  </th>
                )}
                <th className="px-4 py-3">{t("nameColumn")}</th>
                <th className="px-4 py-3">{t("usernameLabel")}</th>
                <th className="px-4 py-3">{t("phone")}</th>
                <th className="px-4 py-3">{t("email")}</th>
                <th className="px-4 py-3">{t("employmentStart")}</th>
                <th className="px-4 py-3">{t("telegramId")}</th>
                <th className="px-4 py-3">{t("actionsColumn")}</th>
                {canManage && <th className="px-4 py-3 text-right">Settings</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 9 : 7} className="p-8 text-center text-outline italic">
                    {t("noStaffFound")}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className={`hover:bg-surface-bright transition-colors ${selectedEmpIds.includes(emp.id) ? "bg-secondary-container/5" : ""}`}>
                    {canManage && (
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            if (selectedEmpIds.includes(emp.id)) {
                              setSelectedEmpIds(prev => prev.filter(id => id !== emp.id));
                            } else {
                              setSelectedEmpIds(prev => [...prev, emp.id]);
                            }
                          }}
                          className="text-outline hover:text-secondary cursor-pointer"
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
                        <div className="w-8.5 h-8.5 rounded-full bg-secondary/15 text-secondary flex items-center justify-center font-bold text-sm relative overflow-hidden shrink-0">
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
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12.5px] text-on-surface">
                      {emp.username}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12.5px] text-outline">
                      {emp.phone}
                    </td>
                    <td className="px-4 py-3.5">
                      {emp.email ? (
                        <a
                          href={`mailto:${emp.email}`}
                          className="text-[12px] text-[#2563eb] hover:underline font-mono flex items-center gap-1 group"
                          title={emp.email}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0 text-[#94a3b8] group-hover:text-[#2563eb]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="max-w-[160px] truncate">{emp.email}</span>
                        </a>
                      ) : (
                        <span className="text-outline italic text-[11px]">— no email</span>
                      )}
                    </td>
                    <td suppressHydrationWarning className="px-4 py-3.5 font-mono text-[12.5px]">
                      {emp.employmentStart ? new Date(emp.employmentStart).toLocaleDateString(language === "de" ? "de-DE" : "en-CA") : "—"}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12px]">
                      {emp.telegramId ? (
                        <span className="text-secondary flex items-center gap-1 font-bold">
                          <MessageSquare className="w-3.5 h-3.5" /> {emp.telegramId}
                        </span>
                      ) : (
                        <span className="text-outline italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <a
                          href={getWhatsAppLink(emp.phone, emp.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded border border-emerald-500/20 text-[11px] font-bold transition-all"
                        >
                          WhatsApp
                        </a>
                        <a
                          href={getSmsLink(emp.phone)}
                          className="px-2.5 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded border border-blue-500/20 text-[11px] font-bold transition-all"
                        >
                          SMS
                        </a>
                        {canManage && emp.email && (
                          <button
                            onClick={() => openEmailModal(emp)}
                            title={`Send email to ${emp.email}`}
                            className="px-2.5 py-1 bg-violet-500/10 text-violet-400 hover:bg-violet-500 hover:text-white rounded border border-violet-500/20 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Mail className="w-3 h-3" /> Email
                          </button>
                        )}
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-1 text-on-surface-variant hover:text-secondary rounded hover:bg-surface-container-high transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeactivate(emp.id, emp.name)}
                            className="p-1 text-on-surface-variant hover:text-error rounded hover:bg-error-container/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Excel Import Result Modal ── */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-[#0f1117] border-b border-[#334155] flex justify-between items-center">
              <h4 className="font-bold text-body-lg text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                Excel Import
              </h4>
              {!importLoading && (
                <button onClick={() => setImportModalOpen(false)} className="text-on-surface-variant hover:text-white p-1 hover:bg-[#334155] rounded-lg transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-4">
              {/* Loading */}
              {importLoading && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
                  <p className="text-white text-sm">Processing Excel file...</p>
                </div>
              )}

              {/* Error */}
              {!importLoading && importError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{importError}</p>
                </div>
              )}

              {/* Success Result */}
              {!importLoading && importResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#0f1117] rounded-lg p-3 text-center border border-[#334155]">
                      <p className="text-2xl font-bold text-white">{importResult.summary?.totalProcessed ?? 0}</p>
                      <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider mt-1">Processed</p>
                    </div>
                    <div className="bg-emerald-500/10 rounded-lg p-3 text-center border border-emerald-500/20">
                      <p className="text-2xl font-bold text-emerald-400">{importResult.summary?.createdCount ?? 0}</p>
                      <p className="text-[11px] text-emerald-400/70 uppercase tracking-wider mt-1">Created</p>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-3 text-center border border-red-500/20">
                      <p className="text-2xl font-bold text-red-400">{importResult.summary?.failedCount ?? 0}</p>
                      <p className="text-[11px] text-red-400/70 uppercase tracking-wider mt-1">Skipped</p>
                    </div>
                  </div>

                  {importResult.summary?.createdCount > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <p className="text-emerald-300 text-sm">{importResult.message}</p>
                    </div>
                  )}

                  {/* Errors list */}
                  {importResult.summary?.errors?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase text-[#94a3b8] tracking-wider">Skipped Rows</p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {importResult.summary.errors.map((err: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 p-2 bg-[#0f1117] rounded text-xs border border-[#334155]">
                            <span className="text-[#64748b] shrink-0">Row {err.row}:</span>
                            <span className="text-[#94a3b8]">{err.name || err.phone || "—"}</span>
                            <span className="text-red-400 ml-auto text-right">{err.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!importLoading && (
              <div className="px-6 py-4 bg-[#0f1117] border-t border-[#334155] flex justify-end">
                <button
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 bg-secondary text-white font-bold rounded-lg text-sm hover:bg-secondary/90 cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-[#0f1117] border-b border-[#334155] flex justify-between items-center">
              <h4 className="font-bold text-body-lg text-white">{t("addEmployee")}</h4>
              <button onClick={() => setAddModalOpen(false)} className="text-on-surface-variant hover:text-white p-1 hover:bg-[#334155] rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-error-container/20 border border-error/20 text-error rounded-lg flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("nameColumn")}</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Emil Employee"
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("phone")}</label>
                  <input
                    type="text"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+491701234567"
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("usernameLabel")}</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="e.g. emilemployee"
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("passwordLabel")}</label>
                  <input
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("email")}</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. e.employee@logiflow.de"
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("employmentStart")}</label>
                  <input
                    type="date"
                    required
                    value={formEmploymentStart}
                    onChange={(e) => setFormEmploymentStart(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">Warehouse Assignment</label>
                  <select
                    value={formWarehouse}
                    onChange={(e) => {
                      setFormWarehouse(e.target.value);
                      setFormHall("");
                    }}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value="">None</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">Hall Assignment</label>
                  <select
                    value={formHall}
                    onChange={(e) => setFormHall(e.target.value)}
                    disabled={!formWarehouse}
                    className="w-full px-3.5 py-2 border border-[#334155] disabled:opacity-50 focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value="">None</option>
                    {halls.filter(h => h.warehouseId === formWarehouse).map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("telegramId")}</label>
                <input
                  type="text"
                  value={formTelegram}
                  onChange={(e) => setFormTelegram(e.target.value)}
                  placeholder="e.g. @username"
                  className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                />
              </div>

              <div className="px-6 py-4 bg-[#0f1117] border-t border-[#334155] flex justify-end gap-3 -mx-6 -mb-6">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 border border-[#334155] text-white rounded-lg text-sm hover:bg-[#1e293b] cursor-pointer"
                >
                  {t("close")}
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-secondary text-white font-bold rounded-lg text-sm hover:bg-secondary/90 disabled:opacity-50 cursor-pointer"
                >
                  {formLoading ? "Saving..." : t("saveSettings")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editModalOpen && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-[#0f1117] border-b border-[#334155] flex justify-between items-center">
              <h4 className="font-bold text-body-lg text-white">{t("editEmployee")}</h4>
              <button onClick={() => setEditModalOpen(false)} className="text-on-surface-variant hover:text-white p-1 hover:bg-[#334155] rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditEmployee} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-error-container/20 border border-error/20 text-error rounded-lg flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("nameColumn")}</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("phone")}</label>
                  <input
                    type="text"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("usernameLabel")}</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("passwordLabel")} (Leave blank to keep current)</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("email")}</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("employmentStart")}</label>
                  <input
                    type="date"
                    required
                    value={formEmploymentStart}
                    onChange={(e) => setFormEmploymentStart(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">Warehouse Assignment</label>
                  <select
                    value={formWarehouse}
                    onChange={(e) => {
                      setFormWarehouse(e.target.value);
                      setFormHall("");
                    }}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value="">None</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">Hall Assignment</label>
                  <select
                    value={formHall}
                    onChange={(e) => setFormHall(e.target.value)}
                    disabled={!formWarehouse}
                    className="w-full px-3.5 py-2 border border-[#334155] disabled:opacity-50 focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value="">None</option>
                    {halls.filter(h => h.warehouseId === formWarehouse).map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">{t("telegramId")}</label>
                <input
                  type="text"
                  value={formTelegram}
                  onChange={(e) => setFormTelegram(e.target.value)}
                  className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                />
              </div>

              {userRole === "MANAGER" && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">Role</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value="EMPLOYEE">EMPLOYEE</option>
                    <option value="ADMIN">ADMIN (Promote to Admin)</option>
                    <option value="MANAGER">MANAGER (Promote to Manager)</option>
                  </select>
                </div>
              )}

              <div className="px-6 py-4 bg-[#0f1117] border-t border-[#334155] flex justify-end gap-3 -mx-6 -mb-6">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 border border-[#334155] text-white rounded-lg text-sm hover:bg-[#1e293b] cursor-pointer"
                >
                  {t("close")}
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-secondary text-white font-bold rounded-lg text-sm hover:bg-secondary/90 disabled:opacity-50 cursor-pointer"
                >
                  {formLoading ? "Saving..." : t("saveSettings")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Compose Modal */}
      {emailModalOpen && emailTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#0f1117] border-b border-[#334155] flex justify-between items-center">
              <div>
                <h4 className="font-bold text-body-lg text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-violet-400" />
                  Send Email
                </h4>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  To: <span className="text-violet-300 font-mono">{emailTargetEmp.email}</span>
                  {" — "}{emailTargetEmp.name}
                </p>
              </div>
              <button
                onClick={() => setEmailModalOpen(false)}
                className="text-on-surface-variant hover:text-white p-1 hover:bg-[#334155] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="p-6 space-y-4">
              {/* Error */}
              {emailError && (
                <div className="p-3 bg-red-900/30 border border-red-500/30 text-red-300 rounded-lg flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{emailError}</span>
                </div>
              )}

              {/* Success */}
              {emailSuccess && (
                <div className="p-3 bg-green-900/30 border border-green-500/30 text-green-300 rounded-lg flex items-start gap-2 text-xs">
                  <Send className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{emailSuccess}</span>
                </div>
              )}

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">
                  Subject <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="e.g. Shift Schedule Update"
                  maxLength={200}
                  className="w-full px-3.5 py-2 border border-[#334155] focus:border-violet-500 rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider">
                  Message <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Type your message here..."
                  rows={6}
                  maxLength={5000}
                  className="w-full px-3.5 py-2 border border-[#334155] focus:border-violet-500 rounded-lg text-body-sm outline-none bg-[#0f1117] text-white resize-y"
                />
                <p className="text-[10px] text-on-surface-variant text-right">{emailMessage.length}/5000</p>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-[#0f1117] border-t border-[#334155] flex justify-end gap-3 -mx-6 -mb-6">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  disabled={emailLoading}
                  className="px-4 py-2 border border-[#334155] text-white rounded-lg text-sm hover:bg-[#1e293b] cursor-pointer disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="px-4 py-2 bg-violet-600 text-white font-bold rounded-lg text-sm hover:bg-violet-500 disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {emailLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
