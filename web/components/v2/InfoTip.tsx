"use client";

import { useState } from "react";
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
export function volumePerPointTip(locale: Locale): string {
  return tr(
    locale,
    "Roughly how much traded volume earns one point. A manual figure from experience — the site never derives points from volume. Used together with the live execution cost to express cost per point.",
    "Примерно сколько объёма нужно, чтобы получить один поинт. Ручная цифра из опыта — сайт не выводит поинты из объёма сам. Используется вместе с живой стоимостью исполнения, чтобы показать стоимость поинта.",
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
  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button
        type="button"
        aria-label={text}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="pf-transition flex h-[15px] w-[15px] items-center justify-center rounded-full border border-border font-mono-num text-[9px] leading-none text-text-dim hover:border-text-muted/50 hover:text-text-primary"
      >
        ?
      </button>
      {show && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-2 w-[230px] max-w-[70vw] -translate-x-1/2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] font-normal leading-[1.55] text-text-muted shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
