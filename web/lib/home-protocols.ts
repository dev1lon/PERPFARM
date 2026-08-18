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

/** Tier S — the large two-up cards with the metric grid. */
export const TIER_S: HomeProtocol[] = [
  { slug: "variational", name: "Variational", season: "Season 1", farmEstimate: "$5–11/pt", otc: "$24", status: "live" },
  { slug: "tradexyz", name: "TradeXYZ", season: "Season 2", status: "records" },
  { slug: "txflow", name: "TxFlow", status: "retro" },
];

/** Early stage — medium cards with a status badge, no metric grid. */
export const EARLY: HomeProtocol[] = [
  { slug: "risex", name: "RiseX", status: "live" },
  { slug: "polymarket", name: "Polymarket", status: "retro-activity" },
  { slug: "qfex", name: "QFEX", status: "retro-activity" },
  { slug: "truenorth", name: "TrueNorth", status: "retro-activity" },
];

/** Radar — compact tiles, name only. */
export const RADAR: HomeProtocol[] = [
  { slug: "hotstuff", name: "HotStuff" },
  { slug: "01exchange", name: "N1" },
  { slug: "bullet", name: "Bullet" },
  { slug: "hibachi", name: "Hibachi" },
  { slug: "extended", name: "Extended" },
  { slug: "pacifica", name: "Pacifica" },
  { slug: "nado", name: "Nado" },
  { slug: "perpl", name: "Perpl" },
  { slug: "reya", name: "Reya" },
  { slug: "ondo", name: "Ondo" },
];

/** Total tracked protocols, for the hero badge. */
export const TRACKED_COUNT = TIER_S.length + EARLY.length + RADAR.length;

/** The full listed catalog (all tiers). Doubles as the web-side slug catalog:
 *  a slug here is a real protocol page even if the DB has no row for it yet
 *  (e.g. venues added after the staging DB was seeded) — the page then shows
 *  the SOON placeholder instead of 404. */
export const ALL_PROTOCOLS: HomeProtocol[] = [...TIER_S, ...EARLY, ...RADAR];

export function findProtocol(slug: string): HomeProtocol | undefined {
  return ALL_PROTOCOLS.find((p) => p.slug === slug);
}
