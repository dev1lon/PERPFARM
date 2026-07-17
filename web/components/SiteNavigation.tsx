"use client";

import Link from "next/link";
import Image from "next/image";
import { LocaleToggle, tr, useLocale } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SiteNavigation() {
  const locale = useLocale();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-wide text-text-primary">
          <Image src="/icon.svg" alt="" aria-hidden="true" width={24} height={24} className="h-6 w-6 shrink-0" />
          <span>PERPFARM</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/methodology"
            className="pf-transition rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text-primary"
          >
            {tr(locale, "Methodology", "Методология")}
          </Link>
          <LocaleToggle />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
