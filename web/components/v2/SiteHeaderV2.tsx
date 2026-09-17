"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { LocaleSwitch, ThemeSwitch } from "@/components/v2/HeaderToggles";

/** Shared sticky header for the canonical Home + protocol pages. Nav
 *  anchors point at the home sections so they work from any page. */
export function SiteHeaderV2() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const link = "pf-transition text-sm font-medium text-text-muted hover:text-text-primary";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes it too. A pointer had a way out of this menu and a keyboard
    // did not, which leaves a keyboard reader tabbing through a menu they
    // cannot dismiss.
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: [string, string][] = [
    ["/#protocols", tr(locale, "Protocols", "Протоколы")],
    ["/how-it-works", tr(locale, "How it works", "Как это работает")],
    ["/methodology", tr(locale, "Methodology", "Методология")],
  ];

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between px-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/icon.svg" alt="" aria-hidden width={26} height={26} className="h-[26px] w-[26px] rounded-lg" />
          <span className="text-base font-bold tracking-tight text-text-primary">PerpFarm</span>
        </Link>
        <div className="flex items-center gap-5 sm:gap-7">
          {items.map(([href, label]) => (
            <Link key={href} href={href} className={`hidden sm:inline ${link}`}>
              {label}
            </Link>
          ))}
          <div className="flex items-center gap-2">
            <LocaleSwitch />
            <ThemeSwitch />
            {/* The nav links collapse below `sm`, so phones reach them here. */}
            <div ref={menuRef} className="relative sm:hidden">
              <button
                type="button"
                aria-label={tr(locale, "Menu", "Меню")}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="pf-transition flex h-8 w-8 items-center justify-center rounded-none border border-border text-text-muted hover:border-text-muted/50 hover:text-text-primary"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
                </svg>
              </button>
              {open && (
                <div className="absolute right-0 z-30 mt-2 w-[190px] overflow-hidden rounded-xl border border-border bg-surface-1 p-1 shadow-lg">
                  {items.map(([href, label]) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className="pf-transition block rounded-lg px-3 py-2.5 text-[14px] text-text-primary hover:bg-surface-2"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
