/**
 * What each instrument IS, not merely whether it is TradFi.
 *
 * We do not decide what counts as what — the protocol does. Two sources feed
 * this file, in that order of authority:
 *
 *   1. `markets.asset_class`, the class a venue publishes about its own market
 *      (QFEX exposes it as `product_category`). A venue's statement about its
 *      own listing always wins; see `instrumentClass` below.
 *   2. This curated map, for venues whose feed carries no class field at all —
 *      Variational's stats feed is one. It mirrors the venue's published RWA
 *      market list (docs.variational.io/omni/trading/rwa-perpetuals) and the
 *      instrument names in its public feed, which identify each listing as a
 *      company, ETF or commodity ("Apple Inc.", "iShares MSCI Japan ETF",
 *      "Brent Oil").
 *
 * Anything neither source classifies is crypto. That is the honest default
 * here: these are perp DEXes, so an unlabelled market is a token, and a
 * missing label must never read as a missing market.
 *
 * Tokenised commodities stay OUT of the TradFi classes: PAXG ("PAX Gold") and
 * XAUT ("Tether Gold") are crypto tokens and carry no TradFi tag in the
 * venue's own UI, unlike XAU ("Gold") which does. Likewise crypto projects
 * with company-shaped names (SynFutures, Trust Wallet, Giggle Fund).
 *
 * The curated map must be refreshed when new markets list — re-check names in
 * the feed against the RWA docs page.
 */

/** Every class the interface can badge. */
export type InstrumentClass = "equity" | "index" | "commodity" | "fx" | "prelisting" | "crypto";

const EQUITY = new Set([
  // Variational's RWA equities.
  "AAOI", "AAPL", "ALAB", "AMD", "AMZN", "ARM", "AVGO", "BABA", "BBX", "BMNR", "BNC", "BOT",
  "BRKB", "BX", "CBRS", "COIN", "COST", "CRCL", "CRM", "CRWD", "DELL", "DIS", "EBAY", "FWDI",
  "GME", "GOOGL", "HD", "HIMS", "HOOD", "HPE", "IBM", "INTC", "IREN", "JPM", "LITE", "LLY",
  "META", "MRVL", "MSFT", "MSTR", "MU", "NFLX", "NOK", "NVDA", "NVO", "ORCL", "PAYP", "PLTR",
  "QCOM", "RIVN", "RKLB", "SHAZ", "SKHY", "SNDK", "SNOW", "SONY", "STRC", "STXX", "TSLA", "TSM",
  "TTWO", "UBER", "USAR", "VISA", "WEN", "WMT", "ZM",

  // QFEX files these under EQUITY. Its own classification, kept verbatim --
  // including COPX, a miners ETF the venue files with the single names. QFEX
  // also files USDE (Ethena's stablecoin) under EQUITY; that one stays out,
  // the same way tokenised gold does.
  "ABCL", "ABSI", "ADEA", "AEHR", "ALNT", "ASST", "ASTS", "AXTI", "B", "BA", "BB", "BE",
  "BFLY", "BMNP", "BRK.B", "CAT", "CCXI", "CGNX", "CHYM", "CIEN", "CIFR", "COHR", "COPX",
  "CRDO", "CRON", "CRWV", "CVNA", "CYPH", "DGXX", "DXYZ", "FCEL", "FLEX", "GD", "GLW",
  "GLXY", "GRAB", "GRND", "GS", "HUBS", "HUT", "HYUNDAI", "ILMN", "IONQ", "IOVA", "JBL",
  "KEEL", "LMT", "LPTH", "LRCX", "LSCC", "MITK", "MRNA", "MTCH", "MX", "NBR", "NCLD",
  "NEM", "NOC", "NOW", "NUAI", "NVTS", "OUST", "PANW", "PENG", "PL", "PLUG", "QURE",
  "RCAT", "RDCM", "RDDT", "RDW", "RIOT", "RSP", "RTX", "SAMSUNG", "SBET", "SERV", "SIVE",
  "SKHYNIX", "SKM", "SMCI", "SMH", "SPCE", "SUIG", "TE", "TEM", "TMO", "VCX", "WDC",
  "WOLF", "WPM", "WULF", "WYFI", "XOM", "ZBRA",

  // Single names listed by the smaller venues and by nobody in the two
  // universes above: ASML on Polymarket, GoPro on Entropy.
  "ASML", "GPRO",
]);

/**
 * Companies trading before they list. A share, but not a listed one.
 *
 * ANTH and OAI are Entropy's tickers for the two Variational spells out.
 */
const PRELISTING = new Set(["ANTH", "ANTHROPIC", "NBIS", "OAI", "OPENAI", "QNTX"]);

const INDEX = new Set([
  "DRAM", "EWJ", "EWT", "EWY", "EWZ", "IWM", "KSTR", "QQQ", "SOXL", "SPCX", "URNM", "US500",
  "UVXY", "XBI", "XLE",
  // QFEX's indices and sector ETFs.
  "HSI", "IGV", "KOSPI", "NIKKEI", "TAIEX", "US100", "XLF",
  // The same instruments under the other venues' spellings. This map was built
  // from Variational's and QFEX's universes, so every venue that names the S&P
  // differently fell straight through to crypto: TxFlow and RiseX list SPY,
  // Polymarket lists SP500 and NAS100. Same drift the cross-venue matcher
  // already warns about ("SKHY" vs "SKHYNIX") -- one instrument, several
  // tickers, and a lookup that only knows one of them.
  "NAS100", "SOXS", "SP500", "SPY",
]);

const COMMODITY = new Set([
  // Spot and futures, not tokenised.
  "BZ", "CL", "COPPER", "NATGAS", "XAG", "XAU", "XPD", "XPT",
  // QFEX spells the metals out.
  "GOLD", "SILVER", "URANIUM",
  // Polymarket spells the two crude benchmarks out; Variational calls the same
  // contracts CL and BZ.
  "BRENTOIL", "WTIOIL",
]);

/**
 * Currency pairs. Deliberately thin: the venue that lists FX (QFEX) publishes
 * `product_category: "FX"` per market, so those rows are classed from the
 * venue's own answer and never need to appear here. Entries below cover a
 * venue that lists a currency without saying so.
 */
const FX = new Set(["AUDUSD", "EURUSD", "GBPUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"]);

/* Order is for readability only; the sets do not overlap. */
const CURATED: ReadonlyArray<readonly [InstrumentClass, ReadonlySet<string>]> = [
  ["equity", EQUITY],
  ["prelisting", PRELISTING],
  ["index", INDEX],
  ["commodity", COMMODITY],
  ["fx", FX],
];

/**
 * Every instrument the curated map calls something other than crypto.
 *
 * Derived rather than written twice: the TradFi universe and the per-class
 * breakdown are the same list, and keeping both by hand is how they drift.
 */
export const TRADFI_TICKERS = new Set(CURATED.flatMap(([, set]) => [...set]));

/** Array form for SQL parameters (`pair = ANY($1)`). */
export const TRADFI_TICKER_LIST = [...TRADFI_TICKERS];

/**
 * Instruments the protocols disagree about. TxFlow lists tokenised gold (XAUT)
 * inside its TradFi market set; Variational carries no TradFi tag on it.
 *
 * We resolve a disagreement in favour of TradFi rather than per-venue, because
 * the alternative is worse than either answer: classification used to depend on
 * the `venueSlug` of whichever page the user happened to open, so the SAME
 * instrument in the SAME cross-protocol route was TradFi when starting from
 * TxFlow and crypto when starting from Variational.
 */
const TRADFI_BY_AT_LEAST_ONE_PROTOCOL = new Map<string, InstrumentClass>([["XAUT", "commodity"]]);

/** How a venue's own `product_category` maps onto our classes. */
const VENUE_CLASS: Record<string, InstrumentClass> = {
  EQUITY: "equity",
  STOCK: "equity",
  INDEX: "index",
  COMMODITY: "commodity",
  METAL: "commodity",
  FX: "fx",
  FOREX: "fx",
  CRYPTO: "crypto",
  PERP: "crypto",
};

/**
 * What this instrument is.
 *
 * `venueAssetClass` is the class the venue publishes for its own market
 * (`markets.asset_class`), and it wins whenever it is present and recognised:
 * a venue describing its own listing outranks a list we maintain by hand.
 * Unrecognised strings fall through to the curated map rather than inventing a
 * class, so a new product line shows up as whatever we already knew instead of
 * as a label nobody can read.
 */
export function instrumentClass(symbol: string, venueAssetClass?: string | null): InstrumentClass {
  if (venueAssetClass) {
    const known = VENUE_CLASS[venueAssetClass.trim().toUpperCase()];
    if (known) return known;
  }
  for (const [name, set] of CURATED) if (set.has(symbol)) return name;
  return TRADFI_BY_AT_LEAST_ONE_PROTOCOL.get(symbol) ?? "crypto";
}

/**
 * Whether an instrument is a TradFi market. A property of the instrument, not
 * of the venue the question was asked from.
 *
 * Kept separate from `instrumentClass` because it answers a different
 * question: competition eligibility and the "Only TradFi" filter care about
 * the boundary, not about which side of it an instrument sits on.
 */
export function isTradfiMarket(symbol: string): boolean {
  return TRADFI_TICKERS.has(symbol) || TRADFI_BY_AT_LEAST_ONE_PROTOCOL.has(symbol);
}
