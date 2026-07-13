import { PerpDexLogo } from "@/components/PerpDexLogo";
import { PerpName } from "@/components/PerpName";
import { brandAssets } from "@/lib/brand";

/** A perp's identity lockup rendered for uniformity across the list: the
 * flame/logo MARK at a fixed height (so every perp's mark is the same size and
 * on the same line) followed by the NAME at a fixed height (so every perp's
 * name is the same size). Both come from per-perp brand images (split +
 * trimmed from the wordmark); each independently falls back -- mark -> colored
 * monogram, name -> bold-uppercase text -- so a perp with no assets still
 * lines up with the branded ones. */
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
  const { mark, nameImage } = brandAssets(slug);
  return (
    <span className="flex items-center gap-2.5">
      {mark ? (
        // eslint-disable-next-line @next/next/no-img-element -- static mark from /public
        <img src={`/${mark}`} alt="" aria-hidden className="w-auto shrink-0" style={{ height: markPx }} />
      ) : (
        <PerpDexLogo slug={slug} name={name} size={markPx} />
      )}
      {nameImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- static name from /public
        <img src={`/${nameImage}`} alt={name} className="w-auto shrink-0" style={{ height: namePx }} />
      ) : (
        <PerpName name={name} className={nameClassName} />
      )}
    </span>
  );
}
