"use client";

import { ProtocolPageV2, type ProtocolPageData } from "@/components/v2/ProtocolPageV2";
import type { VenueSummary } from "@/lib/types";

/**
 * TxFlow's protocol page: the same reference layout as every other protocol,
 * with TxFlow's content from `lib/protocol-page.ts`.
 *
 * This used to be a hand-written copy of the Variational page and had drifted:
 * different hero links, a hedge card that badged "Lowest cost" even when the
 * comparison had not loaded, its own FDV and activity panels, and a stale
 * duplicate of an older recommendations block. None of that can recur while
 * both pages render from one component.
 */
export function TxFlowV2({
  otherVenues,
  initial,
}: {
  otherVenues: VenueSummary[];
  /** Read on the server with the page; see ProtocolPageData. */
  initial?: ProtocolPageData;
}) {
  return <ProtocolPageV2 slug="txflow" otherVenues={otherVenues} initial={initial} />;
}
