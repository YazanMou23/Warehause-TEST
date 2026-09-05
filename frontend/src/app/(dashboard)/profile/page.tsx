"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Phone,
  Mail,
  Shield,
  Warehouse,
  Grid,
  Send,
  Calendar,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Loader2,
} from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import { getAuthToken, updateDecodedTokenName } from "../../utils/auth";

interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  profilePhoto: string | null;
  role: string;
  warehouseId: string | null;
  hallId: string | null;
  telegramId: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ProfilePage() {
  const { t, language } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [userRole, setUserRole] = useState("");
  
  // Edit Details State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState("");
  const [updateError, setUpdateError] = useState("");

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Profile Photo Upload State
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();

  const fetchProfile = async (userId: string, token: string) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${userId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        const data: UserProfile = await res.json();
        setProfile(data);
        setName(data.name);
        setEmail(data.email || "");
        setTelegramId(data.telegramId || "");
      } else {
        throw new Error("Failed to load profile");
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUserRole(payload.role || "");
      if (payload.sub) {
        fetchProfile(payload.sub, token);
      } else {
        router.push("/login");
      }
    } catch (e) {
      console.error(e);
      router.push("/login");
    }
  }, [router]);

  const handleUpdateDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateLoading(true);
    setUpdateSuccess("");
    setUpdateError("");

    const token = getAuthToken();
    if (!token || !profile) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${profile.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name,
            email: email || null,
            telegramId: telegramId || null,
          }),
        }
      );

      if (res.ok) {
        const updatedUser = await res.json();
        setUpdateSuccess(language === "de" ? "Profildaten erfolgreich aktualisiert." : "Profile details updated successfully.");
        
        updateDecodedTokenName(updatedUser.name);
        window.dispatchEvent(new Event("profile-updated"));
        fetchProfile(profile.id, token);
      } else {
        const errJson = await res.json();
        throw new Error(errJson.message || "Failed to update profile");
      }
    } catch (err: any) {
      setUpdateError(err.message || "Network error occurred.");
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordSuccess("");
    setPasswordError("");

    if (!currentPassword) {
      setPasswordError(language === "de" ? "Bitte geben Sie Ihr aktuelles Passwort ein." : "Please enter your current password.");
      setPasswordLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t("passwordsDoNotMatch"));
      setPasswordLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(t("passwordMinLength"));
      setPasswordLoading(false);
      return;
    }

    const token = getAuthToken();
    if (!token || !profile) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/change-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        }
      );

      const data = await res.json();

      if (res.ok) {
        setPasswordSuccess(t("passwordChangedSuccess"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        throw new Error(data.message || (language === "de" ? "Passwortänderung fehlgeschlagen." : "Failed to change password."));
      }
    } catch (err: any) {
      setPasswordError(err.message || "Network error occurred.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setPhotoLoading(true);
    setPhotoError("");

    const token = getAuthToken();
    if (!token) return;

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${profile.id}/photo`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (res.ok) {
        window.dispatchEvent(new Event("profile-updated"));
        fetchProfile(profile.id, token);
      } else {
        const errJson = await res.json();
        throw new Error(errJson.message || "Failed to upload photo");
      }
    } catch (err: any) {
      setPhotoError(err.message || "Error uploading file.");
    } finally {
      setPhotoLoading(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-secondary"></div>
      </div>
    );
  }

  const initials = profile.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const getTranslatedRole = (role: string) => {
    if (role === "MANAGER") return t("roleManager");
    if (role === "ADMIN") return t("roleAdmin");
    return t("roleEmployee");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-stack-lg animate-fadeIn text-on-background">
      {/* Page Title */}
      <div>
        <h2 className="font-headline-lg font-bold tracking-tight text-on-surface">
          {t("profileTitle")}
        </h2>
        <p className="text-on-surface-variant font-body-sm">
          {t("profileSubtitle")}
        </p>
      </div>



      {userRole === "EMPLOYEE" && (
        <div className="bg-blue-500/10 text-blue-300 border border-blue-500/20 px-4 py-3 rounded-lg flex items-start gap-2.5 text-xs">
          <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-blue-400" />
          <span>{t("cannotChangeTip")}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-stack-lg items-start">
        
        {/* Left Side: Avatar Card */}
        <div className="bg-white border border-outline-variant p-stack-md rounded-xl shadow-sm text-center flex flex-col items-center">
          <div className="relative group cursor-pointer mb-4" onClick={handlePhotoClick}>
            <div className="w-32 h-32 rounded-full bg-secondary-container border-2 border-outline-variant overflow-hidden flex items-center justify-center relative">
              <img
                src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${profile.id}/photo?t=${Date.now()}`}
                alt={profile.name}
                className="w-full h-full object-cover absolute inset-0 z-10"
                style={{ display: "none" }}
                onLoad={(e) => {
                  e.currentTarget.style.display = "block";
                }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <span className="w-full h-full flex items-center justify-center bg-secondary-container text-white text-3xl font-bold">
                {initials}
              </span>
            </div>
            
            {/* Edit overlay */}
            <div className="absolute inset-0 bg-black/45 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
              <Camera className="w-6 h-6 text-white" />
            </div>

            {photoLoading && (
              <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center z-30">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handlePhotoChange}
            accept="image/png, image/jpeg, image/jpg, image/webp"
            className="hidden"
          />

          <h3 className="font-bold text-body-lg text-on-surface">{profile.name}</h3>
          <span className="mt-1 px-3 py-0.5 rounded-full bg-secondary-container/10 text-secondary-container font-mono text-[10px] uppercase font-bold tracking-wider">
            {getTranslatedRole(profile.role)}
          </span>

          {photoError && (
            <p className="text-error font-semibold text-xs mt-2">{photoError}</p>
          )}

          {/* Quick info breakdown */}
          <div className="w-full mt-6 pt-6 border-t border-outline-variant space-y-3 text-left text-xs text-on-surface-variant">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-outline" />
              <span><strong>{t("roleColumn")}:</strong> {getTranslatedRole(profile.role)}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Warehouse className="w-4 h-4 text-outline" />
              <span>
                <strong>{t("warehouse")}:</strong> {profile.warehouseId || (language === "de" ? "Nicht zugewiesen" : "Not Assigned")}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Grid className="w-4 h-4 text-outline" />
              <span>
                <strong>{t("stagingHall")}:</strong> {profile.hallId || (language === "de" ? "Nicht zugewiesen" : "Not Assigned")}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-outline" />
              <span>
                <strong>{t("employmentStart")}:</strong>{" "}
                  <span suppressHydrationWarning>
                    {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString(language === "de" ? "de-DE" : "en-CA") : "—"}
                  </span>
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Inputs Column */}
        <div className="md:col-span-2 space-y-stack-lg">
          
          {/* Edit Profile Form */}
          <div className="bg-white border border-outline-variant p-stack-md rounded-xl shadow-sm space-y-stack-md">
            <h4 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
              <User className="w-5 h-5 text-secondary" /> {t("personalDetails")}
            </h4>
            
            <form onSubmit={handleUpdateDetails} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    {t("displayName")}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    {t("phone")}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={profile.phone}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm bg-surface-container-high text-outline outline-none cursor-not-allowed"
                      disabled
                      title={t("cannotChangeTip")}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    {t("email")}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. name@logiflow.com"
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    {t("telegramId")}
                  </label>
                  <div className="relative">
                    <Send className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={telegramId}
                      onChange={(e) => setTelegramId(e.target.value)}
                      placeholder={t("telegramIdPlaceholder")}
                      className="w-full pl-9 pr-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    />
                  </div>
                </div>
              </div>

              {updateSuccess && (
                <div className="bg-emerald-50 border border-emerald-500/10 text-emerald-800 px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{updateSuccess}</span>
                </div>
              )}

              {updateError && (
                <div className="bg-error-container text-on-error-container px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{updateError}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={updateLoading}
                  className="bg-secondary text-white hover:bg-secondary-container px-5 py-2 rounded-lg text-label-md transition-colors font-bold disabled:opacity-50 cursor-pointer"
                >
                  {updateLoading ? (language === "de" ? "Wird gespeichert..." : "Saving...") : t("saveProfile")}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password Card - Available for all roles (EMPLOYEE, ADMIN, MANAGER) */}
          <div className="bg-white border border-outline-variant p-stack-md rounded-xl shadow-sm space-y-stack-md">
            <h4 className="font-bold text-body-lg text-on-surface flex items-center gap-2">
              <Lock className="w-5 h-5 text-secondary" /> {t("updatePassword")}
            </h4>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    {t("currentPasswordLabel")}
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    {t("newPasswordLabel")}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("newPasswordPlaceholder")}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">
                    {t("confirmPasswordLabel")}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2 border border-outline-variant rounded-lg text-body-sm focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-low text-on-surface"
                    required
                  />
                </div>
              </div>

              {passwordSuccess && (
                <div className="bg-emerald-50 border border-emerald-500/10 text-emerald-800 px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {passwordError && (
                <div className="bg-error-container text-on-error-container px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="bg-primary text-on-primary hover:bg-neutral-800 px-5 py-2 rounded-lg text-label-md transition-colors font-bold uppercase tracking-wider text-xs disabled:opacity-50 cursor-pointer"
                >
                  {passwordLoading ? (language === "de" ? "Wird aktualisiert..." : "Updating...") : t("updatePassword")}
                </button>
              </div>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
}
