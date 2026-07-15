import { PerpDexLogo } from "@/components/PerpDexLogo";
import { PerpName } from "@/components/PerpName";
import { brandAssets } from "@/lib/brand";

/** A perp's identity lockup, rendered uniformly across the list so every row
 * lines up:
 *   - the flame/logo MARK sits in a fixed-width column (centered), so marks of
 *     different widths still share one vertical line AND every name starts at
 *     the same x (names line up too);
 *   - the mark renders at a fixed HEIGHT (same-size marks) and the NAME at a
 *     fixed HEIGHT (same-size names).
 * Each part falls back independently -- mark -> colored monogram, name ->
 * bold-uppercase text -- so a perp with no brand images still lines up. */
export function PerpIdentity({
  slug,
  name,
  markPx,
  namePx,
  nameClassName = "",
}: {
  slug: string;
  name: string;
  markPx: number;
  namePx: number;
  nameClassName?: string;
}) {
  const { mark, nameImage, markScale, wordmarkOnly } = brandAssets(slug);
  // Fixed column (width + height) so every row lines up and stays an even
  // height regardless of per-perp mark scaling; 1.4 is the max supported scale.
  const colW = Math.round(markPx * 1.7);
  const colH = Math.round(markPx * 1.4);
  const markH = Math.round(markPx * (markScale ?? 1));
  return (
    <span className="flex items-center gap-3">
      <span
        className="flex shrink-0 items-center justify-center"
        style={{ width: colW, height: colH }}
      >
        {wordmarkOnly ? null : mark ? (
          // eslint-disable-next-line @next/next/no-img-element -- static mark from /public
          <img
            src={`/${mark}`}
            alt=""
            aria-hidden
            className="max-h-full max-w-full w-auto"
            style={{ height: markH }}
          />
        ) : (
          <PerpDexLogo slug={slug} name={name} size={markPx} />
        )}
      </span>
      {nameImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- static name from /public
        <img src={`/${nameImage}`} alt={name} className="w-auto shrink-0" style={{ height: namePx }} />
      ) : (
        <PerpName name={name} className={nameClassName} />
      )}
    </span>
  );
}
