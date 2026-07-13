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
  /** Square icon, shown on the badge (home card + perp page header). */
  logo?: string;
  /** The perp's name rendered as an image, shown on the home card in place
   *  of the plain-text name. */
  wordmark?: string;
  /** Wide hero background, shown behind the header on the /<slug> page. */
  background?: string;
}

export const BRAND: Record<string, BrandAssets> = {
  hibachi: {
    logo: "logos/hibachi/logo.png",
    wordmark: "logos/hibachi/wordmark.jpg",
    background: "logos/hibachi/background.png",
  },
};

export function brandAssets(slug: string): BrandAssets {
  return BRAND[slug] ?? {};
}
