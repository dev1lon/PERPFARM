import { FarmGuide } from "@/components/FarmGuide";
import { HomeSearch } from "@/components/HomeSearch";
import { HomeIntro } from "@/components/HomeIntro";
import { getVenues, usingFixtures } from "@/lib/data-source";
import type { VenueSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let venues: VenueSummary[];
  let loadError: string | null = null;
  try {
    venues = await getVenues();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "failed to load perp-dexes";
    venues = [];
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 py-16 sm:px-6">
      <HomeIntro usingFixtures={usingFixtures} />
      <FarmGuide />

      {loadError ? (
        <div className="w-full max-w-xl rounded-lg border border-negative/40 bg-negative/10 p-4 text-sm text-negative">
          Couldn&apos;t reach the database: {loadError}
        </div>
      ) : (
        <HomeSearch venues={venues} />
      )}

      <p className="text-xs text-text-muted">Estimates from public data · not financial advice</p>
    </div>
  );
}
