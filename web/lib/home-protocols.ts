/**
 * MANUAL home-page protocol config for the v2 redesign. These are hand-edited
 * display fields — the site never computes point value or farm cost (that stays
 * the user's manual/OTC knowledge). Live metrics (OI, volume, spread) come from
 * the data source; only the values below are curated by hand here.
 *
 * Tier assignment, season label, farm-estimate range and OTC point price are
 * all manual. Leave a field undefined to render "—".
 * `status` drives the badge (live = emerald, others = amber/neutral).
 */

export type PointsStatus =
  | "live"
  | "teased"
  | "retro"
  | "records"
  | "retro-activity"
  | "mainnet"
  | "ended";

export interface HomeProtocol {
  slug: string;
  name: string;
  /** Season / epoch label under the name on large cards. */
  season?: string;
  /** Manual farm-cost range, e.g. "$5–11/pt". Never computed. */
  farmEstimate?: string;
  /** Manual OTC point price, e.g. "$21". Never computed. */
  otc?: string;
  /** Manual points-program status. */
  status?: PointsStatus;
}

/** Tier S — what is worth farming now. */
export const TIER_S: HomeProtocol[] = [
  { slug: "variational", name: "Variational", season: "Season 1", farmEstimate: "$6–15/pt", otc: "$24", status: "live" },
  { slug: "tradexyz", name: "TradeXYZ", season: "Season 0", farmEstimate: "from $6/100k volume", status: "records" },
  { slug: "txflow", name: "TxFlow", season: "Season 0", farmEstimate: "from $29/100k volume", status: "retro" },
  { slug: "truenorth", name: "TrueNorth", season: "Season 0", status: "retro-activity" },
  { slug: "qfex", name: "QFEX", season: "Season 0", farmEstimate: "from $43/100k volume", status: "retro" },
];

/** Tier A — worth farming, one rung down. Same card as Tier S: a protocol
 *  without a points programme yet still has to say so in the same words, and a
 *  smaller card could not. */
export const EARLY: HomeProtocol[] = [
  { slug: "risex", name: "RiseX", season: "Season 1", farmEstimate: "$1–2/pt", status: "live" },
  { slug: "polymarket", name: "Polymarket", season: "Season 0", farmEstimate: "from $28/100k volume", status: "retro-activity" },
  // Perps on private-market assets (pre-IPO names), not the crypto majors.
  // Carded like QFEX: a season, retro points expected.
  { slug: "entropy", name: "Entropy", season: "Season 0", farmEstimate: "from $78/100k volume", status: "retro" },
  // Priced since 2026-09-10; Hibachi runs a points programme
  // (docs.hibachi.xyz/hibachi-rewards/hibachi-points).
  { slug: "hibachi", name: "Hibachi", season: "Season PLAYOFFS (4)", farmEstimate: "from $27/100k volume", status: "live" },
  // Lighter on Robinhood Chain, priced since 2026-09-11. Runs live points (its
  // API serves an account's "RH live points"); no season or cost measured yet.
  { slug: "lighterrh", name: "Lighter RH", season: "Season 1", status: "live" },
];

/**
 * Listed in the catalog but NOT shown on the home page (the "Soon" row was
 * removed on 2026-09-11) and not counted as tracked.
 *
 * Kept rather than deleted because the catalog does more than draw the home
 * page: `protocolName` reads a venue's display name from here, and Nado is a
 * priced hedge venue -- dropping its entry would hide it from every hedge
 * picker. The others keep their existing links resolving.
 */
export const RADAR: HomeProtocol[] = [
  { slug: "hotstuff", name: "HotStuff" },
  { slug: "01exchange", name: "N1" },
  { slug: "extended", name: "Extended" },
  { slug: "pacifica", name: "Pacifica" },
  { slug: "nado", name: "Nado" },
  { slug: "ondo", name: "Ondo" },
];

/** Tracked protocols for the hero badge: the two tiers the home page shows. */
export const TRACKED_COUNT = TIER_S.length + EARLY.length;

/** The full listed catalog (all tiers). Doubles as the web-side slug catalog:
 *  a slug here is a real protocol page even if the DB has no row for it yet
 *  (e.g. venues added after the staging DB was seeded) — the page then shows
 *  the SOON placeholder instead of 404. */
export const ALL_PROTOCOLS: HomeProtocol[] = [...TIER_S, ...EARLY, ...RADAR];

export function findProtocol(slug: string): HomeProtocol | undefined {
  return ALL_PROTOCOLS.find((p) => p.slug === slug);
}
