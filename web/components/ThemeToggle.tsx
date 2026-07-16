"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

/** Inline script placed in <body> (see app/layout.tsx) BEFORE any content, so
 * the stored theme is applied before first paint -- no light/dark flash. */
export const THEME_INIT_SCRIPT =
  "try{var t=localStorage.getItem('pf-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}";

const THEME_EVENT = "pf-theme-change";

// The theme lives on <html data-theme> (set by the init script / the toggle),
// which is external mutable state -- read it with useSyncExternalStore so the
// server snapshot ("dark") is used during hydration (no mismatch), then the
// real value on the client, with no setState-in-effect.
function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}
function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function getServerSnapshot(): Theme {
  return "dark";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pf-theme", next);
    } catch {
      /* private mode / storage disabled -- theme just won't persist */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      className="pf-transition rounded-md p-2 text-text-muted hover:bg-surface-2 hover:text-text-primary"
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
