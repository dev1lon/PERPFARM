"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export type Locale = "en" | "ru";

const LOCALE_EVENT = "pf-locale-change";
const LocaleContext = createContext<Locale>("en");

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LOCALE_EVENT, onChange);
  return () => window.removeEventListener(LOCALE_EVENT, onChange);
}

/**
 * English only, for now.
 *
 * The Russian STRINGS stay where they are -- every `tr(locale, en, ru)` call in
 * the tree still carries both, so switching the language back on is this
 * function and the header control, not a re-translation. What is gone is the
 * choice: a reader who had picked Russian before must not be stranded in a
 * language whose switch no longer exists, so a stored "ru" is ignored.
 */
function getSnapshot(): Locale {
  return "en";
}

function getServerSnapshot(): Locale {
  return "en";
}

/** Pins the document to English and clears a language stored by an earlier
 *  visit, so nothing downstream reads a locale the interface no longer offers. */
export const LOCALE_INIT_SCRIPT =
  "try{document.documentElement.dataset.locale='en';document.documentElement.lang='en';localStorage.removeItem('pf-locale');}catch(e){}";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function tr(locale: Locale, en: string, ru: string): string {
  return locale === "ru" ? ru : en;
}

/** Set the active language (persisted + broadcast to all useLocale readers). */
export function setLocale(next: Locale) {
  document.documentElement.dataset.locale = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem("pf-locale", next);
  } catch {
    /* private mode / storage disabled -- language just won't persist */
  }
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

export function LocaleToggle() {
  const locale = useLocale();

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "en" ? "ru" : "en")}
      aria-label={locale === "en" ? "Switch language to Russian" : "Переключить язык на английский"}
      title={locale === "en" ? "Русский" : "English"}
      className="pf-transition rounded-md px-2 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-2 hover:text-text-primary"
    >
      {locale === "en" ? "RU" : "EN"}
    </button>
  );
}
