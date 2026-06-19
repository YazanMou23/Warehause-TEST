"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, TranslationKey } from "./translations";

type Language = "en" | "de";

interface LanguageContextType {
  language: Language;
  changeLanguage: (lang: Language) => void;
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
      if (savedLang === "en" || savedLang === "de") {
        setLanguage(savedLang);
      }
    } catch {
      // localStorage not available — silent fallback
    }
  }, []);

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    try {
      localStorage.setItem("preferredLanguage", lang);
    } catch {}
  };

  const t = (key: TranslationKey): string => {
    const dictionary = translations[language] || translations.de;
    const value = dictionary[key];
    if (value === undefined) {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
    return value;
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
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
