/**
 * Centralized Authentication & Session Utility
 * Handles token storage across localStorage (Remember Me) and sessionStorage (Browser-session only).
 */

const TOKEN_KEY = "accessToken";
const REMEMBER_ME_KEY = "rememberMe";
const REMEMBERED_USERNAME_KEY = "rememberedUsername";

// Safe Storage Bridge for existing direct localStorage calls
if (typeof window !== "undefined" && typeof Storage !== "undefined") {
  try {
    const originalLocalGetItem = Storage.prototype.getItem;
    const isOverridden = (Storage.prototype as any).__authBridgeInstalled;
    if (!isOverridden) {
      Storage.prototype.getItem = function (key: string): string | null {
        const val = originalLocalGetItem.call(this, key);
        if (this === window.localStorage && key === TOKEN_KEY && !val) {
          return window.sessionStorage.getItem(TOKEN_KEY);
        }
        return val;
      };
      (Storage.prototype as any).__authBridgeInstalled = true;
    }
  } catch (e) {
    // Non-critical fallback
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
}

export function setAuthToken(token: string, rememberMe: boolean): void {
  if (typeof window === "undefined") return;
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getRememberedUser(): { username: string; rememberMe: boolean } {
  if (typeof window === "undefined") return { username: "", rememberMe: false };
  const rememberMe = localStorage.getItem(REMEMBER_ME_KEY) === "true";
  const username = rememberMe ? localStorage.getItem(REMEMBERED_USERNAME_KEY) || "" : "";
  return { username, rememberMe };
}

export function setRememberedUser(username: string, rememberMe: boolean): void {
  if (typeof window === "undefined") return;
  if (rememberMe) {
    localStorage.setItem(REMEMBER_ME_KEY, "true");
    localStorage.setItem(REMEMBERED_USERNAME_KEY, username.trim());
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY);
    localStorage.removeItem(REMEMBERED_USERNAME_KEY);
  }
}

export function updateDecodedTokenName(newName: string): void {
  if (typeof window === "undefined") return;
  const storage = localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
  const token = storage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      payload.name = newName;
      const newPayload = btoa(JSON.stringify(payload));
      storage.setItem(TOKEN_KEY, `${parts[0]}.${newPayload}.${parts[2]}`);
    }
  } catch (e) {
    console.error("Failed to update token name payload", e);
  }
}
