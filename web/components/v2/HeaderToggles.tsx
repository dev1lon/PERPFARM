"use client";

import { setLocale, useLocale, type Locale } from "@/components/LocaleProvider";
import { setTheme, useTheme } from "@/components/ThemeToggle";

/** Segmented EN | RU control, 1:1 with the design: a bordered rounded shell
 *  with the active language filled and the other muted. */
export function LocaleSwitch() {
  const locale = useLocale();
  const seg = (val: Locale, label: string) => (
    <button
      type="button"
      onClick={() => setLocale(val)}
      aria-pressed={locale === val}
      className={`pf-transition rounded-md px-2.5 py-1 font-mono-num text-[11px] font-medium ${
        locale === val ? "bg-text-primary/10 text-text-primary" : "text-text-muted hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-[9px] border border-border p-[3px]">
      {seg("en", "EN")}
      {seg("ru", "RU")}
    </div>
  );
}

/** Theme toggle in a 32px bordered box, matching the design's header control. */
export function ThemeSwitch() {
  const theme = useTheme();
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="pf-transition flex h-8 w-8 items-center justify-center rounded-[9px] border border-border text-text-muted hover:border-text-muted/40 hover:text-text-primary"
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
