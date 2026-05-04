import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: {} },
    },
    // English keys are the source-of-truth literals, so for "en" we want
    // i18next to return the key itself (no fallback). Everything else
    // (including unsupported locales) falls back to French.
    fallbackLng: { en: [], default: ["fr"] },
    supportedLngs: ["fr", "en"],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "cc-lang",
    },
  });

export default i18n;
