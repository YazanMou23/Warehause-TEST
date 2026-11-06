"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { translations, TranslationKey, Language, isLanguage, locales } from "./translations";

export type { Language } from "./translations";

interface LanguageContextType {
  language: Language;
  changeLanguage: (lang: Language) => void;
  locale: string;
  isRTL: boolean;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Always start with "de" on both server AND initial client render.
  // After mount, read localStorage and update — avoids React hydration mismatch (#418).
  const [language, setLanguage] = useState<Language>("de");

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem("preferredLanguage") as Language;
      if (isLanguage(savedLang)) {
        setLanguage(savedLang);
      }
    } catch {
      // localStorage not available — silent fallback
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const changeLanguage = (lang: Language) => {
    if (!isLanguage(lang)) return;
    setLanguage(lang);
    try {
      localStorage.setItem("preferredLanguage", lang);
    } catch {}
  };

  const t = useCallback((key: TranslationKey): string => {
    const dictionary = translations[language] || translations.de;
    const value = dictionary[key];
    if (value === undefined) {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
    return value;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t, locale: locales[language], isRTL: language === "ar" }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
}
