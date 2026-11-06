import de from "./de.json";
import ar from "./ar.json";
import tr from "./tr.json";
import uk from "./uk.json";

export type Language = "de" | "ar" | "tr" | "uk";
export type TranslationKey = keyof typeof de;
export const translations: Record<Language, Record<TranslationKey, string>> = { de, ar, tr, uk };
export const languageNames: Record<Language, string> = { de: "Deutsch", ar: "العربية", tr: "Türkçe", uk: "Українська" };
export const locales: Record<Language, string> = { de: "de-DE", ar: "ar", tr: "tr-TR", uk: "uk-UA" };
export const isLanguage = (value: unknown): value is Language => typeof value === "string" && Object.hasOwn(languageNames, value);
