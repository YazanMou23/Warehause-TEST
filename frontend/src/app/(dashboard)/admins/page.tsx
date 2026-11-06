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
  ShieldAlert,
} from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import CustomAlertModal, { CustomAlertOptions } from "../../components/CustomAlertModal";

interface Admin {
  id: string;
  username: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
  isActive: boolean;
  telegramId: string | null;
  warehouseId?: string | null;
  hallId?: string | null;
  employmentStart?: string;
}

export default function AdminsPage() {
  const { t, locale } = useTranslation();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [alertConfig, setAlertConfig] = useState<CustomAlertOptions>({
    isOpen: false,
    message: "",
  });

  const showAlert = (options: Omit<CustomAlertOptions, "isOpen">) => {
    setAlertConfig({ ...options, isOpen: true });
  };
  const [searchTerm, setSearchTerm] = useState("");

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [halls, setHalls] = useState<any[]>([]);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formWarehouse, setFormWarehouse] = useState("");
  const [formHall, setFormHall] = useState("");
  const [formTelegram, setFormTelegram] = useState("");
  const [formRole, setFormRole] = useState("ADMIN");
  const [formEmploymentStart, setFormEmploymentStart] = useState("");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const router = useRouter();

  const loadAdmins = async () => {
    setLoading(true);
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      // Request ONLY admins from backend
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees?role=ADMIN`, { headers });
      const adminJson = res.ok ? await res.json() : null;
      const adminList = adminJson && Array.isArray(adminJson.data) ? adminJson.data : (Array.isArray(adminJson) ? adminJson : []);
      setAdmins(adminList);
    } catch (err) {
      console.error("Failed to load admins:", err);
      setAdmins([]);
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
        if (payload.role !== "MANAGER") {
          // Strictly ONLY Manager can access the Admins page
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Failed to parse token payload", e);
      }
    } else {
      router.push("/login");
      return;
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

    loadAdmins();
    loadInfo();
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
    setFormRole("ADMIN");
    setFormEmploymentStart(new Date().toISOString().split("T")[0]);
    setFormError("");
    setAddModalOpen(true);
  };

  const openEditModal = (admin: Admin) => {
    setSelectedAdmin(admin);
    setFormName(admin.name);
    setFormPhone(admin.phone);
    setFormEmail(admin.email || "");
    setFormUsername(admin.username);
    setFormPassword("");
    setFormWarehouse(admin.warehouseId || "");
    setFormHall(admin.hallId || "");
    setFormTelegram(admin.telegramId || "");
    setFormRole(admin.role);
    setFormEmploymentStart(admin.employmentStart ? admin.employmentStart.split("T")[0] : new Date().toISOString().split("T")[0]);
    setFormError("");
    setEditModalOpen(true);
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");

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
          name: formName,
          phone: formPhone,
          email: formEmail || undefined,
          passwordHash: formPassword,
          role: formRole, // ADMIN or MANAGER
          warehouseId: formWarehouse || undefined,
          hallId: formHall || undefined,
          telegramId: formTelegram || undefined,
          employmentStart: new Date(formEmploymentStart).toISOString(),
        }),
      });

      if (res.ok) {
        setAddModalOpen(false);
        loadAdmins();
      } else {
        const err = await res.json();
        setFormError(err.message || t("staff1102"));
      }
    } catch (err: any) {
      setFormError(err.message || t("staff1094"));
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin) return;
    setFormLoading(true);
    setFormError("");

    const token = localStorage.getItem("accessToken");
    try {
      const body: any = {
        username: formUsername,
        name: formName,
        phone: formPhone,
        email: formEmail || null,
        warehouseId: formWarehouse || null,
        hallId: formHall || null,
        telegramId: formTelegram || null,
        role: formRole,
        employmentStart: new Date(formEmploymentStart).toISOString(),
      };

      if (formPassword) {
        body.password = formPassword;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${selectedAdmin.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setEditModalOpen(false);
        loadAdmins();
      } else {
        const err = await res.json();
        setFormError(err.message || t("staff1103"));
      }
    } catch (err: any) {
      setFormError(err.message || t("staff1094"));
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeactivate = (id: string, name: string) => {
    showAlert({
      title: t("staff981"),
      message: t("staffDeactivateAdminQuestion").replace("{name}", name),
      type: "warning",
      confirmText: t("staff982"),
      cancelText: t("ui336"),
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            loadAdmins();
            showAlert({ title: t("staff983"), message: t("staff984"), type: "success" });
          } else {
            showAlert({ title: t("ui526"), message: t("staff985"), type: "error" });
          }
        } catch (e) {
          console.error(e);
          showAlert({ title: t("ui526"), message: t("staff986"), type: "error" });
        }
      },
    });
  };

  const handleBulkDeactivate = () => {
    if (selectedAdminIds.length === 0) return;
    showAlert({
      title: t("staff987"),
      message: t("staffDeactivateAdminsQuestion").replace("{count}", String(selectedAdminIds.length)),
      type: "warning",
      confirmText: t("staff982"),
      cancelText: t("ui336"),
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/bulk`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ ids: selectedAdminIds }),
          });

          if (res.ok) {
            setSelectedAdminIds([]);
            loadAdmins();
            showAlert({ title: t("staff983"), message: t("staff988"), type: "success" });
          } else {
            showAlert({ title: t("ui526"), message: t("staff989"), type: "error" });
          }
        } catch (e) {
          console.error(e);
          showAlert({ title: t("ui526"), message: t("staff986"), type: "error" });
        }
      },
    });
  };

  const filteredAdmins = admins.filter((a) =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.phone.includes(searchTerm) ||
    a.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    );
  }

  // Access Denied Check
  if (userRole !== "MANAGER") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center">
        <div className="p-4 bg-error-container/10 border border-error/20 text-error rounded-full">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h3 className="text-xl font-bold text-white">{t("accessDenied")}</h3>
        <p className="text-on-surface-variant max-w-md text-sm">{t("accessDeniedDesc")}</p>
        <button
          onClick={() => router.push("/")}
          className="bg-primary text-on-primary px-5 py-2 rounded-lg font-label-md hover:bg-neutral-800 transition-colors shadow-sm cursor-pointer"
        >
          {t("staff1217")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-stack-lg text-on-background">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-headline-lg font-bold text-on-surface">{t("adminManagement")}</h3>
          <p className="text-on-surface-variant font-body-sm">
            {t("adminSubtitle")}
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="bg-primary text-on-primary px-4 py-2.5 rounded-lg font-label-md uppercase tracking-wider flex items-center gap-2 hover:bg-neutral-800 transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" /> {t("addAdmin")}
        </button>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-outline-variant p-stack-md rounded-lg shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-600 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t("staff1218")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-9 pe-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm outline-none focus:ring-1 focus:ring-secondary focus:border-transparent text-on-surface"
          />
        </div>

        {selectedAdminIds.length > 0 && (
          <button
            onClick={handleBulkDeactivate}
            className="px-4 py-2 bg-error hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors self-start cursor-pointer shadow-sm"
          >
            <Trash2 className="w-4 h-4" /> {t("deactivateSelected")} ({selectedAdminIds.length})
          </button>
        )}
      </div>

      {/* Grid List */}
      <div className="bg-white border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant text-slate-600 font-semibold">
                <th className="p-3 text-center w-12">
                  <button
                    onClick={() => {
                      if (selectedAdminIds.length === filteredAdmins.length) {
                        setSelectedAdminIds([]);
                      } else {
                        setSelectedAdminIds(filteredAdmins.map((a) => a.id));
                      }
                    }}
                    className="text-slate-600 hover:text-secondary"
                  >
                    {selectedAdminIds.length === filteredAdmins.length && filteredAdmins.length > 0 ? (
                      <CheckSquare className="w-4 h-4 inline" />
                    ) : (
                      <Square className="w-4 h-4 inline" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3">{t("nameColumn")}</th>
                <th className="px-4 py-3">{t("usernameLabel")}</th>
                <th className="px-4 py-3">{t("phone")}</th>
                <th className="px-4 py-3">{t("employmentStart")}</th>
                <th className="px-4 py-3">{t("telegramId")}</th>
                <th className="px-4 py-3 text-right"> {t("staff926")} </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-sm text-on-surface">
              {filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-600 italic">
                    {t("noAdminsFound")}
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => (
                  <tr key={admin.id} className={`hover:bg-surface-bright transition-colors ${selectedAdminIds.includes(admin.id) ? "bg-secondary-container/5" : ""}`}>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          if (selectedAdminIds.includes(admin.id)) {
                            setSelectedAdminIds(prev => prev.filter(id => id !== admin.id));
                          } else {
                            setSelectedAdminIds(prev => [...prev, admin.id]);
                          }
                        }}
                        className="text-slate-600 hover:text-secondary cursor-pointer"
                      >
                        {selectedAdminIds.includes(admin.id) ? (
                          <CheckSquare className="w-4 h-4 text-secondary inline" />
                        ) : (
                          <Square className="w-4 h-4 inline" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8.5 h-8.5 rounded-full bg-secondary/15 text-secondary flex items-center justify-center font-bold text-sm relative overflow-hidden shrink-0">
                          <img
                            src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${admin.id}/photo`}
                            alt={admin.name}
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
                            {admin.name.split(" ").map((n) => n[0]).join("")}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-on-surface block leading-tight">{admin.name}</span>
                          {admin.email && <span className="text-[10px] text-slate-600"><bdi dir="ltr">{admin.email}</bdi></span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12.5px] text-on-surface">
                      <bdi dir="ltr">{admin.username}</bdi>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12.5px] text-slate-600">
                      <bdi dir="ltr">{admin.phone}</bdi>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12.5px]">
                      {admin.employmentStart ? new Date(admin.employmentStart).toLocaleDateString(locale) : "—"}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12px]">
                      {admin.telegramId ? (
                        <span className="text-secondary flex items-center gap-1 font-bold">
                          <MessageSquare className="w-3.5 h-3.5" /> <bdi dir="ltr">{admin.telegramId}</bdi>
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => openEditModal(admin)}
                          className="p-1 text-on-surface-variant hover:text-secondary rounded hover:bg-surface-container-high transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeactivate(admin.id, admin.name)}
                          className="p-1 text-on-surface-variant hover:text-error rounded hover:bg-error-container/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Admin Modal */}
      {addModalOpen && (
        <div className="responsive-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-[#0f1117] border-b border-[#334155] flex justify-between items-center">
              <h4 className="font-bold text-body-lg text-white">{t("addAdmin")}</h4>
              <button onClick={() => setAddModalOpen(false)} className="text-on-surface-variant hover:text-white p-1 hover:bg-[#334155] rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAdmin} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-error-container/20 border border-error/20 text-error rounded-lg flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("nameColumn")}</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t("staff990")}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("phone")}</label>
                  <input
                    dir="ltr" type="text"
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
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("usernameLabel")}</label>
                  <input
                    dir="ltr" type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder={t("staff991")}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("passwordLabel")}</label>
                  <input
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={t("staff961")}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("email")}</label>
                  <input
                    dir="ltr" type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder={t("staff992")}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("employmentStart")}</label>
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
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider"> {t("ui344")} </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value="ADMIN"> {t("staff924")} </option>
                    <option value="MANAGER"> {t("roleManager")} </option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("telegramId")}</label>
                  <input
                    dir="ltr" type="text"
                    value={formTelegram}
                    onChange={(e) => setFormTelegram(e.target.value)}
                    placeholder={t("staff966")}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider"> {t("staff963")} </label>
                  <select
                    value={formWarehouse}
                    onChange={(e) => {
                      setFormWarehouse(e.target.value);
                      setFormHall("");
                    }}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value=""> {t("staff964")} </option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider"> {t("staff965")} </label>
                  <select
                    value={formHall}
                    onChange={(e) => setFormHall(e.target.value)}
                    disabled={!formWarehouse}
                    className="w-full px-3.5 py-2 border border-[#334155] disabled:opacity-50 focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value=""> {t("staff964")} </option>
                    {halls.filter(h => h.warehouseId === formWarehouse).map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
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
                  {formLoading ? t("planning886") : t("saveSettings")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Admin Modal */}
      {editModalOpen && selectedAdmin && (
        <div className="responsive-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl max-w-lg w-full shadow-2xl overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-[#0f1117] border-b border-[#334155] flex justify-between items-center">
              <h4 className="font-bold text-body-lg text-white">{t("editAdmin")}</h4>
              <button onClick={() => setEditModalOpen(false)} className="text-on-surface-variant hover:text-white p-1 hover:bg-[#334155] rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditAdmin} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-error-container/20 border border-error/20 text-error rounded-lg flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("nameColumn")}</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("phone")}</label>
                  <input
                    dir="ltr" type="text"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("usernameLabel")}</label>
                  <input
                    dir="ltr" type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("passwordLabel")}  {t("staff967")} </label>
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
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("email")}</label>
                  <input
                    dir="ltr" type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("employmentStart")}</label>
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
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider"> {t("ui344")} </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value="ADMIN"> {t("staff924")} </option>
                    <option value="MANAGER"> {t("roleManager")} </option>
                    <option value="EMPLOYEE"> {t("staff995")} </option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider">{t("telegramId")}</label>
                  <input
                    dir="ltr" type="text"
                    value={formTelegram}
                    onChange={(e) => setFormTelegram(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider"> {t("staff963")} </label>
                  <select
                    value={formWarehouse}
                    onChange={(e) => {
                      setFormWarehouse(e.target.value);
                      setFormHall("");
                    }}
                    className="w-full px-3.5 py-2 border border-[#334155] focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value=""> {t("staff964")} </option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-200 tracking-wider"> {t("staff965")} </label>
                  <select
                    value={formHall}
                    onChange={(e) => setFormHall(e.target.value)}
                    disabled={!formWarehouse}
                    className="w-full px-3.5 py-2 border border-[#334155] disabled:opacity-50 focus:border-secondary rounded-lg text-body-sm outline-none bg-[#0f1117] text-white"
                  >
                    <option value=""> {t("staff964")} </option>
                    {halls.filter(h => h.warehouseId === formWarehouse).map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>

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
                  {formLoading ? t("planning886") : t("saveSettings")}
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
    </div>
  );
}
