/**
 * Per-perp brand assets. Files live under web/public/logos/<slug>/ (see the
 * README there). This map is the single source of truth for which assets
 * exist -- an explicit registry, not a runtime file probe, so server and
 * client components resolve identically and a missing file degrades to the
 * colored-monogram / plain-text fallbacks instead of a broken-image icon.
 *
 * To add a perp's branding: drop the files, then add one entry here. Paths
 * are relative to /public (no leading slash needed when passed to <img src>
 * via `/${path}`), and every field is optional -- provide only what exists.
 */

export interface BrandAssets {
  /** Square icon. Shown on the badge only when there's no `wordmark` -- when
   *  a wordmark exists it stands alone (the "remove the logo before the
   *  text" rule). */
  logo?: string;
  /** The perp's name as a brand image in its own unique font. When present,
   *  it replaces both the logo badge and the plain-text name on the home
   *  card. Falls back to PerpName text if the file fails to load. */
  wordmark?: string;
  /** Full-page background hues for the /<slug> page, TOP first to BOTTOM
   *  last. These warm brand colors are mixed heavily into a near-black to
   *  produce a DARK, warm-tinted page background (not a vivid gradient) --
   *  see the render in app/[venueSlug]/page.tsx. */
  glow?: string[];
}

export const BRAND: Record<string, BrandAssets> = {
  hibachi: {
    logo: "logos/hibachi/logo.png",
    // white flame + "HIBACHI" lockup -- includes the mark, so no separate
    // logo badge is shown next to it
    wordmark: "logos/hibachi/watermark.png",
    // brand's warm "left" swatch (orange -> red), darkened into the page bg
    glow: ["#FB743F", "#FE344A"],
  },
};

export function brandAssets(slug: string): BrandAssets {
  return BRAND[slug] ?? {};
}
