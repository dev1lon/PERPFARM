"use client";

import Link from "next/link";
import Image from "next/image";
import { tr, useLocale } from "@/components/LocaleProvider";
import { LocaleSwitch, ThemeSwitch } from "@/components/v2/HeaderToggles";

/** Shared sticky header for the canonical Home + protocol pages. Nav
 *  anchors point at the home sections so they work from any page. */
export function SiteHeaderV2() {
  const locale = useLocale();
  const link = "pf-transition text-sm font-medium text-text-muted hover:text-text-primary";
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between px-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/icon.svg" alt="" aria-hidden width={26} height={26} className="h-[26px] w-[26px] rounded-lg" />
          <span className="text-base font-bold tracking-tight text-text-primary">PerpFarm</span>
        </Link>
        <div className="flex items-center gap-5 sm:gap-7">
          <Link href="/#protocols" className={`hidden sm:inline ${link}`}>
            {tr(locale, "Protocols", "Протоколы")}
          </Link>
          <Link href="/#how" className={`hidden sm:inline ${link}`}>
            {tr(locale, "How it works", "Как это работает")}
          </Link>
          <Link href="/methodology" className={`hidden sm:inline ${link}`}>
            {tr(locale, "Methodology", "Методология")}
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitch />
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </div>
  );
}
