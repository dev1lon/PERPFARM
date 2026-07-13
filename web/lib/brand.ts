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
  /** Warm radial-glow background for the /<slug> page, in the perp's own
   *  brand colors (like the reference Hibachi calculator site) -- a dark
   *  page with a soft glow behind the header, rendered in pure CSS, no
   *  image. Hex colors from the perp's palette, bright CORE first and
   *  fainter/wider OUTER last; each becomes one radial layer (up to 4). */
  glow?: string[];
}

export const BRAND: Record<string, BrandAssets> = {
  hibachi: {
    logo: "logos/hibachi/logo.png",
    // white flame + "HIBACHI" lockup -- includes the mark, so no separate
    // logo badge is shown next to it
    wordmark: "logos/hibachi/watermark.png",
    // exact brand palette (flame gradient): orange core -> pink -> purple
    glow: ["#FB743F", "#E40E6B", "#4E08BF"],
  },
};

export function brandAssets(slug: string): BrandAssets {
  return BRAND[slug] ?? {};
}
