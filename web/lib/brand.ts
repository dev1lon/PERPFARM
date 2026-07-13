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
  /** Wide hero background, shown behind the header on the /<slug> page. */
  background?: string;
}

// The perp NAME is not an asset here -- it's rendered as live text by
// components/PerpName.tsx (bold uppercase wordmark style), the same for every
// perp. Only the logo mark and hero background are per-perp images.
export const BRAND: Record<string, BrandAssets> = {
  hibachi: {
    logo: "logos/hibachi/logo.png",
    background: "logos/hibachi/background.png",
  },
};

export function brandAssets(slug: string): BrandAssets {
  return BRAND[slug] ?? {};
}
