import { notFound } from "next/navigation";
import { VenueWizard } from "@/components/VenueWizard";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { PerpIdentity } from "@/components/PerpIdentity";
import { brandAssets, darkBrandGradient } from "@/lib/brand";
import { daysUntil, formatBps, formatDate, formatNumber } from "@/lib/format";
import { getVenueDetail, getVenues } from "@/lib/data-source";
import { MarkdownLite } from "@/lib/markdown-lite";

export const dynamic = "force-dynamic";

export default async function VenuePage({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const [venue, allVenues] = await Promise.all([getVenueDetail(venueSlug), getVenues()]);
  if (!venue) notFound();

  const otherVenues = allVenues.filter((v) => v.slug !== venueSlug);
  const seasonDays = daysUntil(venue.meta?.seasonEndDate ?? null);
  // Full-page DARK brand background (shared recipe with the home card, see
  // darkBrandGradient): the perp's palette hues mixed into its near-black
  // base, top -> bottom, so the page reads as a dark, brand-tinted surface
  // (like the reference Hibachi card) -- keeps white text/dark cards readable.
  const { glow, glowBase } = brandAssets(venueSlug);
  const pageBg = darkBrandGradient(glow, { base: glowBase });
  const glowStyle = pageBg ? { backgroundImage: pageBg } : undefined;

  return (
    <div className="relative min-h-screen">
      {glowStyle && (
        // Covers the whole page (not just the top) so the brand gradient is
        // the page background; pointer-events-none so it never intercepts
        // clicks. Sits behind the content, which is `relative` above it.
        <div aria-hidden className="pointer-events-none absolute inset-0" style={glowStyle} />
      )}
      <div className="relative mx-auto flex max-w-2xl flex-col gap-10 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1>
            <PerpIdentity slug={venueSlug} name={venue.name} markPx={38} namePx={22} nameClassName="text-2xl" />
          </h1>
          {seasonDays !== null && (
            <div className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-right">
              <div className="text-[10px] uppercase tracking-wide text-text-muted">
                {venue.meta?.seasonName ?? "Season"}
              </div>
              <div className="font-mono-num text-sm font-semibold text-text-primary">
                ends in {seasonDays}d
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {venue.meta?.referralLink && (
            <a
              href={venue.meta.referralLink}
              target="_blank"
              rel="noreferrer"
              className="pf-transition text-text-muted hover:text-accent"
            >
              App ↗
            </a>
          )}
          {venue.meta?.twitterUrl && (
            <a
              href={venue.meta.twitterUrl}
              target="_blank"
              rel="noreferrer"
              className="pf-transition text-text-muted hover:text-accent"
            >
              Twitter ↗
            </a>
          )}
          {venue.meta?.docsUrl && (
            <a
              href={venue.meta.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="pf-transition text-text-muted hover:text-accent"
            >
              Docs ↗
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-surface-1 p-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">Points per $1</span>
          <span className="font-mono-num text-xl font-light text-text-primary">
            {formatNumber(venue.pointsProgram?.pointsPerUsdVolumeEstimate ?? null, 2)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">Maker fee</span>
          <span className="font-mono-num text-xl font-light text-text-primary">
            {formatBps(venue.currentFees?.makerBps ?? null)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">Taker fee</span>
          <span className="font-mono-num text-xl font-light text-text-primary">
            {formatBps(venue.currentFees?.takerBps ?? null)}
          </span>
        </div>
        {venue.pointsProgram && (
          <div className="col-span-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-text-muted">
            <ConfidenceBadge confidence={venue.pointsProgram.confidence} />
            <span>verified {formatDate(venue.pointsProgram.lastVerified)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-primary">How points work</h2>
        {venue.pointsProgram ? (
          <MarkdownLite text={venue.pointsProgram.descriptionMd} />
        ) : (
          <p className="text-sm text-text-muted">No points program data yet.</p>
        )}
      </div>

        <VenueWizard venueSlug={venueSlug} otherVenues={otherVenues} />
      </div>
    </div>
  );
}
