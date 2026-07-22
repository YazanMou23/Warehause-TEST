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
  employmentEnd?: string | null;
}

const getFirstName = (fullName: string) => {
  if (!fullName) return "—";
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || "—";
};

const getLastName = (fullName: string) => {
  if (!fullName) return "—";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return "—";
  return parts.slice(1).join(" ");
};

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
  const [formVorname, setFormVorname] = useState("");
  const [formNachname, setFormNachname] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formWarehouse, setFormWarehouse] = useState("");
  const [formHall, setFormHall] = useState("");
  const [formTelegram, setFormTelegram] = useState("");
  const [formEmploymentStart, setFormEmploymentStart] = useState("");
  const [formEmploymentEnd, setFormEmploymentEnd] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const openAddModal = () => {
    setFormName("");
    setFormVorname("");
    setFormNachname("");
    setFormPhone("");
    setFormEmail("");
    setFormUsername("");
    setFormPassword("");
    setFormWarehouse("");
    setFormHall("");
    setFormTelegram("");
    setFormRole("EMPLOYEE");
    setFormEmploymentStart(new Date().toISOString().split("T")[0]);
    setFormEmploymentEnd("");
    setFormError("");
    setAddModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setSelectedEmp(emp);
    setFormName(emp.name);
    setFormVorname(getFirstName(emp.name));
    setFormNachname(getLastName(emp.name) === "—" ? "" : getLastName(emp.name));
    setFormPhone(emp.phone);
    setFormEmail(emp.email || "");
    setFormUsername(emp.username);
    setFormPassword("");
    setFormWarehouse(emp.warehouseId || "");
    setFormHall(emp.hallId || "");
    setFormTelegram(emp.telegramId || "");
    setFormRole(emp.role);
    setFormEmploymentStart(emp.employmentStart ? emp.employmentStart.split("T")[0] : new Date().toISOString().split("T")[0]);
    setFormEmploymentEnd(emp.employmentEnd ? emp.employmentEnd.split("T")[0] : "");
    setFormError("");
    setEditModalOpen(true);
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");

    const submittedName = (formVorname || formNachname)
      ? `${formVorname} ${formNachname}`.trim()
      : formName;

    const token = localStorage.getItem("accessToken");
    try {
      if (isOffline) {
        const newEmp: Employee = {
          id: "emp-" + Date.now(),
          username: formUsername,
          name: submittedName,
          phone: formPhone,
          email: formEmail || null,
          role: "EMPLOYEE",
          isActive: true,
          telegramId: formTelegram || null,
          warehouseId: formWarehouse || null,
          hallId: formHall || null,
          employmentStart: new Date(formEmploymentStart).toISOString(),
          employmentEnd: formEmploymentEnd ? new Date(formEmploymentEnd).toISOString() : null,
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
          name: submittedName,
          phone: formPhone,
          email: formEmail || undefined,
          passwordHash: formPassword,
          role: "EMPLOYEE", // Enforced for standard worker creations
          warehouseId: formWarehouse || undefined,
          hallId: formHall || undefined,
          telegramId: formTelegram || undefined,
          employmentStart: new Date(formEmploymentStart).toISOString(),
          employmentEnd: formEmploymentEnd ? new Date(formEmploymentEnd).toISOString() : undefined,
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

    const submittedName = (formVorname || formNachname)
      ? `${formVorname} ${formNachname}`.trim()
      : formName;

    const token = localStorage.getItem("accessToken");
    try {
      if (isOffline) {
        setEmployees(prev => prev.map(emp => emp.id === selectedEmp.id ? {
          ...emp,
          username: formUsername,
          name: submittedName,
          phone: formPhone,
          email: formEmail || null,
          role: userRole === "MANAGER" ? formRole : emp.role,
          telegramId: formTelegram || null,
          warehouseId: formWarehouse || null,
          hallId: formHall || null,
          employmentStart: new Date(formEmploymentStart).toISOString(),
          employmentEnd: formEmploymentEnd ? new Date(formEmploymentEnd).toISOString() : null,
        } : emp));
        setEditModalOpen(false);
        return;
      }

      const body: any = {
        username: formUsername,
        name: submittedName,
        phone: formPhone,
        email: formEmail || null,
        warehouseId: formWarehouse || null,
        hallId: formHall || null,
        telegramId: formTelegram || null,
        employmentStart: new Date(formEmploymentStart).toISOString(),
        employmentEnd: formEmploymentEnd ? new Date(formEmploymentEnd).toISOString() : null,
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

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage) || 1;
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">
            {t("employeeManagement")} <span className="text-slate-400 font-medium ml-1">({filteredEmployees.length})</span>
          </h3>
          <p className="text-slate-500 text-xs mt-1">
            {t("staffSubtitle")}
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Download Template */}
            <button
              onClick={handleDownloadTemplate}
              title="Download Excel template"
              className="btn-secondary py-2 px-3 text-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" /> Template
            </button>

            {/* Upload Excel */}
            <label
              title="Import employees from Excel"
              className="btn-secondary py-2 px-3 text-xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" /> Import Excel
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
              className="btn-primary py-2 px-4 text-xs"
            >
              <Plus className="w-3.5 h-3.5 text-white" /> {t("addEmployee")}
            </button>
          </div>
        )}
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-100 p-5 rounded-xl shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, username or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-premium pl-9 py-2 text-xs"
          />
        </div>

        {canManage && selectedEmpIds.length > 0 && (
          <button
            onClick={handleBulkDeactivate}
            className="bg-red-650 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors self-start cursor-pointer shadow-sm"
          >
            <Trash2 className="w-4 h-4" /> {t("deactivateSelected")} ({selectedEmpIds.length})
          </button>
        )}
      </div>

      {/* Grid List */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
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
                      className="text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      {selectedEmpIds.length === filteredEmployees.length && filteredEmployees.length > 0 ? (
                        <CheckSquare className="w-4 h-4 inline" />
                      ) : (
                        <Square className="w-4 h-4 inline" />
                      )}
                    </button>
                  </th>
                )}
                <th className="px-4 py-3">{t("firstNameColumn")}</th>
                <th className="px-4 py-3">{t("lastNameColumn")}</th>
                <th className="px-4 py-3">{t("usernameLabel")}</th>
                <th className="px-4 py-3">{t("phone")}</th>
                <th className="px-4 py-3">{t("email")}</th>
                <th className="px-4 py-3">{language === "de" ? "Vertrag ab (from)" : "Contract From"}</th>
                <th className="px-4 py-3">{language === "de" ? "Vertrag bis (to)" : "Contract To"}</th>
                <th className="px-4 py-3">{t("telegramId")}</th>
                <th className="px-4 py-3">{t("actionsColumn")}</th>
                {canManage && <th className="px-4 py-3 text-right pr-6">Settings</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 11 : 9} className="p-8 text-center text-slate-400 italic">
                    {t("noStaffFound")}
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => (
                  <tr key={emp.id} className={`hover:bg-slate-50/30 transition-colors ${selectedEmpIds.includes(emp.id) ? "bg-blue-50/20" : ""}`}>
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
                          className="text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
                        >
                          {selectedEmpIds.includes(emp.id) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 inline" />
                          ) : (
                            <Square className="w-4 h-4 inline" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs relative overflow-hidden shrink-0 shadow-sm">
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
                          <span className="text-[10px] font-bold">
                            {emp.name.split(" ").map((n) => n[0]).join("")}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800 block leading-tight">{getFirstName(emp.name)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {getLastName(emp.name)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {emp.username}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {emp.phone}
                    </td>
                    <td className="px-4 py-3">
                      {emp.email ? (
                        <a
                          href={`mailto:${emp.email}`}
                          className="text-xs text-blue-600 hover:underline font-mono flex items-center gap-1 group"
                          title={emp.email}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0 text-slate-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="max-w-[160px] truncate">{emp.email}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">— no email</span>
                      )}
                    </td>
                    <td suppressHydrationWarning className="px-4 py-3 font-mono text-xs text-slate-500">
                      {emp.employmentStart ? new Date(emp.employmentStart).toLocaleDateString(language === "de" ? "de-DE" : "en-CA") : "—"}
                    </td>
                    <td suppressHydrationWarning className="px-4 py-3 font-mono text-xs text-slate-500">
                      {emp.employmentEnd ? new Date(emp.employmentEnd).toLocaleDateString(language === "de" ? "de-DE" : "en-CA") : (language === "de" ? "Unbefristet" : "Permanent")}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {emp.telegramId ? (
                        <span className="text-blue-600 flex items-center gap-1 font-bold">
                          <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> {emp.telegramId}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={getWhatsAppLink(emp.phone, emp.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="badge-premium badge-success hover:bg-emerald-100 font-bold transition-all cursor-pointer"
                        >
                          WhatsApp
                        </a>
                        <a
                          href={getSmsLink(emp.phone)}
                          className="badge-premium badge-info hover:bg-sky-100 font-bold transition-all cursor-pointer"
                        >
                          SMS
                        </a>
                        {canManage && emp.email && (
                          <button
                            onClick={() => openEmailModal(emp)}
                            title={`Send email to ${emp.email}`}
                            className="badge-premium badge-neutral hover:bg-slate-200 font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Mail className="w-3 h-3" /> Email
                          </button>
                        )}
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right pr-6">
                        <div className="inline-flex gap-1.5">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeactivate(emp.id, emp.name)}
                            className="p-1.5 text-slate-400 hover:text-red-650 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Pagination Pager */}
      <div className="flex items-center justify-between bg-white border border-slate-100 px-6 py-4 rounded-xl shadow-sm">
        <div className="text-slate-500 text-xs font-semibold">
          {language === "de"
            ? `Zeige ${filteredEmployees.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} bis ${Math.min(filteredEmployees.length, currentPage * itemsPerPage)} von ${filteredEmployees.length} Mitarbeitern`
            : `Showing ${filteredEmployees.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to ${Math.min(filteredEmployees.length, currentPage * itemsPerPage)} of ${filteredEmployees.length} employees`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="btn-secondary py-1 px-3 text-xs disabled:opacity-50 cursor-pointer"
          >
            {language === "de" ? "Zurück" : "Previous"}
          </button>
          <span className="text-xs font-semibold text-slate-800 px-2">
            {language === "de" ? `Seite ${currentPage} von ${totalPages}` : `Page ${currentPage} of ${totalPages}`}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="btn-secondary py-1 px-3 text-xs disabled:opacity-50 cursor-pointer"
          >
            {language === "de" ? "Weiter" : "Next"}
          </button>
        </div>
      </div>

      {/* ── Excel Import Result Modal ── */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border border-slate-100 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <FileSpreadsheet className="w-4.5 h-4.5 text-blue-500" />
                Excel Import
              </h4>
              {!importLoading && (
                <button onClick={() => setImportModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-4">
              {/* Loading */}
              {importLoading && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                  <p className="text-slate-600 text-xs">Processing Excel file...</p>
                </div>
              )}

              {/* Error */}
              {!importLoading && importError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-red-800 text-xs">{importError}</p>
                </div>
              )}

              {/* Success Result */}
              {!importLoading && importResult && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                      <p className="text-xl font-bold text-slate-800 font-mono">{importResult.summary?.totalProcessed ?? 0}</p>
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mt-1">Processed</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-100">
                      <p className="text-xl font-bold text-emerald-700 font-mono">{importResult.summary?.createdCount ?? 0}</p>
                      <p className="text-[9px] text-emerald-550 uppercase tracking-wider font-semibold mt-1">Created</p>
                    </div>
                    <div className="bg-rose-50 rounded-lg p-3 text-center border border-rose-100">
                      <p className="text-xl font-bold text-rose-700 font-mono">{importResult.summary?.failedCount ?? 0}</p>
                      <p className="text-[9px] text-rose-550 uppercase tracking-wider font-semibold mt-1">Skipped</p>
                    </div>
                  </div>

                  {importResult.summary?.createdCount > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <p className="text-emerald-800 text-xs">{importResult.message}</p>
                    </div>
                  )}

                  {/* Errors list */}
                  {importResult.summary?.errors?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Skipped Rows</p>
                      <div className="max-h-40 overflow-y-auto space-y-1.5">
                        {importResult.summary.errors.map((err: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                            <span className="text-slate-400 shrink-0">Row {err.row}:</span>
                            <span className="text-slate-700 font-semibold">{err.name || err.phone || "—"}</span>
                            <span className="text-rose-600 ml-auto text-right font-medium">{err.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!importLoading && (
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setImportModalOpen(false)}
                  className="btn-secondary py-1.5 px-4 cursor-pointer text-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border border-slate-100 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-bold text-sm text-slate-800">{t("addEmployee")}</h4>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("firstNameColumn")}</label>
                  <input
                    type="text"
                    required
                    value={formVorname}
                    onChange={(e) => setFormVorname(e.target.value)}
                    placeholder="e.g. Emil"
                    className="input-premium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("lastNameColumn")}</label>
                  <input
                    type="text"
                    value={formNachname}
                    onChange={(e) => setFormNachname(e.target.value)}
                    placeholder="e.g. Employee"
                    className="input-premium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("phone")}</label>
                  <input
                    type="text"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+491701234567"
                    className="input-premium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("usernameLabel")}</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="e.g. emilemployee"
                    className="input-premium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("passwordLabel")}</label>
                  <input
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Password"
                    className="input-premium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("email")}</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. e.employee@logiflow.de"
                    className="input-premium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{language === "de" ? "Vertrag ab (from)" : "Contract From"}</label>
                  <input
                    type="date"
                    required
                    value={formEmploymentStart}
                    onChange={(e) => setFormEmploymentStart(e.target.value)}
                    className="input-premium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{language === "de" ? "Vertrag bis (to)" : "Contract To"}</label>
                  <input
                    type="date"
                    value={formEmploymentEnd}
                    onChange={(e) => setFormEmploymentEnd(e.target.value)}
                    className="input-premium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Warehouse Assignment</label>
                  <select
                    value={formWarehouse}
                    onChange={(e) => {
                      setFormWarehouse(e.target.value);
                      setFormHall("");
                    }}
                    className="input-premium"
                  >
                    <option value="">None</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Hall Assignment</label>
                  <select
                    value={formHall}
                    onChange={(e) => setFormHall(e.target.value)}
                    disabled={!formWarehouse}
                    className="input-premium"
                  >
                    <option value="">None</option>
                    {halls.filter(h => h.warehouseId === formWarehouse).map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("telegramId")}</label>
                <input
                  type="text"
                  value={formTelegram}
                  onChange={(e) => setFormTelegram(e.target.value)}
                  placeholder="e.g. @username"
                  className="input-premium"
                />
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 -mx-6 -mb-6">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="btn-secondary py-1.5 px-4 cursor-pointer text-xs"
                >
                  {t("close")}
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="btn-primary py-1.5 px-4 cursor-pointer text-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border border-slate-100 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-bold text-sm text-slate-800">{t("editEmployee")}</h4>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditEmployee} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("firstNameColumn")}</label>
                  <input
                    type="text"
                    required
                    value={formVorname}
                    onChange={(e) => setFormVorname(e.target.value)}
                    className="input-premium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("lastNameColumn")}</label>
                  <input
                    type="text"
                    value={formNachname}
                    onChange={(e) => setFormNachname(e.target.value)}
                    className="input-premium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("usernameLabel")}</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="input-premium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("passwordLabel")} (Leave blank to keep current)</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-premium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("phone")}</label>
                  <input
                    type="text"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="input-premium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("email")}</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="input-premium"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{language === "de" ? "Vertrag ab (from)" : "Contract From"}</label>
                  <input
                    type="date"
                    required
                    value={formEmploymentStart}
                    onChange={(e) => setFormEmploymentStart(e.target.value)}
                    className="input-premium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{language === "de" ? "Vertrag bis (to)" : "Contract To"}</label>
                  <input
                    type="date"
                    value={formEmploymentEnd}
                    onChange={(e) => setFormEmploymentEnd(e.target.value)}
                    className="input-premium"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">{t("telegramId")}</label>
                  <input
                    type="text"
                    value={formTelegram}
                    onChange={(e) => setFormTelegram(e.target.value)}
                    placeholder="e.g. @username"
                    className="input-premium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Warehouse Assignment</label>
                  <select
                    value={formWarehouse}
                    onChange={(e) => {
                      setFormWarehouse(e.target.value);
                      setFormHall("");
                    }}
                    className="input-premium"
                  >
                    <option value="">None</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Hall Assignment</label>
                  <select
                    value={formHall}
                    onChange={(e) => setFormHall(e.target.value)}
                    disabled={!formWarehouse}
                    className="input-premium"
                  >
                    <option value="">None</option>
                    {halls.filter(h => h.warehouseId === formWarehouse).map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {userRole === "MANAGER" && (
                <div className="space-y-1.5 text-xs">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Role</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="input-premium"
                  >
                    <option value="EMPLOYEE">EMPLOYEE</option>
                    <option value="ADMIN">ADMIN (Promote to Admin)</option>
                    <option value="MANAGER">MANAGER (Promote to Manager)</option>
                  </select>
                </div>
              )}

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 -mx-6 -mb-6">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="btn-secondary py-1.5 px-4 cursor-pointer text-xs"
                >
                  {t("close")}
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="btn-primary py-1.5 px-4 cursor-pointer text-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border border-slate-100 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600" />
                  Send Email
                </h4>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  To: <span className="text-blue-600 font-mono">{emailTargetEmp.email}</span>
                  {" — "}{emailTargetEmp.name}
                </p>
              </div>
              <button
                onClick={() => setEmailModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="p-6 space-y-4">
              {/* Error */}
              {emailError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{emailError}</span>
                </div>
              )}

              {/* Success */}
              {emailSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg flex items-start gap-2 text-xs">
                  <Send className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{emailSuccess}</span>
                </div>
              )}

              {/* Subject */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="e.g. Shift Schedule Update"
                  maxLength={200}
                  className="input-premium"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5 text-xs">
                <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Type your message here..."
                  rows={6}
                  maxLength={5000}
                  className="input-premium resize-y min-h-[120px]"
                />
                <p className="text-[9px] text-slate-400 text-right mt-1 font-semibold">{emailMessage.length}/5000</p>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 -mx-6 -mb-6">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  disabled={emailLoading}
                  className="btn-secondary py-1.5 px-4 cursor-pointer text-xs"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="btn-primary py-1.5 px-4 cursor-pointer text-xs flex items-center gap-2"
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
