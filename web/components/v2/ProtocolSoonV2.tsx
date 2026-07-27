"use client";

import Link from "next/link";
import { tr, useLocale } from "@/components/LocaleProvider";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import type { VenueDetail } from "@/lib/types";

/** Reskinned SOON page for a listed protocol that isn't verified/live yet. */
export function ProtocolSoonV2({
  slug,
  name,
  meta,
}: {
  slug: string;
  name: string;
  meta: VenueDetail["meta"];
}) {
  const locale = useLocale();
  return (
    <div>
      <SiteHeaderV2 />
      <div className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-10">
        <div className="flex items-center gap-2 pb-4 pt-5 text-[13px] text-text-dim">
          <Link href="/#protocols" className="pf-transition text-text-muted hover:text-text-primary">
            {tr(locale, "Protocols", "Протоколы")}
          </Link>
          <span>/</span>
          <span className="text-text-primary">{name}</span>
        </div>

        <div className="flex items-center gap-4 border-b border-border pb-6">
          <ProtocolMark slug={slug} name={name} size={52} radius={14} />
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] font-bold tracking-[-0.022em] text-text-primary">{name}</h1>
            <div className="flex items-center gap-3.5">
              {meta?.twitterUrl && (
                <a href={meta.twitterUrl} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Twitter ↗</a>
              )}
              {meta?.docsUrl && (
                <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Docs ↗</a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-border bg-surface-1 p-10 text-center">
          <p className="font-mono-num text-5xl font-semibold tracking-[0.22em] text-text-primary">SOON</p>
          <p className="max-w-md text-[14px] text-text-muted">
            {tr(
              locale,
              "We are verifying this perp-dex before publishing routes, fees, or point estimates.",
              "Мы проверяем этот perp-dex перед публикацией маршрутов, комиссий и оценок поинтов.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
