/** Colored monogram badge, the fallback mark for a perp with no brand image.
 * The color is a deterministic hash of the slug (not list position) so a given
 * venue keeps its color across re-sorts/filters -- see the dataviz skill's
 * "color follows the entity, never its rank" rule. Hues are the validated
 * categorical palette (references/palette.md), stepped for the dark surface. */

const CATEGORICAL = [
  "#3987e5",
  "#199e70",
  "#c98500",
  "#008300",
  "#9085e9",
  "#e66767",
  "#d55181",
  "#d95926",
];

function slugColorIndex(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return hash % CATEGORICAL.length;
}

export function perpDexBadgeVars(slug: string): React.CSSProperties {
  return { "--pf-badge": CATEGORICAL[slugColorIndex(slug)] } as React.CSSProperties;
}

export function PerpDexLogo({
  slug,
  name,
  size = 32,
}: {
  slug: string;
  name: string;
  size?: number;
}) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="pf-logo-badge flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ ...perpDexBadgeVars(slug), width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}
