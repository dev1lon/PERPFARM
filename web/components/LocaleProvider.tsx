"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export type Locale = "en" | "ru";

const LOCALE_EVENT = "pf-locale-change";
const LocaleContext = createContext<Locale>("en");

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LOCALE_EVENT, onChange);
  return () => window.removeEventListener(LOCALE_EVENT, onChange);
}

function getSnapshot(): Locale {
  return document.documentElement.dataset.locale === "ru" ? "ru" : "en";
}

function getServerSnapshot(): Locale {
  return "en";
}

export const LOCALE_INIT_SCRIPT =
  "try{var l=localStorage.getItem('pf-locale');if(l==='ru'||l==='en')document.documentElement.dataset.locale=l;}catch(e){}";

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

export function LocaleToggle() {
  const locale = useLocale();

  function toggle() {
    const next: Locale = locale === "en" ? "ru" : "en";
    document.documentElement.dataset.locale = next;
    try {
      localStorage.setItem("pf-locale", next);
    } catch {
      /* private mode / storage disabled -- language just won't persist */
    }
    window.dispatchEvent(new Event(LOCALE_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={locale === "en" ? "Switch language to Russian" : "Переключить язык на английский"}
      title={locale === "en" ? "Русский" : "English"}
      className="pf-transition rounded-md px-2 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-2 hover:text-text-primary"
    >
      {locale === "en" ? "RU" : "EN"}
    </button>
  );
}
