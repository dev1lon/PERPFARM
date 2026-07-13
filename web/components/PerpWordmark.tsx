"use client";

import { useState } from "react";
import { PerpName } from "@/components/PerpName";
import { brandAssets } from "@/lib/brand";

/** The perp's name as its own brand wordmark image (unique per-perp font,
 * baked into the image). Falls back to the PerpName text treatment when no
 * wordmark is registered OR the image fails to load -- so a missing/renamed
 * file degrades gracefully instead of showing a broken-image icon. */
export function PerpWordmark({
  slug,
  name,
  imgClassName,
  nameClassName = "",
}: {
  slug: string;
  name: string;
  imgClassName: string;
  nameClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const wordmark = brandAssets(slug).wordmark;

  if (!wordmark || failed) {
    return <PerpName name={name} className={nameClassName} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static wordmark from /public
    <img src={`/${wordmark}`} alt={name} onError={() => setFailed(true)} className={imgClassName} />
  );
}
