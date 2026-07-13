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
   *  last. These brand colors are mixed heavily into a near-black (`glowBase`)
   *  to produce a DARK, brand-tinted page background (not a vivid gradient) --
   *  see the render in app/[venueSlug]/page.tsx. */
  glow?: string[];
  /** The near-black the `glow` hues are mixed into (defaults to a warm
   *  near-black). Set to the perp's own dark base for a matching tone --
   *  e.g. Variational's navy-black rather than Hibachi's warm black. */
  glowBase?: string;
}

export const BRAND: Record<string, BrandAssets> = {
  variational: {
    // NOTE: vari/watermark.png is the BLACK-text version (for light
    // backgrounds); its "Variational" text is invisible on our dark site, so
    // it's intentionally not wired as a `wordmark` yet -- the monogram + text
    // fallback is used until a white/on-dark wordmark is provided.
    // brand palette: Blue -> Navy, on the brand's Black base
    glow: ["#4C9AF8", "#1C5BD9"],
    glowBase: "#010612",
  },
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

/** Default warm near-black the brand hues mix into when a perp sets no
 * `glowBase`. */
const DEFAULT_DARK = "#0b0706";

/** Builds the dark, brand-tinted gradient shared by the perp page background
 * (`to bottom`) and the home card (`to right`): each brand hue is mixed
 * heavily into `base` (a near-black), brightest stop first. `end` is the
 * final stop -- defaults to `base`, but the card passes the page background
 * so its right edge blends seamlessly into the page (no visible seam).
 * Returns undefined when the perp has no `glow`. */
export function darkBrandGradient(
  colors: string[] | undefined,
  { direction = "to bottom", base = DEFAULT_DARK, end }: { direction?: string; base?: string; end?: string } = {}
): string | undefined {
  if (!colors?.length) return undefined;
  const stops = colors.map(
    (c, i) => `color-mix(in srgb, ${c} ${Math.max(24 - i * 8, 8)}%, ${base})`
  );
  return `linear-gradient(${direction}, ${stops.join(", ")}, ${end ?? base})`;
}
