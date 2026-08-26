"use client";

import { OiCompositionChart } from "@/components/v2/OiCompositionChart";
import { ProtocolPageV2, type ProtocolPageData } from "@/components/v2/ProtocolPageV2";
import type { OiComposition } from "@/lib/oi-composition";
import type { VenueSummary } from "@/lib/types";

/**
 * Variational's protocol page.
 *
 * The layout, wording and controls are the shared reference in
 * `ProtocolPageV2`; Variational's own numbers and guidance live in
 * `lib/protocol-page.ts`. The only thing this file adds is the open-interest
 * composition chart, which is deliberately NOT part of the reference: it is
 * built on Variational's TradFi/crypto split and has no counterpart elsewhere.
 */
export function ProtocolV2({
  otherVenues,
  initial,
  oiComposition,
}: {
  otherVenues: VenueSummary[];
  /** Read on the server with the page; see ProtocolPageData. */
  initial?: ProtocolPageData;
  /** Same idea for the one chart that is not part of the reference layout. */
  oiComposition?: OiComposition | null;
}) {
  return (
    <ProtocolPageV2
      slug="variational"
      otherVenues={otherVenues}
      initial={initial}
      extras={<OiCompositionChart initialData={oiComposition} />}
    />
  );
}
