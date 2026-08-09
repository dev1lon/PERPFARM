"use client";

import { OiCompositionChart } from "@/components/v2/OiCompositionChart";
import { ProtocolPageV2 } from "@/components/v2/ProtocolPageV2";
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
export function ProtocolV2({ otherVenues }: { otherVenues: VenueSummary[] }) {
  return <ProtocolPageV2 slug="variational" otherVenues={otherVenues} extras={<OiCompositionChart />} />;
}
