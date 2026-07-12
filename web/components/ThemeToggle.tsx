"use client";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme") === "light" ? "light" : "dark";
  const next = current === "light" ? "dark" : "light";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("pf-theme", next);
  } catch {
    // localStorage unavailable (private mode etc.) -- theme just won't persist
  }
}

/** Icon choice is pure CSS (keyed off the ancestor [data-theme] set by the
 * beforeInteractive init script), not React state -- avoids any
 * hydration-mismatch risk between server render and the client's actual
 * persisted theme, and updates instantly on click with no re-render. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Switch theme"
      className="pf-transition inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-primary"
    >
      <span className="hidden [html[data-theme='light']_&]:block">
        <MoonIcon />
      </span>
      <span className="block [html[data-theme='light']_&]:hidden">
        <SunIcon />
      </span>
    </button>
  );
}
