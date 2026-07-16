import { notFound } from "next/navigation";
import { VenueWizard } from "@/components/VenueWizard";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { PerpIdentity } from "@/components/PerpIdentity";
import { brandBg, brandBgTone } from "@/lib/brand";
import { daysUntil, formatBps, formatDate, formatNumber } from "@/lib/format";
import { getVenueDetail, getVenues } from "@/lib/data-source";
import { MarkdownLite } from "@/lib/markdown-lite";
import { isReadyVenue } from "@/lib/venue-status";

export const dynamic = "force-dynamic";

export default async function VenuePage({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const [venue, allVenues] = await Promise.all([getVenueDetail(venueSlug), getVenues()]);
  if (!venue) notFound();

  const ready = isReadyVenue(venueSlug);
  const otherVenues = allVenues.filter((v) => v.slug !== venueSlug && isReadyVenue(v.slug));
  const seasonDays = daysUntil(venue.meta?.seasonEndDate ?? null);
  // Full-page brand background: the perp's designed background image, or its
  // dark brand color gradient -- covers the whole page so the card on the home
  // list reads as a slice of it. Kept behind the content (which is `relative`).
  const pageBg = brandBg(venueSlug);
  // Text drawn directly on the brand page background must contrast the BRAND
  // (fixed, theme-independent) tone, not the site theme -- else light theme
  // turns it dark and it vanishes on a dark brand bg. Inner surface panels keep
  // their own themed styling. Venues with no brand bg use plain theme tokens.
  const branded = pageBg !== undefined;
  const lightBg = branded && brandBgTone(venueSlug) === "light";
  const onBg = branded ? (lightBg ? "text-[#0b1220]" : "text-white") : "text-text-primary";
  const onBgMuted = branded ? (lightBg ? "text-[#454e64]" : "text-[#aab2c5]") : "text-text-muted";
  const onBgLink = branded
    ? lightBg
      ? "text-[#454e64] hover:text-[#0b1220]"
      : "text-[#aab2c5] hover:text-white"
    : "text-text-muted hover:text-accent";

  return (
    <div className="relative min-h-screen">
      {pageBg && (
        // pointer-events-none so it never intercepts clicks; behind content.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: pageBg }}
        />
      )}
      <div className="relative mx-auto flex max-w-2xl flex-col gap-10 px-4 pt-10 pb-16 sm:px-6">
        <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1>
            <PerpIdentity slug={venueSlug} name={venue.name} markPx={38} namePx={22} nameClassName="text-2xl" />
          </h1>
          <div className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-right">
            <div className="text-[10px] uppercase tracking-wide text-text-muted">
              {ready && venue.meta?.seasonName ? venue.meta.seasonName : "Season"}
            </div>
            <div className="font-mono-num text-sm font-semibold text-text-primary">
              {ready && seasonDays !== null ? `ends in ${seasonDays}d` : "SOON"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {venue.meta?.referralLink && (
            <a
              href={venue.meta.referralLink}
              target="_blank"
              rel="noreferrer"
              className={`pf-transition ${onBgLink}`}
            >
              App ↗
            </a>
          )}
          {venue.meta?.twitterUrl && (
            <a
              href={venue.meta.twitterUrl}
              target="_blank"
              rel="noreferrer"
              className={`pf-transition ${onBgLink}`}
            >
              Twitter ↗
            </a>
          )}
          {venue.meta?.docsUrl && (
            <a
              href={venue.meta.docsUrl}
              target="_blank"
              rel="noreferrer"
              className={`pf-transition ${onBgLink}`}
            >
              Docs ↗
            </a>
          )}
        </div>
      </div>

      {!ready ? (
        <section className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface-1 p-6 text-center">
          <p className="font-mono-num text-5xl font-semibold tracking-[0.22em] text-text-primary">SOON</p>
          <p className="max-w-sm text-sm text-text-muted">
            We are verifying this perp-dex before publishing routes, fees, or point estimates.
          </p>
        </section>
      ) : (
        <>
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
        <h2 className={`text-sm font-medium ${onBg}`}>How points work</h2>
        {venue.pointsProgram ? (
          <MarkdownLite text={venue.pointsProgram.descriptionMd} className={onBgMuted} />
        ) : (
          <p className={`text-sm ${onBgMuted}`}>SOON</p>
        )}
      </div>

        {venueSlug === "variational" && (
          <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5">
            <div>
              <h2 className="text-sm font-medium text-text-primary">PerpFarm planning estimate</h2>
              <p className="mt-1 text-sm text-text-muted">
                Manual estimate, not a published point-emission formula.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="font-mono-num text-xl text-text-primary">$5–7 / pt</p>
                <p className="text-xs text-text-muted">medium OI, 12–24h hold</p>
              </div>
              <div>
                <p className="font-mono-num text-xl text-text-primary">~$11 / pt</p>
                <p className="text-xs text-text-muted">XAU, 1–2h hold</p>
              </div>
              <div>
                <p className="font-mono-num text-xl text-text-primary">0 bps</p>
                <p className="text-xs text-text-muted">published Omni trading fee</p>
              </div>
            </div>
            <p className="text-xs text-text-muted">
              Short XAU holds are more expensive per point but target faster point accumulation. We do not
              publish a calculated route score until Omni publishes a verifiable points-per-volume formula.
            </p>
          </section>
        )}

        {venueSlug === "variational" && (
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-text-primary">Trading competition</h2>
              <span className="rounded-sm bg-surface-2 px-2 py-1 font-mono-num text-xs text-text-muted">
                INACTIVE
              </span>
            </div>
            <p className="text-sm text-text-muted">
              The latest RWA competition ended on July 13. PerpFarm&apos;s operating rule is to join an
              active competition before running its plan. Variational also distributed an additional 20,000
              points to competitors, proportional to TradFi-market volume; those points and the $20,000 USDC
              prize pool are excluded from cost-per-point estimates.
            </p>
            <p className="text-xs text-text-muted">
              Leaderboard eligibility required $250k of TradFi notional; prizes require KYC. Variational
              can disqualify self-transactions, matched trading, or multi-account farming.
            </p>
            <a
              href="https://docs.variational.io/omni/trading-competition"
              target="_blank"
              rel="noreferrer"
              className="w-fit text-xs text-accent hover:text-accent-hover"
            >
              Competition rules ↗
            </a>
            <a
              href="https://x.com/variational_io/status/2077147392764510582"
              target="_blank"
              rel="noreferrer"
              className="w-fit text-xs text-accent hover:text-accent-hover"
            >
              20,000-point distribution announcement ↗
            </a>
          </section>
        )}

        <VenueWizard venueSlug={venueSlug} otherVenues={otherVenues} />
        </>
      )}
      </div>
    </div>
  );
}
