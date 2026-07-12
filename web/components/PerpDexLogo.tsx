/** Placeholder logo badge, used until real brand assets are supplied per
 * venue. Color is a deterministic hash of the slug (not list position) so a
 * given venue keeps its color across re-sorts/filters -- see the dataviz
 * skill's "color follows the entity, never its rank" rule. Hues are the
 * validated categorical palette (references/palette.md), one array per
 * theme since the palette itself is theme-stepped, not just re-tinted. */

const CATEGORICAL_LIGHT = [
  "#2a78d6",
  "#1baf7a",
  "#eda100",
  "#008300",
  "#4a3aa7",
  "#e34948",
  "#e87ba4",
  "#eb6834",
];

const CATEGORICAL_DARK = [
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
  return hash % CATEGORICAL_LIGHT.length;
}

export function perpDexBadgeVars(slug: string): React.CSSProperties {
  const i = slugColorIndex(slug);
  return {
    "--pf-badge-light": CATEGORICAL_LIGHT[i],
    "--pf-badge-dark": CATEGORICAL_DARK[i],
  } as React.CSSProperties;
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
