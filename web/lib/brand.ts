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
  /** The perp's flame/logo MARK, split out of its wordmark and trimmed.
   *  Rendered in a fixed-size column so every perp's mark shares one line and
   *  names all start at the same x. Falls back to the colored monogram. */
  mark?: string;
  /** Optional per-perp size multiplier for the mark, to visually match marks
   *  of different aspect ratios (a narrow tall flame looks smaller than a wide
   *  one at the same height). Default 1; capped by the column so rows stay an
   *  even height. */
  markScale?: number;
  /** The perp's NAME as a brand image (its unique font), split out of its
   *  wordmark and trimmed. Rendered at a fixed HEIGHT so every perp's name is
   *  the same size. Falls back to PerpName text when absent. */
  nameImage?: string;
  /** Set when `nameImage` is the COMPLETE lockup (icon + text together) rather
   *  than just the name -- e.g. "trade[XYZ]" already contains its symbol, so a
   *  separate mark would read as a duplicate. The mark column is left empty
   *  (kept for row alignment) and only the wordmark renders. */
  wordmarkOnly?: boolean;
  /** Full-page background hues for the /<slug> page, TOP first to BOTTOM
   *  last. These brand colors are mixed heavily into a near-black (`glowBase`)
   *  to produce a DARK, brand-tinted page background (not a vivid gradient) --
   *  see the render in app/[venueSlug]/page.tsx. */
  glow?: string[];
  /** The near-black the `glow` hues are mixed into (defaults to a warm
   *  near-black). Set to the perp's own dark base for a matching tone --
   *  e.g. Variational's navy-black rather than Hibachi's warm black. */
  glowBase?: string;
  /** An actual brand background IMAGE (path under /public) used as the page +
   *  card background (center/cover), instead of the `glow` color gradient --
   *  for perps that ship a designed background rather than a flat palette. */
  backgroundImage?: string;
  /** A raw CSS `background` value (e.g. a hand-tuned radial-gradient matching
   *  the brand's designed background) -- crisp at any size, no image
   *  compression. Highest precedence. */
  backgroundCss?: string;
  /** Luminance of the brand background. Most brands ship a DARK background, so
   *  bg-level text (header links, headings, the home-card metrics) stays light
   *  by default. A few brands ship a near-white designed background (e.g. Nado)
   *  -- set "light" so that bg-level text flips to dark and stays readable.
   *  Inner surface panels keep their own dark styling regardless. */
  bgTone?: "light" | "dark";
}

export const BRAND: Record<string, BrandAssets> = {
  variational: {
    mark: "logos/vari/mark.png",
    nameImage: "logos/vari/name.png",
    // brand palette: Blue -> Navy, on the brand's Black base
    glow: ["#4C9AF8", "#1C5BD9"],
    glowBase: "#010612",
  },
  hibachi: {
    mark: "logos/hibachi/mark.png",
    // narrow tall flame -> scale up so it reads as big as wider marks
    markScale: 1.4,
    nameImage: "logos/hibachi/name.png",
    // brand's warm "left" swatch (orange -> red), darkened into the page bg
    glow: ["#FB743F", "#FE344A"],
  },
  pacifica: {
    mark: "logos/pacifica/mark.png",
    nameImage: "logos/pacifica/name.png",
    // exact flat background color sampled 1:1 from the brand's dark-bg asset
    glow: ["#0E1724"],
    glowBase: "#0E1724",
  },
  txflow: {
    mark: "logos/txflow/mark.png",
    nameImage: "logos/txflow/name.png",
    // flat dark olive-black background (per the requested swatch)
    glow: ["#0D0F05"],
    glowBase: "#0D0F05",
  },
  extended: {
    mark: "logos/extended/mark.png",
    nameImage: "logos/extended/name.png",
    // brand's designed background reproduced as a crisp CSS gradient (colors
    // sampled from the source PNG: near-black with a dark-green glow in the
    // bottom-right corner) -- no raster, so no compression blocking.
    backgroundCss:
      "radial-gradient(135% 125% at 100% 100%, #0a6044 0%, #03301f 26%, #02130d 50%, #010101 78%)",
  },
  "01exchange": {
    mark: "logos/01/mark.png",
    nameImage: "logos/01/name.png",
    // flat #070C18 exactly, per the brand guidelines
    glow: ["#070C18"],
    glowBase: "#070C18",
  },
  hotstuff: {
    mark: "logos/hotstuff/mark.png",
    nameImage: "logos/hotstuff/name.png",
    // flat pure black, per request (the brand's photo bg was not wanted)
    backgroundCss: "#000000",
  },
  polymarket: {
    mark: "logos/polymarket/mark.png",
    nameImage: "logos/polymarket/name.png",
    // flat "Poly Blue" exactly, per the brand swatch
    backgroundCss: "#2E5CFF",
  },
  perpl: {
    mark: "logos/perpl/mark.png",
    nameImage: "logos/perpl/name.png",
    // brand's designed purple "Perpl" pattern background
    backgroundImage: "logos/perpl/background.webp",
  },
  nado: {
    mark: "logos/nado/mark.png",
    nameImage: "logos/nado/name.png",
    // flat dark charcoal sampled 1:1 from the brand's dark-bg wordmark
    backgroundCss: "#1E1E1E",
  },
  reya: {
    mark: "logos/reya/mark.png",
    nameImage: "logos/reya/name.png",
    // brand's dark "mirror" hero photo
    backgroundImage: "logos/reya/background.jpg",
  },
  tradexyz: {
    // the wordmark already contains the "[XYZ]" symbol, so no separate mark
    nameImage: "logos/tradexyz/name.png",
    wordmarkOnly: true,
    // flat navy sampled 1:1 from the brand's wordmark background
    backgroundCss: "#232F43",
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

/** Home-card background for a branded perp: the SAME dark brand gradient as
 * that perp's /<slug> page (warm for Hibachi, navy for Variational), so the
 * card reads as an immersive slice of the page rather than a tinted panel.
 * The card is rendered borderless (see HomeSearch) so this gradient's edges
 * blend into the page with no seam line. Undefined for perps with no glow. */
export function cardBrandBg(slug: string): string | undefined {
  const { glow, glowBase } = brandAssets(slug);
  return darkBrandGradient(glow, { base: glowBase });
}

/** The `background` shorthand for a perp's page + home card: the brand
 * background IMAGE (center/cover) when the perp ships one, else the dark
 * brand color gradient. Same value for both surfaces, so the card reads as a
 * slice of the page. Undefined for perps with no brand background at all. */
export function brandBg(slug: string): string | undefined {
  const { backgroundCss, backgroundImage } = brandAssets(slug);
  if (backgroundCss) return backgroundCss;
  if (backgroundImage) return `url(/${backgroundImage}) center / cover no-repeat`;
  return cardBrandBg(slug);
}

/** Luminance of a perp's brand background: "dark" (default) or "light" for the
 * few brands that ship a near-white designed background. Callers use it to
 * pick a readable color for text drawn directly on the brand background. */
export function brandBgTone(slug: string): "light" | "dark" {
  return brandAssets(slug).bgTone ?? "dark";
}
