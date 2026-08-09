"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tr, type Locale } from "@/components/LocaleProvider";

/** Point-of-use disclaimers for the manual Farm / OTC numbers (methodology is a
 *  separate page most users never open, so the caveat lives on the value). */
export function farmEstimateTip(locale: Locale): string {
  return tr(
    locale,
    "Rough range for the cost of farming one point. A manual estimate, not a guarantee — it depends on emission and terms that can change.",
    "Ориентировочный диапазон стоимости фарма одного поинта. Ручная оценка, не гарантия — зависит от эмиссии и условий, которые могут меняться.",
  );
}
export function otcPointTip(locale: Locale): string {
  return tr(
    locale,
    "Rough OTC quote for a point from open sources and experience. Entered manually, not computed by the site, and can change fast. Not financial advice.",
    "Ориентировочная OTC-котировка цены поинта из открытых источников и опыта. Вносится вручную, не вычисляется сайтом и может быстро меняться. Не финансовый совет.",
  );
}

/** Small "?" affordance with a hover/focus tooltip. */
export function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!show) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const gutter = 12;
      const tipWidth = Math.min(260, width - gutter * 2);
      const left = Math.min(Math.max(rect.left + rect.width / 2 - tipWidth / 2, gutter), width - tipWidth - gutter);
      // Tooltips are short; reserving 132px prevents a top-edge overflow. The
      // rendered max width is separately clamped to the viewport.
      const above = rect.top >= 132;
      // Keep the whole popup inside the visual viewport. Long explanatory
      // tooltips may scroll internally instead of widening the mobile page.
      const top = above ? rect.top - 8 : Math.min(rect.bottom + 8, height - 152);
      setPosition({ left, top, above });
    };
    place();
    const closeOutside = (event: PointerEvent) => {
      if (triggerRef.current?.contains(event.target as Node) || tooltipRef.current?.contains(event.target as Node)) return;
      setShow(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setShow(false); };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [show]);

  const tooltip = show && position && typeof document !== "undefined"
    ? createPortal(
      <span
        ref={tooltipRef}
        id={id}
        role="tooltip"
        className="fixed z-[100] max-h-[140px] overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] font-normal leading-[1.55] text-text-muted shadow-lg"
        style={{
          left: position.left,
          top: position.top,
          width: "min(260px, calc(100vw - 24px))",
          transform: position.above ? "translateY(-100%)" : undefined,
        }}
      >
        {text}
      </span>,
      document.body,
    )
    : null;
  return (
    <span className="inline-flex align-middle" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={text}
        aria-describedby={show ? id : undefined}
        aria-expanded={show}
        onClick={() => setShow((value) => !value)}
        onFocus={() => setShow(true)}
        className="pf-transition flex h-[15px] w-[15px] items-center justify-center rounded-full border border-border font-mono-num text-[9px] leading-none text-text-dim hover:border-text-muted/50 hover:text-text-primary"
      >
        ?
      </button>
      {tooltip}
    </span>
  );
}
