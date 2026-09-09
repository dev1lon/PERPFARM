"use client";

import { setTheme, useTheme } from "@/components/ThemeToggle";

/**
 * The EN | RU control, parked.
 *
 * The site is English-only for now. This renders nothing rather than being
 * deleted from every header: the Russian strings are still in the source, so
 * bringing the language back is this function plus `getSnapshot` in
 * LocaleProvider, and no caller changes either time.
 */
export function LocaleSwitch() {
  return null;
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
      className="pf-transition flex h-8 w-8 items-center justify-center rounded-none border border-border text-text-muted hover:border-text-muted/40 hover:text-text-primary"
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
