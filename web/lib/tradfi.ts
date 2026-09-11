/**
 * What each instrument IS, not merely whether it is TradFi.
 *
 * One answer per instrument, whichever venue lists it. Two sources feed this
 * file, in this order of authority:
 *
 *   1. This curated map, checked against each venue's own interface and docs
 *      (Variational's RWA list and tags, trade.xyz's specification index,
 *      Entropy's and Polymarket's catalogs). It wins, because venue feeds are
 *      coarse: QFEX's `product_category` is EQUITY for a pre-IPO name and an
 *      ETF alike. See `instrumentClass` below.
 *   2. `markets.asset_class`, the class a venue publishes about its own market,
 *      for anything the map has not reached yet.
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
  // Texas Instruments, listed after the rest and filed as crypto until it was
  // checked against Variational's Equities tab (2026-09-10). GoPro (GPRO,
  // below) sits under "Indices" in that same interface, but Variational's own
  // feed names it "GoPro, Inc." -- a share, like every other venue has it.
  "TXN",

  // QFEX files these under EQUITY. The ETFs it files there too (COPX, NCLD,
  // RSP, SMH) are listed with the indices instead, and USDE (Ethena's
  // stablecoin, also under EQUITY) stays out the same way tokenised gold does.
  "ABCL", "ABSI", "ADEA", "AEHR", "ALNT", "ASST", "ASTS", "AXTI", "B", "BA", "BB", "BE",
  "BFLY", "BMNP", "BRK.B", "CAT", "CCXI", "CGNX", "CHYM", "CIEN", "CIFR", "COHR",
  "CRDO", "CRON", "CRWV", "CVNA", "CYPH", "DGXX", "DXYZ", "FCEL", "FLEX", "GD", "GLW",
  "GLXY", "GRAB", "GRND", "GS", "HUBS", "HUT", "HYUNDAI", "ILMN", "IONQ", "IOVA", "JBL",
  "KEEL", "LMT", "LPTH", "LRCX", "LSCC", "MITK", "MRNA", "MTCH", "MX", "NBR",
  "NEM", "NOC", "NOW", "NUAI", "NVTS", "OUST", "PANW", "PENG", "PL", "PLUG", "QURE",
  "RCAT", "RDCM", "RDDT", "RDW", "RIOT", "RTX", "SAMSUNG", "SBET", "SERV", "SIVE",
  "SKHYNIX", "SKM", "SMCI", "SPCE", "SUIG", "TE", "TEM", "TMO", "VCX", "WDC",
  "WOLF", "WPM", "WULF", "WYFI", "XOM", "ZBRA",

  // Single names listed by the smaller venues and by nobody in the two
  // universes above: ASML on Polymarket, GoPro on Entropy.
  "ASML", "GPRO",

  // trade.xyz's listed single names that no curated venue above spells the
  // same way (docs.trade.xyz specification index). SKHX and SMSN are its
  // tickers for SK hynix and Samsung common shares; PURRDAT is Hyperliquid
  // Strategies (Nasdaq: PURR); BIRD is Smartbird. MiniMax and Zhipu list in
  // Hong Kong, so they are shares here, not pre-IPO names. QNT is left out on
  // purpose: on trade.xyz it is pre-IPO Quantinuum, but Variational lists QNT
  // as the Quant token, and one ticker cannot be both in a shared map.
  "AMAT", "BIRD", "DKNG", "GEV", "GIGADEV", "KIOXIA", "MINIMAX", "NET", "PURRDAT",
  "SKHX", "SMSN", "SOFTBANK", "ZHIPU",

  // Listed shares that were filed elsewhere before (checked 2026-09-10 against
  // each venue's own labels): Nebius (Nasdaq: NBIS) and Quantinuum (Nasdaq:
  // QNT; Variational's QNTX, "Class A Common Stock") are tagged TradFi, not
  // Pre-IPO, on Variational and "Stocks" in trade.xyz's catalog; SPCX is
  // SpaceX (Nasdaq: SPCX) on every venue that lists it, not an index. Cisco and
  // Teradyne are Variational listings the map had not reached. CXMT and
  // UNITREE trade as shares on every venue that labels them (Polymarket
  // "equity", trade.xyz "Stocks", QFEX quoting them in yuan), not pre-IPO.
  "CSCO", "CXMT", "NBIS", "QNTX", "SPCX", "TER", "UNITREE",
]);

/**
 * Companies trading before they list. A share, but not a listed one.
 *
 * ANTH and OAI are Entropy's tickers for the two Variational spells out.
 */
const PRELISTING = new Set([
  "ANTH", "ANTHROPIC", "OAI", "OPENAI",
  // SHEIN, the one name trade.xyz's own catalog (via Entropy's market API)
  // still labels "Pre-IPOs". Its older Pre-IPO index also named SPCX, QNT,
  // CBRS, SKHY, CXMT and UNITREE; every venue now labels those as stocks.
  "SHEIN",
]);

const INDEX = new Set([
  "DRAM", "EWJ", "EWT", "EWY", "EWZ", "IWM", "KSTR", "QQQ", "SOXL", "URNM", "US500",
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
  // trade.xyz's indices and ETFs: its own XYZ U.S. 100 basket, the Korea 200
  // and Japan 225 benchmarks, and three ETFs (KORU, MAGS, LYTE).
  "JP225", "KORU", "KR200", "LYTE", "MAGS", "XYZ100",
  // ETFs QFEX files under its coarse EQUITY class, and two Variational ETFs the
  // map had not reached (Direxion TMF / TZA). An ETF is an index product on
  // every venue that labels it (trade.xyz: SMH, NCLD under "Indices / ETFs").
  "COPX", "NCLD", "RSP", "SMH", "TMF", "TZA",
  // Variational's index swaps ("Swap on US 500", "Swap on US Non-Financial
  // 100"). Same underlyings as US500 / US100, a different instrument -- see
  // SWAP below.
  "US100S", "US500S",
]);

const COMMODITY = new Set([
  // Spot and futures, not tokenised.
  "BZ", "CL", "COPPER", "NATGAS", "XAG", "XAU", "XPD", "XPT",
  // QFEX spells the metals out.
  "GOLD", "SILVER", "URANIUM",
  // Polymarket spells the two crude benchmarks out; Variational calls the same
  // contracts CL and BZ.
  "BRENTOIL", "WTIOIL",
  // Nado's spelling of the same crude contract.
  "WTI",
  // trade.xyz spells the two remaining precious metals out.
  "PALLADIUM", "PLATINUM",
  // Variational's commodity swaps ("Swap on Gold Spot", "Swap on Silver Spot",
  // "Swap on WTI Crude Oil").
  "UKOILP", "USOILP", "XAGS", "XAUS",
]);

/**
 * Currency pairs. Deliberately thin: the venue that lists FX (QFEX) publishes
 * `product_category: "FX"` per market, so those rows are classed from the
 * venue's own answer and never need to appear here. Entries below cover a
 * venue that lists a currency without saying so.
 */
const FX = new Set([
  "AUDUSD", "EURUSD", "GBPUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY",
  // Hibachi quotes CAD and JPY against the dollar the other way round
  // (CADUSD 0.72, JPYUSD 0.0065), so they are their own pairs, not USDCAD /
  // USDJPY. Hibachi's and trade.xyz's bare currency tickers are renamed to
  // these pair names in data/manual/symbol_overrides.yaml.
  "CADUSD", "JPYUSD",
]);

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
 * The curated map answers first, and the class a venue publishes for its own
 * market (`markets.asset_class`) fills in only what the map does not name.
 *
 * It used to be the other way round, and that made one instrument read as two
 * kinds depending on the venue: QFEX's API files pre-IPO names and ETFs under
 * the single coarse class EQUITY (its own interface tags OpenAI "Pre-IPO"), so
 * OPENAI was pre-IPO on Variational and a stock on QFEX. The map is curated
 * against every venue's own interface and docs, one answer per instrument; a
 * venue's class still classifies everything the map has not reached yet.
 * Unrecognised venue strings fall through rather than inventing a class.
 */
export function instrumentClass(symbol: string, venueAssetClass?: string | null): InstrumentClass {
  for (const [name, set] of CURATED) if (set.has(symbol)) return name;
  if (venueAssetClass) {
    const known = VENUE_CLASS[venueAssetClass.trim().toUpperCase()];
    if (known) return known;
  }
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

/**
 * Swaps, as opposed to perpetuals.
 *
 * A property of the instrument's TYPE, orthogonal to its class: a gold swap is
 * still a commodity. What makes it worth marking is that it behaves differently
 * where the calculator is concerned -- per docs.variational.io/omni/trading/swaps
 * a swap accrues daily traditional-market financing at the 17:00 ET close
 * instead of perp funding, and trades restricted hours rather than 24/7.
 *
 * Curated from the live feed, where every one is named "Swap on ..." and
 * reports `funding_rate: 0` with `funding_interval_s: 0`. The venue's docs name
 * more swap markets (XPT, XPD, COPP, UKOIL, TWI, EURUSD) than the feed lists
 * today; their tickers are added when they appear, not guessed ahead of it.
 */
/**
 * Swap ticker -> the pair it is a liquidity variant of.
 *
 * A swap is not a separate market to farm; it is another way to take the same
 * exposure, filled from a different liquidity source. So XAUS is XAU, and a
 * cross-protocol route has to be able to hedge a Variational gold swap against
 * another venue's XAU perp -- matching by exact ticker hid every such route.
 * The target is spelled as the other venues spell the underlying; WTI crude is
 * CL because that is Variational's own perp ticker for it.
 */
const SWAP_UNDERLYING = new Map<string, string>([
  ["XAUS", "XAU"],
  ["XAGS", "XAG"],
  ["US100S", "US100"],
  // The FULL S&P 500: US500S trades near 7,590, like SP500 on Polymarket and
  // trade.xyz and QFEX's US500 -- not Variational's own US500 perp, which
  // trades at a tenth of the index (~759). Checked 2026-09-10.
  ["US500S", "SP500"],
  ["USOILP", "CL"],
  // "Swap on Brent Crude Oil", listed after the map was written.
  ["UKOILP", "BZ"],
]);

export function isSwap(symbol: string): boolean {
  return SWAP_UNDERLYING.has(symbol);
}

/** The pair a swap stands in for, or null when the symbol is not a swap. */
export function swapUnderlying(symbol: string): string | null {
  return SWAP_UNDERLYING.get(symbol) ?? null;
}

/** How Variational's own interface names each swap: the underlying, tagged SWAP. */
const SWAP_TICKER_ON_VENUE = new Map<string, string>([
  ["XAUS", "XAU"],
  ["XAGS", "XAG"],
  ["US100S", "US100"],
  ["US500S", "US500"],
  ["USOILP", "USOIL"],
  ["UKOILP", "UKOIL"],
]);

/**
 * A market's ticker as its own venue shows it.
 *
 * Rows are named by the canonical pair, and that is not always what a venue
 * calls the market: Variational's US500 is the SPDR ETF and joins SPY here,
 * trade.xyz's GOLD is XAU, Nado's kPEPE is 1000PEPE. Someone looking the route
 * up on the venue searches the venue's name, so the interface prints it. Only
 * feed plumbing is removed -- a HIP-3 dex prefix (`xyz:`) and a dollar quote
 * suffix (`-USD`, `/USDC`, `-PERP_USDT0`) -- never part of the name, so
 * QFEX's won-quoted SAMSUNG-KRW keeps its currency.
 */
export function venueTicker(symbol: string): string {
  const bare = symbol.replace(/^[a-z0-9]+:/, "").replace(/(?:-PERP_USDT0|\/USDT-P|\/USDC|-USDC|-USD)$/, "");
  const swap = SWAP_TICKER_ON_VENUE.get(bare);
  return swap === undefined ? bare : `${swap} swap`;
}
