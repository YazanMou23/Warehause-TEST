"use client";
import { useTranslation } from "../i18n/LanguageContext";
import { languageNames, isLanguage } from "../i18n/translations";

export default function LanguageSelector() {
  const { language, changeLanguage, t } = useTranslation();
  return <select aria-label={t("languageSelectLabel")} value={language}
    onChange={event => { if (isLanguage(event.target.value)) changeLanguage(event.target.value); }}
    className="min-h-11 max-w-36 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 cursor-pointer" dir="auto">
    {Object.entries(languageNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
  </select>;
}
