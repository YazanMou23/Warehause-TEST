/**
 * SSR-safe date/time formatting utilities.
 *
 * Root cause of React error #418:
 *   - Node.js (server) and the browser use different locale environments.
 *   - .toLocaleDateString() / .toLocaleTimeString() / .toLocaleString()
 *     produce different strings on server vs client → React hydration mismatch.
 *
 * Strategy:
 *   - Always render a fixed, locale-neutral ISO-style string (YYYY-MM-DD) on the
 *     first render (server + first client paint) so they always match.
 *   - After hydration completes (useEffect fires), switch to the user-locale-aware
 *     format. React re-renders only on the client, no mismatch.
 *
 * Usage:
 *   const fmtDate = useDateFormat("de-DE");
 *   <td suppressHydrationWarning>{fmtDate(record.date)}</td>
 */

"use client";

import { useState, useEffect } from "react";

type LocaleDateOptions = Intl.DateTimeFormatOptions;

/**
 * Returns a date-formatting function that is safe for SSR.
 * Before hydration: returns ISO "YYYY-MM-DD".
 * After hydration: returns locale-formatted string.
 */
export function useDateFormat(locale: string, options?: LocaleDateOptions) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (value: string | Date | null | undefined): string => {
    if (!value) return "—";
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (isNaN(d.getTime())) return "—";
      // Before hydration: always return ISO date — server and client agree.
      if (!hydrated) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      // After hydration: locale-aware format.
      return d.toLocaleDateString(locale, options);
    } catch {
      return "—";
    }
  };
}

/**
 * Returns a time-formatting function that is safe for SSR.
 * Before hydration: returns "HH:MM".
 * After hydration: returns locale-formatted time string.
 */
export function useTimeFormat(locale: string, options?: LocaleDateOptions) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (value: string | Date | null | undefined): string => {
    if (!value) return "—";
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (isNaN(d.getTime())) return "—";
      if (!hydrated) {
        const hh = String(d.getUTCHours()).padStart(2, "0");
        const mm = String(d.getUTCMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      }
      return d.toLocaleTimeString(locale, options);
    } catch {
      return "—";
    }
  };
}

/**
 * Returns a datetime-formatting function that is safe for SSR.
 * Before hydration: returns "YYYY-MM-DD HH:MM".
 * After hydration: returns locale-formatted datetime string.
 */
export function useDateTimeFormat(locale: string, options?: LocaleDateOptions) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (value: string | Date | null | undefined): string => {
    if (!value) return "—";
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (isNaN(d.getTime())) return "—";
      if (!hydrated) {
        const y = d.getUTCFullYear();
        const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        const hh = String(d.getUTCHours()).padStart(2, "0");
        const mm = String(d.getUTCMinutes()).padStart(2, "0");
        return `${y}-${mo}-${day} ${hh}:${mm}`;
      }
      return d.toLocaleString(locale, options);
    } catch {
      return "—";
    }
  };
}
