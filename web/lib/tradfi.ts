/**
 * The TradFi / RWA universe on Variational.
 *
 * The stats feed exposes ticker and name but no asset-class field, so the list
 * is explicit. Shared by the pair ranking (which badges these markets) and the
 * OI-composition chart (which groups by them), so both always agree on what
 * counts as TradFi. Covers the stocks, ETFs, metals and commodities Omni lists.
 */
export const TRADFI_TICKERS = new Set([
  "AAOI", "AAPL", "AMD", "AMZN", "ANTHROPIC", "ARM", "AVGO", "BBX", "BOT", "BRKB", "BX", "BZ",
  "COST", "CBRS", "CL", "COIN", "CRM", "CRCL", "DRAM", "EBAY", "EWJ", "EWY", "EWT", "EWZ",
  "GME", "GOOGL", "HD", "HIMS", "HOOD", "HPE", "INTC", "JPM", "LITE", "LLY", "META", "MRVL", "MSFT",
  "MSTR", "MU", "NATGAS", "NBIS", "NFLX", "NOK", "NVO", "NVDA", "OPENAI", "ORCL", "PAXG", "PLTR",
  "QCOM", "QQQ", "RIVN", "RKLB", "SNDK", "SOXL", "SPCX", "STXX", "STRC", "TSLA", "TSM", "UBER",
  "URNM", "US500", "USAR", "WMT", "XAG", "XAU", "XAUT", "XPD", "XPT",
]);

/** Array form for SQL parameters (`pair = ANY($1)`). */
export const TRADFI_TICKER_LIST = [...TRADFI_TICKERS];
