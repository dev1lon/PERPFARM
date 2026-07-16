"use client";

import { tr, useLocale } from "@/components/LocaleProvider";

export function HomeIntro({ usingFixtures }: { usingFixtures: boolean }) {
  const locale = useLocale();
  return (
    <div className="flex max-w-xl flex-col items-center gap-2 text-center">
      <h1 className="text-3xl font-semibold text-text-primary">
        {tr(locale, "Farm perp points, pay less for them", "Фармите perp-поинты с меньшей стоимостью")}
      </h1>
      <p className="text-text-muted">
        {tr(locale, "A guide to perp-point farming: reward mechanics, current recommendations and lower-cost routes.", "Гайд по фарму perp-поинтов: механика наград, актуальные рекомендации и более выгодные маршруты.")}
      </p>
      {usingFixtures && (
        <p className="mt-2 inline-block rounded-md border border-dashed border-border px-2 py-1 text-xs text-text-muted">
          {tr(
            locale,
            "No DATABASE_URL set — showing synthetic fixture venues for dev/demo.",
            "DATABASE_URL не задан — показаны синтетические площадки для разработки."
          )}
        </p>
      )}
    </div>
  );
}
