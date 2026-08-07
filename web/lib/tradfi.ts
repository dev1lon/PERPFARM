/**
 * The TradFi / RWA universe on Variational.
 *
 * We do not decide what counts as TradFi — the protocol does. This list mirrors
 * two of its own sources:
 *   1. the published RWA market list (docs.variational.io/omni/trading/rwa-perpetuals),
 *   2. the instrument names in its public stats feed, which identify each
 *      listing as a company, ETF or commodity ("Apple Inc.", "iShares MSCI
 *      Japan ETF", "Brent Oil").
 *
 * Tokenised commodities stay OUT: PAXG ("PAX Gold") and XAUT ("Tether Gold")
 * are crypto tokens and carry no TradFi tag in the venue's own UI, unlike XAU
 * ("Gold") which does. Likewise crypto projects with company-shaped names
 * (SynFutures, Trust Wallet, Giggle Fund) are excluded.
 *
 * The stats feed exposes no asset-class field, so this must be refreshed when
 * new markets list — re-check names in the feed against the RWA docs page.
 */
export const TRADFI_TICKERS = new Set([
  // Equities
  "AAOI", "AAPL", "ALAB", "AMD", "AMZN", "ARM", "AVGO", "BABA", "BBX", "BMNR", "BNC", "BOT",
  "BRKB", "BX", "CBRS", "COIN", "COST", "CRCL", "CRM", "CRWD", "DELL", "DIS", "EBAY", "FWDI",
  "GME", "GOOGL", "HD", "HIMS", "HOOD", "HPE", "IBM", "INTC", "IREN", "JPM", "LITE", "LLY",
  "META", "MRVL", "MSFT", "MSTR", "MU", "NFLX", "NOK", "NVDA", "NVO", "ORCL", "PAYP", "PLTR",
  "QCOM", "RIVN", "RKLB", "SHAZ", "SKHY", "SNDK", "SNOW", "SONY", "STRC", "STXX", "TSLA", "TSM",
  "TTWO", "UBER", "USAR", "VISA", "WEN", "WMT", "ZM",
  // Pre-IPO
  "ANTHROPIC", "NBIS", "OPENAI", "QNTX",
  // ETFs and indices
  "DRAM", "EWJ", "EWT", "EWY", "EWZ", "IWM", "KSTR", "QQQ", "SOXL", "SPCX", "URNM", "US500",
  "UVXY", "XBI", "XLE",
  // Commodities and metals (spot / futures, not tokenised)
  "BZ", "CL", "COPPER", "NATGAS", "XAG", "XAU", "XPD", "XPT",
]);

/** Array form for SQL parameters (`pair = ANY($1)`). */
export const TRADFI_TICKER_LIST = [...TRADFI_TICKERS];
