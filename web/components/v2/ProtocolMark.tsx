import { brandAssets } from "@/lib/brand";
import { PerpDexLogo } from "@/components/PerpDexLogo";

/** A protocol's real logo inside the one uniform tile every protocol shares
 *  (design "logo tile rules"). Falls back to the colored monogram. Shared by
 *  the v2 Home and protocol pages. */
export function ProtocolMark({
  slug,
  name,
  size,
  radius,
}: {
  slug: string;
  name: string;
  size: number;
  radius: number;
}) {
  const { mark, markScale, invertMarkOnLight } = brandAssets(slug);
  return (
    <span
      className="flex shrink-0 items-center justify-center border border-border bg-surface-2"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {mark ? (
        // eslint-disable-next-line @next/next/no-img-element -- static mark from /public
        <img
          src={`/${mark}`}
          alt=""
          aria-hidden
          className={`w-auto${invertMarkOnLight ? " pf-mark-invert-on-light" : ""}`}
          style={{
            height: Math.round(size * 0.58 * (markScale ?? 1)),
            maxWidth: Math.round(size * 0.7),
            maxHeight: Math.round(size * 0.66),
          }}
        />
      ) : (
        <PerpDexLogo slug={slug} name={name} size={Math.round(size * 0.62)} />
      )}
    </span>
  );
}
