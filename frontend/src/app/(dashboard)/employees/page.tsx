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
  MapPin,
  Eye,
  EyeOff,
  ShieldAlert,
} from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import CustomAlertModal, { CustomAlertOptions } from "../../components/CustomAlertModal";
import WhatsAppModal from "../../components/WhatsAppModal";
import WorkHoursVisibilityToggle from "../../components/WorkHoursVisibilityToggle";

interface Employee {
  id: string;
  username: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  treffpunkt?: string | null;
  treffpunktTime?: string | null;
  role: string;
  isActive: boolean;
  telegramId: string | null;
  warehouseId?: string | null;
  hallId?: string | null;
  employmentStart?: string;
  employmentEnd?: string | null;
  hideWorkHours?: boolean;
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

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [halls, setHalls] = useState<any[]>([]);

  // Alert Modal State
  const [alertConfig, setAlertConfig] = useState<CustomAlertOptions>({
    isOpen: false,
    message: "",
  });

  const showAlert = (options: Omit<CustomAlertOptions, "isOpen">) => {
    setAlertConfig({ ...options, isOpen: true });
  };

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
  const [formTreffpunkt, setFormTreffpunkt] = useState("");
  const [formTreffpunktTime, setFormTreffpunktTime] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formWarehouse, setFormWarehouse] = useState("");
  const [formHall, setFormHall] = useState("");
  const [formTelegram, setFormTelegram] = useState("");
  const [formEmploymentStart, setFormEmploymentStart] = useState("");
  const [formEmploymentEnd, setFormEmploymentEnd] = useState("");
  const [formHideWorkHours, setFormHideWorkHours] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [formRole, setFormRole] = useState("EMPLOYEE");

  // Global Work Hours Visibility State
  const [isGlobalWorkHoursHidden, setIsGlobalWorkHoursHidden] = useState(false);
  const [toggleWorkHoursLoading, setToggleWorkHoursLoading] = useState(false);

  const fetchWorkHoursVisibility = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/settings/work-hours-visibility`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setIsGlobalWorkHoursHidden(Boolean(data.isGlobalHidden));
      }
    } catch (e) {
      console.warn("Could not load work hours visibility", e);
    }
  };

  const handleToggleGlobalWorkHoursVisibility = async (newVal: boolean) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    setToggleWorkHoursLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/settings/work-hours-visibility`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ hideWorkHours: newVal }),
        }
      );
      if (res.ok) {
        setIsGlobalWorkHoursHidden(newVal);
        showAlert({
          title: t("success"),
          message: newVal ? t("workHoursHiddenAlertMsg") : t("workHoursVisibleAlertMsg"),
          type: "success",
        });
      } else {
        showAlert({
          title: t("errorOccurred"),
          message: "Fehler beim Ändern der Sichtbarkeit",
          type: "error",
        });
      }
    } catch (e) {
      console.error(e);
      showAlert({
        title: t("errorOccurred"),
        message: "Verbindungsfehler beim Ändern der Sichtbarkeit",
        type: "error",
      });
    } finally {
      setToggleWorkHoursLoading(false);
    }
  };

  // Sorting & Range Filtering
  const [sortBy, setSortBy] = useState<"name" | "contractPeriod">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [fromMonthYear, setFromMonthYear] = useState<string>("");
  const [toMonthYear, setToMonthYear] = useState<string>("");
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

  // WhatsApp Modal State
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [whatsAppTargetEmp, setWhatsAppTargetEmp] = useState<Employee | null>(null);

  // Excel Import State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importStage, setImportStage] = useState<"PREVIEW" | "EXECUTING" | "DONE">("PREVIEW");
  const [previewData, setPreviewData] = useState<any>(null);
  const [executeLoading, setExecuteLoading] = useState(false);

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
    } catch (err) {
      console.error("Failed to load employees:", err);
      setEmployees([]);
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
    fetchWorkHoursVisibility();
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
    setFormTreffpunkt("");
    setFormTreffpunktTime("");
    setFormUsername("");
    setFormPassword("");
    setFormWarehouse("");
    setFormHall("");
    setFormTelegram("");
    setFormRole("EMPLOYEE");
    setFormEmploymentStart(new Date().toISOString().split("T")[0]);
    setFormEmploymentEnd("");
    setFormHideWorkHours(false);
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
    setFormTreffpunkt(emp.treffpunkt || emp.address || "");
    setFormTreffpunktTime(emp.treffpunktTime || "");
    setFormUsername(emp.username);
    setFormPassword("");
    setFormWarehouse(emp.warehouseId || "");
    setFormHall(emp.hallId || "");
    setFormTelegram(emp.telegramId || "");
    setFormRole(emp.role);
    setFormEmploymentStart(emp.employmentStart ? emp.employmentStart.split("T")[0] : new Date().toISOString().split("T")[0]);
    setFormEmploymentEnd(emp.employmentEnd ? emp.employmentEnd.split("T")[0] : "");
    setFormHideWorkHours(Boolean(emp.hideWorkHours));
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
          treffpunkt: formTreffpunkt || undefined,
          treffpunktTime: formTreffpunktTime || undefined,
          address: formTreffpunkt || undefined,
          passwordHash: formPassword,
          role: "EMPLOYEE", // Enforced for standard worker creations
          warehouseId: formWarehouse || undefined,
          hallId: formHall || undefined,
          telegramId: formTelegram || undefined,
          employmentStart: new Date(formEmploymentStart).toISOString(),
          employmentEnd: formEmploymentEnd ? new Date(formEmploymentEnd).toISOString() : undefined,
          hideWorkHours: formHideWorkHours,
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
      const body: any = {
        username: formUsername,
        name: submittedName,
        phone: formPhone,
        email: formEmail || null,
        treffpunkt: formTreffpunkt || null,
        treffpunktTime: formTreffpunktTime || null,
        address: formTreffpunkt || null,
        warehouseId: formWarehouse || null,
        hallId: formHall || null,
        telegramId: formTelegram || null,
        employmentStart: new Date(formEmploymentStart).toISOString(),
        employmentEnd: formEmploymentEnd ? new Date(formEmploymentEnd).toISOString() : null,
        hideWorkHours: formHideWorkHours,
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

  const handleDeactivate = (id: string, name: string) => {
    showAlert({
      title: language === "de" ? "Mitarbeiter löschen" : "Delete Employee",
      message: language === "de" ? `Sind Sie sicher, dass Sie den Mitarbeiter ${name} löschen möchten?` : `Are you sure you want to delete employee ${name}?`,
      type: "warning",
      confirmText: language === "de" ? "Löschen" : "Delete",
      cancelText: language === "de" ? "Abbrechen" : "Cancel",
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            loadEmployees();
            showAlert({ title: "Erfolg", message: language === "de" ? "Mitarbeiter wurde gelöscht" : "Employee deleted successfully", type: "success" });
          } else {
            showAlert({ title: "Fehler", message: language === "de" ? "Mitarbeiter konnte nicht gelöscht werden" : "Failed to delete employee", type: "error" });
          }
        } catch (e) {
          console.error(e);
          showAlert({ title: "Fehler", message: "Error occurred", type: "error" });
        }
      },
    });
  };

  const handleQuickToggleIndividualVisibility = async (emp: Employee) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    const newVal = !emp.hideWorkHours;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${emp.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hideWorkHours: newVal }),
      });
      if (res.ok) {
        setEmployees((prev) =>
          prev.map((e) => (e.id === emp.id ? { ...e, hideWorkHours: newVal } : e))
        );
        showAlert({
          title: t("success"),
          message: newVal
            ? `Arbeitszeiten für ${emp.name} wurden ausgeblendet.`
            : `Arbeitszeiten für ${emp.name} sind nun sichtbar.`,
          type: "success",
        });
      } else {
        const err = await res.json().catch(() => ({}));
        showAlert({
          title: t("errorOccurred"),
          message: err.message || "Fehler beim Aktualisieren der Sichtbarkeit.",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Quick toggle error", err);
    }
  };

  const handleBulkDeactivate = () => {
    if (selectedEmpIds.length === 0) return;
    showAlert({
      title: language === "de" ? "Mitarbeiter löschen" : "Delete Employees",
      message: language === "de" ? `Sind Sie sicher, dass Sie die ${selectedEmpIds.length} ausgewählten Mitarbeiter löschen möchten?` : `Are you sure you want to delete the ${selectedEmpIds.length} selected employee(s)?`,
      type: "warning",
      confirmText: language === "de" ? "Löschen" : "Delete",
      cancelText: language === "de" ? "Abbrechen" : "Cancel",
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/bulk-deactivate`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ ids: selectedEmpIds }),
          });

          if (res.ok) {
            setSelectedEmpIds([]);
            loadEmployees();
            showAlert({ title: "Erfolg", message: language === "de" ? "Ausgewählte Mitarbeiter wurden gelöscht" : "Selected employees deleted", type: "success" });
          } else {
            showAlert({ title: "Fehler", message: language === "de" ? "Mitarbeiter konnten nicht gelöscht werden" : "Failed to delete employees", type: "error" });
          }
        } catch (e) {
          console.error(e);
          showAlert({ title: "Fehler", message: "Error occurred", type: "error" });
        }
      },
    });
  };

  const handleBulkActivate = () => {
    if (selectedEmpIds.length === 0) return;
    showAlert({
      title: language === "de" ? "Mitarbeiter aktivieren" : "Activate Employees",
      message: language === "de" ? `Ausgewählte ${selectedEmpIds.length} Mitarbeiter aktivieren?` : `Activate the ${selectedEmpIds.length} selected employee(s)?`,
      type: "info",
      confirmText: language === "de" ? "Aktivieren" : "Activate",
      cancelText: language === "de" ? "Abbrechen" : "Cancel",
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/bulk-activate`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ ids: selectedEmpIds }),
          });

          if (res.ok) {
            setSelectedEmpIds([]);
            loadEmployees();
            showAlert({ title: "Erfolg", message: language === "de" ? "Mitarbeiter aktiviert" : "Employees activated", type: "success" });
          } else {
            showAlert({ title: "Fehler", message: language === "de" ? "Aktivierung fehlgeschlagen" : "Failed to activate employees", type: "error" });
          }
        } catch (e) {
          console.error(e);
          showAlert({ title: "Fehler", message: "Error occurred", type: "error" });
        }
      },
    });
  };

  const handleBulkAssignHall = async (hallId: string) => {
    if (selectedEmpIds.length === 0 || !hallId) return;

    const token = localStorage.getItem("accessToken");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/bulk-assign-hall`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selectedEmpIds, hallId }),
      });

      if (res.ok) {
        setSelectedEmpIds([]);
        loadEmployees();
      } else {
        showAlert({ title: "Fehler", message: "Failed to assign hall", type: "error" });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkAssignRole = async (role: string) => {
    if (selectedEmpIds.length === 0 || !role) return;

    const token = localStorage.getItem("accessToken");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/bulk-assign-role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selectedEmpIds, role }),
      });

      if (res.ok) {
        setSelectedEmpIds([]);
        loadEmployees();
      } else {
        showAlert({ title: "Fehler", message: "Failed to assign role", type: "error" });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportSelected = () => {
    const selectedEmployees = employees.filter((e) => selectedEmpIds.includes(e.id));
    if (selectedEmployees.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Name,Username,Phone,Email,Role,IsActive\n";
    selectedEmployees.forEach((emp) => {
      csvContent += `"${emp.id}","${emp.name}","${emp.username}","${emp.phone}","${emp.email || ""}","${emp.role}","${emp.isActive}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `employees_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintSelected = () => {
    const selectedEmployees = employees.filter((e) => selectedEmpIds.includes(e.id));
    if (selectedEmployees.length === 0) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Mitarbeiterliste Drucken</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h2>Ausgewählte Mitarbeiter (${selectedEmployees.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Benutzername</th>
                <th>Telefonnummer</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${selectedEmployees.map(emp => `
                <tr>
                  <td>${emp.name}</td>
                  <td>${emp.username}</td>
                  <td>${emp.phone}</td>
                  <td>${emp.email || "—"}</td>
                  <td>${emp.role}</td>
                  <td>${emp.isActive ? "Aktiv" : "Inaktiv"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  /**
   * Bug#6 FIX: Phone normalisation is now a single shared utility (mirrors
   * backend MessagingService.formatPhoneNumber) to avoid duplicated logic.
   */
  const formatPhoneForWhatsApp = (phone: string): string => {
    const trimmed = (phone || "").trim();
    let digits = trimmed.replace(/\D/g, "");
    if (trimmed.startsWith("+")) return digits;
    if (digits.startsWith("00")) return digits.substring(2);
    if (digits.startsWith("0")) return "49" + digits.substring(1);
    if (!digits.startsWith("49") && digits.length <= 11) return "49" + digits;
    return digits;
  };

  const getWhatsAppLink = (phone: string, name: string) => {
    const cleaned = formatPhoneForWhatsApp(phone);
    const text = encodeURIComponent(`Hallo ${name}, dies ist eine Nachricht von LogiFlow Warehouse Management.`);
    return `https://wa.me/${cleaned}?text=${text}`;
  };

  const getSmsLink = (phone: string) => {
    return `sms:${phone}`;
  };

  const openWhatsAppModal = (emp: Employee) => {
    setWhatsAppTargetEmp(emp);
    setWhatsAppModalOpen(true);
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

  const filteredEmployees = employees
    .filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.phone.includes(searchTerm) ||
        emp.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.treffpunkt && emp.treffpunkt.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.address && emp.address.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // Month & Year date range filtering
      if (fromMonthYear) {
        const [y, m] = fromMonthYear.split("-").map(Number);
        const fromDate = new Date(y, m - 1, 1).getTime();
        const empEnd = emp.employmentEnd ? new Date(emp.employmentEnd).getTime() : Number.MAX_SAFE_INTEGER;
        if (empEnd < fromDate) return false;
      }

      if (toMonthYear) {
        const [y, m] = toMonthYear.split("-").map(Number);
        const toDate = new Date(y, m, 0, 23, 59, 59, 999).getTime();
        const empStart = emp.employmentStart ? new Date(emp.employmentStart).getTime() : 0;
        if (empStart > toDate) return false;
      }

      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = a.name.localeCompare(b.name, "de", { sensitivity: "base" });
      } else if (sortBy === "contractPeriod") {
        const aStart = a.employmentStart ? new Date(a.employmentStart).getTime() : 0;
        const bStart = b.employmentStart ? new Date(b.employmentStart).getTime() : 0;
        cmp = aStart - bStart;
        if (cmp === 0) {
          const aEnd = a.employmentEnd ? new Date(a.employmentEnd).getTime() : Number.MAX_SAFE_INTEGER;
          const bEnd = b.employmentEnd ? new Date(b.employmentEnd).getTime() : Number.MAX_SAFE_INTEGER;
          cmp = aEnd - bEnd;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const itemsPerPage = 50;
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
      showAlert({ title: "Fehler", message: "Vorlage konnte nicht heruntergeladen werden. Stellen Sie sicher, dass Sie eingeloggt sind.", type: "error" });
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setSelectedFile(file);
    setImportStage("PREVIEW");
    setImportLoading(true);
    setImportError("");
    setImportResult(null);
    setPreviewData(null);
    setImportModalOpen(true);

    const token = localStorage.getItem("accessToken");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/import-excel/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setPreviewData(data);
      } else {
        setImportError(Array.isArray(data.message) ? data.message.join(", ") : data.message || "Failed to analyze Excel file");
      }
    } catch (err: any) {
      setImportError(err.message || "Network error");
    } finally {
      setImportLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!selectedFile) return;

    setExecuteLoading(true);
    setImportStage("EXECUTING");
    setImportError("");

    const token = localStorage.getItem("accessToken");
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/import-excel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        setImportStage("DONE");
        if (data.summary?.createdCount > 0) loadEmployees();
      } else {
        setImportError(Array.isArray(data.message) ? data.message.join(", ") : data.message || "Import execution failed");
        setImportStage("PREVIEW");
      }
    } catch (err: any) {
      setImportError(err.message || "Network error during import execution");
      setImportStage("PREVIEW");
    } finally {
      setExecuteLoading(false);
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
            {/* Global Work Hours & Timesheets Visibility Control */}
            <WorkHoursVisibilityToggle onVisibilityChange={(val) => setIsGlobalWorkHoursHidden(val)} />

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

      {/* Global Visibility Notice Banner */}
      {isGlobalWorkHoursHidden && (
        <div className="flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-900 text-xs shadow-xs animate-fadeIn">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <EyeOff className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-extrabold block text-slate-900">{t("globalVisibilityBanner")}</span>
            <span className="text-amber-850 text-[11px] leading-tight block mt-0.5">
              {language === "de"
                ? "Alle Mitarbeiter sehen aktuell keine Stundenstatistiken, Zeiterfassungen oder Stundenzettel. Sobald die globale Sperre oben deaktiviert wird, gelten wieder die individuellen Einstellungen."
                : "All employees currently cannot view work hours or timesheets. Once global hiding is toggled off above, individual employee settings will apply."}
            </span>
          </div>
        </div>
      )}

      {/* Search & Actions Bar */}
      <div className="space-y-4">
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

          {/* Sort Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-semibold">{language === "de" ? "Sortieren:" : "Sort:"}</span>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as any); setCurrentPage(1); }}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white outline-none hover:border-slate-400 cursor-pointer"
            >
              <option value="name">{language === "de" ? "Name (A–Z)" : "Name (A–Z)"}</option>
              <option value="contractPeriod">{language === "de" ? "Vertragszeitraum (Monat & Jahr)" : "Contract Period (Month & Year)"}</option>
            </select>

            {sortBy === "contractPeriod" && (
              <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200 rounded-lg p-1 px-2 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-slate-500 font-medium text-[11px]">{language === "de" ? "Von:" : "From:"}</span>
                  <input
                    type="month"
                    value={fromMonthYear}
                    onChange={(e) => { setFromMonthYear(e.target.value); setCurrentPage(1); }}
                    className="border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-700 bg-white outline-none focus:border-blue-500 cursor-pointer"
                    placeholder="YYYY-MM"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500 font-medium text-[11px]">{language === "de" ? "Bis:" : "To:"}</span>
                  <input
                    type="month"
                    value={toMonthYear}
                    onChange={(e) => { setToMonthYear(e.target.value); setCurrentPage(1); }}
                    className="border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-700 bg-white outline-none focus:border-blue-500 cursor-pointer"
                    placeholder="YYYY-MM"
                  />
                </div>
                {(fromMonthYear || toMonthYear) && (
                  <button
                    onClick={() => { setFromMonthYear(""); setToMonthYear(""); setCurrentPage(1); }}
                    className="text-slate-400 hover:text-red-600 transition-colors p-0.5"
                    title={language === "de" ? "Zeitraum zurücksetzen" : "Reset date range"}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
              className="flex items-center gap-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-400 cursor-pointer transition-all"
            >
              {sortDir === "asc" ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                </svg>
              )}
              {sortDir === "asc" ? (language === "de" ? "Aufst." : "Asc") : (language === "de" ? "Abst." : "Desc")}
            </button>
          </div>
        </div>

        {canManage && selectedEmpIds.length > 0 && (
          <div className="bg-blue-50/50 border border-blue-150 p-4 rounded-xl shadow-sm flex flex-wrap items-center gap-3 animate-fadeIn text-xs">
            <div className="font-bold text-blue-800 mr-2 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>{selectedEmpIds.length} Mitarbeiter ausgewählt:</span>
            </div>

            {/* Bulk Deactivate */}
            <button
              onClick={handleBulkDeactivate}
              className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
              title="Mitarbeiter löschen"
            >
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </button>

            {/* Bulk Activate */}
            <button
              onClick={handleBulkActivate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
              title="Mitarbeiter aktivieren"
            >
              <UserCheck className="w-3.5 h-3.5" /> Aktivieren
            </button>

            {/* Bulk Assign Hall Select */}
            <div className="relative">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkAssignHall(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold text-slate-700 outline-none hover:border-slate-350 cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>Halle zuweisen...</option>
                {halls.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            {/* Bulk Assign Role Select */}
            <div className="relative">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkAssignRole(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold text-slate-700 outline-none hover:border-slate-350 cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>Rolle zuweisen...</option>
                <option value="EMPLOYEE">Mitarbeiter</option>
                <option value="TEAM_LEADER">Vorarbeiter</option>
                <option value="ADMIN">Administrator</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>

            {/* Export Selected */}
            <button
              onClick={handleExportSelected}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Exportieren (CSV)
            </button>
          </div>
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
                <th className="px-4 py-3">{language === "de" ? "Vorname" : "First Name"}</th>
                <th className="px-4 py-3">{language === "de" ? "Nachname" : "Last Name"}</th>
                <th className="px-4 py-3">{t("usernameLabel")}</th>
                <th className="px-4 py-3">{t("phone")}</th>
                <th className="px-4 py-3">{t("email")}</th>
                <th className="px-4 py-3">{language === "de" ? "Treffpunkt" : "Treffpunkt / Transport"}</th>
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{getLastName(emp.name)}</span>
                        {isGlobalWorkHoursHidden ? (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full"
                            title={t("globalVisibilityBanner")}
                          >
                            <EyeOff size={10} className="text-amber-600" />
                            <span>{t("globallyHidden")}</span>
                          </span>
                        ) : emp.hideWorkHours ? (
                          <button
                            type="button"
                            onClick={() => handleQuickToggleIndividualVisibility(emp)}
                            className="inline-flex items-center gap-1 text-[9px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-full transition-colors cursor-pointer"
                            title={t("quickToggleVisibility")}
                          >
                            <EyeOff size={10} className="text-amber-700" />
                            <span>{t("individuallyHidden")}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleQuickToggleIndividualVisibility(emp)}
                            className="opacity-0 group-hover:opacity-100 hover:opacity-100 inline-flex items-center gap-1 text-[9px] font-medium text-slate-400 hover:text-amber-700 px-1 py-0.5 rounded transition-all cursor-pointer"
                            title="Klicken zum Ausblenden der Stunden für diesen Mitarbeiter"
                          >
                            <EyeOff size={10} />
                            <span className="hidden sm:inline">Stunden verbergen</span>
                          </button>
                        )}
                      </div>
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
                    <td className="px-4 py-3 text-xs font-medium text-slate-700 max-w-[200px]" title={emp.address || emp.treffpunkt || ''}>
                      {emp.address || emp.treffpunkt ? (
                        <span className="flex items-center gap-1 text-slate-800 font-medium leading-tight">
                          <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">{emp.address || emp.treffpunkt}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">—</span>
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
                        {/* Bug#8 FIX: Only render links when employee has a phone number */}
                        {emp.phone ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openWhatsAppModal(emp)}
                              className="badge-premium badge-success hover:bg-emerald-100 font-bold transition-all cursor-pointer flex items-center gap-1"
                              title="WhatsApp Nachricht oder Button-Nachricht senden"
                            >
                              <span>WhatsApp</span>
                            </button>
                            <a
                              href={getSmsLink(emp.phone)}
                              className="badge-premium badge-info hover:bg-sky-100 font-bold transition-all cursor-pointer"
                            >
                              SMS
                            </a>
                          </>
                        ) : (
                          <span className="text-slate-400 italic text-xs">No phone</span>
                        )}
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

      {/* ── Excel Import Result & Preview Modal ── */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  Mitarbeiter Excel Import Verification
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedFile ? selectedFile.name : "Import file analysis and row-by-row validation report"}
                </p>
              </div>
              {!importLoading && !executeLoading && (
                <button
                  onClick={() => setImportModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Analyzing / Executing Progress */}
              {(importLoading || executeLoading) && (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
                  <p className="text-slate-700 font-semibold text-sm">
                    {executeLoading ? "Importing valid employees into database..." : "Analyzing and validating Excel rows..."}
                  </p>
                  <p className="text-slate-400 text-xs font-mono">Fault-tolerant row-by-row resolution active</p>
                </div>
              )}

              {/* Error Banner */}
              {!importLoading && !executeLoading && importError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-red-900 text-xs">Import Analysis Failed</h5>
                    <p className="text-red-800 text-xs mt-0.5">{importError}</p>
                  </div>
                </div>
              )}

              {/* Stage 1: PREVIEW MODE */}
              {!importLoading && !executeLoading && importStage === "PREVIEW" && previewData && (
                <div className="space-y-5">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                      <span className="text-2xl font-black text-slate-800 font-mono">{previewData.summary?.totalRows ?? 0}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mt-1">Total Rows</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                      <span className="text-2xl font-black text-emerald-700 font-mono">{previewData.summary?.readyCount ?? 0}</span>
                      <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block mt-1">🟢 Ready</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                      <span className="text-2xl font-black text-amber-700 font-mono">{previewData.summary?.warningCount ?? 0}</span>
                      <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block mt-1">🟡 Warnings</span>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                      <span className="text-2xl font-black text-rose-700 font-mono">{previewData.summary?.errorCount ?? 0}</span>
                      <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider block mt-1">🔴 Errors (Skipped)</span>
                    </div>
                  </div>

                  {/* Info Banner */}
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between text-xs text-blue-900 font-medium">
                    <span>
                      Fault-tolerant import ready: <strong>{previewData.summary?.validCount ?? 0} valid rows</strong> will be imported into the database. Invalid rows will be safely skipped.
                    </span>
                  </div>

                  {/* Rows Validation Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 w-12 text-center">Row</th>
                          <th className="p-2.5">Mitarbeiter Name</th>
                          <th className="p-2.5">Benutzername</th>
                          <th className="p-2.5">Rolle</th>
                          <th className="p-2.5">Lager / Halle</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Diagnose & Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewData.rows?.map((row: any) => {
                          let badgeBg = "bg-emerald-100 text-emerald-800 border-emerald-200";
                          let statusIcon = "🟢 Ready";
                          if (row.status === "WARNING") {
                            badgeBg = "bg-amber-100 text-amber-800 border-amber-200";
                            statusIcon = "🟡 Warning";
                          } else if (row.status === "ERROR") {
                            badgeBg = "bg-rose-100 text-rose-800 border-rose-200";
                            statusIcon = "🔴 Error";
                          }

                          return (
                            <tr key={row.row} className={row.status === "ERROR" ? "bg-rose-50/40" : "hover:bg-slate-50/80"}>
                              <td className="p-2.5 font-mono text-center font-bold text-slate-500">{row.row}</td>
                              <td className="p-2.5 font-bold text-slate-800">{row.name}</td>
                              <td className="p-2.5 font-mono text-slate-600">{row.username || "—"}</td>
                              <td className="p-2.5">
                                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-100 text-slate-700">
                                  {row.role}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-600">
                                {row.warehouse || "—"} {row.hall ? `/ ${row.hall}` : ""}
                              </td>
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wider inline-block ${badgeBg}`}>
                                  {statusIcon}
                                </span>
                              </td>
                              <td className="p-2.5">
                                {row.issues && row.issues.length > 0 ? (
                                  <div className="space-y-1">
                                    {row.issues.map((iss: any, idx: number) => (
                                      <div
                                        key={idx}
                                        className={`text-[11px] p-1.5 rounded border ${
                                          iss.type === "error"
                                            ? "bg-rose-50 text-rose-800 border-rose-200"
                                            : "bg-amber-50 text-amber-800 border-amber-200"
                                        }`}
                                      >
                                        <span className="font-bold uppercase tracking-wider text-[9px] mr-1">[{iss.column}]:</span>
                                        <span>{iss.reason}</span>
                                        {iss.suggestedFix && (
                                          <span className="block text-[10px] font-medium opacity-90 mt-0.5">
                                            💡 {iss.suggestedFix}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">Valid</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Stage 2: DONE EXECUTION SUMMARY */}
              {!importLoading && !executeLoading && importStage === "DONE" && importResult && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                    <div>
                      <h5 className="font-bold text-emerald-950 text-sm">Import Successfully Executed</h5>
                      <p className="text-emerald-800 text-xs mt-0.5">{importResult.message}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                      <span className="text-2xl font-black text-slate-800 font-mono">{importResult.summary?.totalProcessed ?? 0}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mt-1">Total Processed</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                      <span className="text-2xl font-black text-emerald-700 font-mono">{importResult.summary?.createdCount ?? 0}</span>
                      <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block mt-1">Imported</span>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                      <span className="text-2xl font-black text-rose-700 font-mono">{importResult.summary?.skippedCount ?? 0}</span>
                      <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider block mt-1">Skipped (Errors)</span>
                    </div>
                  </div>

                  {/* Errors / Skipped List */}
                  {importResult.summary?.errors?.length > 0 && (
                    <div className="space-y-2">
                      <h6 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Skipped Rows Report</h6>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {importResult.summary.errors.map((err: any, i: number) => (
                          <div key={i} className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-1">
                            <div className="flex items-center justify-between font-bold text-rose-900">
                              <span>Row {err.row}: {err.name || "Unknown"}</span>
                              {err.column && <span className="bg-rose-200 text-rose-800 text-[10px] px-1.5 py-0.5 rounded font-mono">{err.column}</span>}
                            </div>
                            <p className="text-rose-800 text-[11px]">{err.reason}</p>
                            {err.suggestedFix && <p className="text-rose-700 text-[10px] font-semibold">Suggested Fix: {err.suggestedFix}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {!importLoading && !executeLoading && (
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                {importStage === "PREVIEW" && (
                  <>
                    <button
                      onClick={() => setImportModalOpen(false)}
                      className="px-4 py-2 border border-slate-300 hover:bg-slate-200/60 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleExecuteImport}
                      disabled={!previewData || (previewData.summary?.validCount ?? 0) === 0}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Import {previewData?.summary?.validCount ?? 0} Valid Employee(s)
                    </button>
                  </>
                )}

                {importStage === "DONE" && (
                  <button
                    onClick={() => {
                      setImportModalOpen(false);
                      loadEmployees();
                    }}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close & View Employees
                  </button>
                )}
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

              <div className="grid grid-cols-1 gap-4 text-xs">
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

              {/* Hide Work Hours & Timesheets toggle */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    {t("hideWorkHoursPerEmployee")}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {t("hideWorkHoursPerEmployeeDesc")}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formHideWorkHours}
                  onChange={(e) => setFormHideWorkHours(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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

              <div className="grid grid-cols-1 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-500 uppercase tracking-widest text-[10px]">
                    {language === "de" ? "Adresse (Wohnort)" : "Address"}
                  </label>
                  <input
                    type="text"
                    value={formTreffpunkt}
                    onChange={(e) => setFormTreffpunkt(e.target.value)}
                    placeholder="z.B. Duisburg, Musterstr. 12"
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

              {/* Hide Work Hours & Timesheets toggle */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      {t("hideWorkHoursPerEmployee")}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {t("hideWorkHoursPerEmployeeDesc")}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formHideWorkHours}
                    onChange={(e) => setFormHideWorkHours(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
                {isGlobalWorkHoursHidden && (
                  <div className="p-2 rounded-lg bg-amber-100/70 border border-amber-200 text-amber-900 text-[10px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                    <span>{t("globalHideActiveNotice")}</span>
                  </div>
                )}
              </div>

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

      {/* Custom Popup Alert Modal */}
      <CustomAlertModal
        {...alertConfig}
        onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* WhatsApp Message & Interactive Button Modal */}
      {whatsAppModalOpen && whatsAppTargetEmp && (
        <WhatsAppModal
          isOpen={whatsAppModalOpen}
          onClose={() => {
            setWhatsAppModalOpen(false);
            setWhatsAppTargetEmp(null);
          }}
          recipientName={whatsAppTargetEmp.name}
          recipientPhone={whatsAppTargetEmp.phone}
        />
      )}
    </div>
  );
}
