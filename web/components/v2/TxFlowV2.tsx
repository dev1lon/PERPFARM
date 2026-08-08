"use client";

import Link from "next/link";
import { tr, useLocale } from "@/components/LocaleProvider";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { TxFlowActivityV2 } from "@/components/v2/TxFlowActivityV2";

const TRADE_URL = "https://app.txflow.com/trade/BTC-USDC";
const DOCS_URL = "https://docs.txflow.com";
const FEES_URL = "https://docs.txflow.com/perp/trading-fees";
const REFERRAL_URL = "https://docs.txflow.com/referral/referral";
const X_URL = "https://x.com/txflow_chain";

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">
      {children} ↗
    </a>
  );
}

function Heading({ children, eyebrow }: { children: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="pb-4">
      {eyebrow && <div className="pb-2 font-mono-num text-[11px] uppercase tracking-[0.16em] text-[#9be557]">{eyebrow}</div>}
      <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{children}</h2>
    </div>
  );
}

export function TxFlowV2() {
  const locale = useLocale();
  const feeRows = [
    ["VIP 0", "< $5M", "0.015%", "0.045%"],
    ["VIP 1", "≥ $5M", "0.012%", "0.040%"],
    ["VIP 2", "≥ $25M", "0.008%", "0.035%"],
    ["VIP 3", "≥ $100M", "0.004%", "0.030%"],
    ["VIP 4–6", "≥ $500M", "0.000%", "0.024–0.028%"],
  ];

  return (
    <div>
      <SiteHeaderV2 />
      <main className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-10">
        <div className="flex items-center gap-2 pb-4 pt-5 text-[13px] text-text-dim">
          <Link href="/#protocols" className="pf-transition text-text-muted hover:text-text-primary">
            {tr(locale, "Protocols", "Протоколы")}
          </Link>
          <span>/</span>
          <span className="text-text-primary">TxFlow</span>
        </div>

        <section className="border-b border-border pb-7">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
            <div className="flex items-center gap-4">
              <ProtocolMark slug="txflow" name="TxFlow" size={56} radius={15} />
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#8fce43]/30 bg-[#8fce43]/10 px-2.5 py-1 text-[11px] font-semibold text-[#9be557]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#9be557]" />
                  {tr(locale, "Protocol live", "Протокол работает")}
                </div>
                <h1 className="text-[34px] font-bold tracking-[-0.025em] text-text-primary">TxFlow</h1>
                <p className="mt-1 text-[15px] text-text-muted">
                  {tr(locale, "Fully on-chain CLOB for perpetual markets", "Полностью on-chain CLOB для perpetual-рынков")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <ExternalLink href={TRADE_URL}>{tr(locale, "Trade", "Торговать")}</ExternalLink>
                  <ExternalLink href={DOCS_URL}>Docs</ExternalLink>
                  <ExternalLink href={X_URL}>X</ExternalLink>
                </div>
              </div>
            </div>
            <a href={TRADE_URL} target="_blank" rel="noreferrer" className="pf-transition inline-flex items-center gap-2 rounded-xl bg-[#8fce43] px-5 py-3 text-[14px] font-bold text-[#111606] hover:bg-[#a8e86b]">
              {tr(locale, "Open TxFlow", "Открыть TxFlow")} <span aria-hidden>→</span>
            </a>
          </div>
        </section>

        <section className="mt-9 grid gap-3 sm:grid-cols-3">
          {[
            [tr(locale, "Perp fees · VIP 0", "Комиссии perp · VIP 0"), "1.5 / 4.5 bps", tr(locale, "maker / taker", "maker / taker")],
            [tr(locale, "Referral discount", "Скидка по рефералу"), "5%", tr(locale, "first $25M in volume", "на первые $25M объёма")],
            [tr(locale, "Execution", "Исполнение"), "On-chain CLOB", tr(locale, "orders, cancels and matches settle on TxFlow", "ордера, отмены и матчинги исполняются в TxFlow")],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-[16px] border border-border bg-surface-1 px-5 py-4">
              <div className="text-[12px] text-text-muted">{label}</div>
              <div className="mt-2 font-mono-num text-[21px] text-text-primary">{value}</div>
              <div className="mt-1 text-[12px] text-text-dim">{detail}</div>
            </div>
          ))}
        </section>

        <section className="mt-11">
          <Heading eyebrow={tr(locale, "What is verified", "Что подтверждено")}>{tr(locale, "Built for on-chain TradFi perps", "Создан для on-chain TradFi perps")}</Heading>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[18px] border border-[#8fce43]/25 bg-[#8fce43]/[0.055] p-5">
              <div className="font-mono-num text-[11px] tracking-[0.14em] text-[#9be557]">01</div>
              <h3 className="mt-4 text-[17px] font-bold text-text-primary">{tr(locale, "Fully on-chain order book", "Полностью on-chain стакан")}</h3>
              <p className="mt-2 text-[14px] leading-6 text-text-muted">
                {tr(locale, "Orders, cancellations and matching settle on TxFlow. Use resting LIMIT orders when you want to provide liquidity.", "Ордера, отмены и матчинги исполняются в TxFlow. Используйте пассивные LIMIT-ордера, когда хотите давать ликвидность.")}
              </p>
            </div>
            <div className="rounded-[18px] border border-border bg-surface-1 p-5">
              <div className="font-mono-num text-[11px] tracking-[0.14em] text-text-dim">02</div>
              <h3 className="mt-4 text-[17px] font-bold text-text-primary">{tr(locale, "TradFi market focus", "Фокус на TradFi")}</h3>
              <p className="mt-2 text-[14px] leading-6 text-text-muted">
                {tr(locale, "TxFlow lists perpetual products including stock futures. They track the referenced asset but do not represent equity ownership.", "TxFlow предлагает perpetual-продукты, включая stock futures. Они повторяют цену базового актива, но не дают права собственности на акции.")}
              </p>
            </div>
            <div className="rounded-[18px] border border-border bg-surface-1 p-5">
              <div className="font-mono-num text-[11px] tracking-[0.14em] text-text-dim">03</div>
              <h3 className="mt-4 text-[17px] font-bold text-text-primary">{tr(locale, "Session-aware trading", "Торговля с учётом сессии")}</h3>
              <p className="mt-2 text-[14px] leading-6 text-text-muted">
                {tr(locale, "Outside regular US stock-market hours, stock futures can switch to reduce-only. Plan entries and exits around the session.", "Вне обычных часов американского фондового рынка stock futures могут перейти в режим reduce-only. Планируйте вход и выход с учётом сессии.")}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-11 grid gap-7 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <Heading eyebrow={tr(locale, "Cost of trading", "Стоимость торговли")}>{tr(locale, "Fees improve with 14-day volume", "Комиссии снижаются с 14-дневным объёмом")}</Heading>
            <div className="overflow-hidden rounded-[18px] border border-border bg-surface-1">
              <div className="grid grid-cols-[0.8fr_1fr_1fr_1fr] gap-2 border-b border-border bg-surface-2 px-4 py-3 font-mono-num text-[10px] uppercase tracking-[0.11em] text-text-dim">
                <span>Tier</span><span>{tr(locale, "Volume", "Объём")}</span><span>Maker</span><span>Taker</span>
              </div>
              {feeRows.map(([tier, volume, maker, taker]) => (
                <div key={tier} className="grid grid-cols-[0.8fr_1fr_1fr_1fr] gap-2 border-b border-border px-4 py-3 last:border-b-0">
                  <span className="font-mono-num text-[13px] text-text-primary">{tier}</span>
                  <span className="font-mono-num text-[13px] text-text-muted">{volume}</span>
                  <span className="font-mono-num text-[13px] text-[#9be557]">{maker}</span>
                  <span className="font-mono-num text-[13px] text-text-primary">{taker}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-5 text-text-dim">
              {tr(locale, "Perp and spot volume are combined for the tier; fees apply on each executed side. Verify the current schedule before trading.", "Объём perp и spot суммируется для VIP-тиры; комиссия взимается с каждой исполненной стороны. Проверьте актуальный график перед сделкой.")}{" "}
              <ExternalLink href={FEES_URL}>{tr(locale, "Official fee schedule", "Официальные комиссии")}</ExternalLink>
            </p>
          </div>

          <div className="rounded-[18px] border border-[#8fce43]/25 bg-[#8fce43]/[0.055] p-5 lg:mt-[39px]">
            <div className="font-mono-num text-[11px] uppercase tracking-[0.14em] text-[#9be557]">Referral</div>
            <h3 className="mt-4 text-[20px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, "A real discount, not points", "Реальная скидка, а не поинты")}</h3>
            <p className="mt-3 text-[14px] leading-6 text-text-muted">
              {tr(locale, "A referral code gives the trader a 5% fee discount for their first $25M in volume. A referrer can create one after $100K of volume and earns 10% of referred users’ net fees.", "Реферальный код даёт трейдеру скидку 5% на комиссии для первых $25M объёма. Реферер может создать код после $100K объёма и получает 10% от чистых комиссий приглашённых пользователей.")}
            </p>
            <div className="mt-5 border-t border-[#8fce43]/20 pt-4 text-[13px] text-text-muted">
              {tr(locale, "TxFlow does not document a points program today. PerpFarm therefore does not assign a point estimate or promote a farming route.", "TxFlow сейчас не документирует программу поинтов. Поэтому PerpFarm не назначает оценку поинтов и не продвигает farming-маршрут.")}
            </div>
            <div className="mt-4"><ExternalLink href={REFERRAL_URL}>{tr(locale, "Referral terms", "Условия рефералов")}</ExternalLink></div>
          </div>
        </section>

        <section className="mt-11 rounded-[20px] border border-border bg-surface-1 p-5 sm:p-6">
          <Heading eyebrow={tr(locale, "PerpFarm view", "Взгляд PerpFarm")}>{tr(locale, "Use TxFlow as a trading venue first", "Используйте TxFlow прежде всего как торговую площадку")}</Heading>
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
            <p className="max-w-3xl text-[15px] leading-7 text-text-muted">
              {tr(locale, "The venue is a useful TradFi-perps counterparty to research alongside Variational, but there is not yet a public TxFlow market API for a verified spread, funding, order-book or hedge-cost comparison. We will add an automatic route only when those inputs are independently reproducible.", "Площадку можно исследовать как TradFi-perps контрагента рядом с Variational, но публичного TxFlow API для проверяемого сравнения спредов, funding, стакана и стоимости хеджа пока нет. Автоматический маршрут появится, когда эти данные можно будет независимо воспроизвести.")}
            </p>
            <Link href="/variational" className="pf-transition inline-flex items-center gap-2 whitespace-nowrap text-[14px] font-semibold text-accent hover:text-accent-hover">
              {tr(locale, "Explore Variational", "Открыть Variational")} <span aria-hidden>→</span>
            </Link>
          </div>
        </section>

        <TxFlowActivityV2 />

        <footer className="mt-14 flex flex-col gap-2 border-t border-border pt-7 text-[12px] text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{tr(locale, "Verified sources: TxFlow Docs and DefiLlama · Not financial advice", "Проверенные источники: TxFlow Docs и DefiLlama · Не финансовый совет")}</span>
          <div className="flex gap-4"><ExternalLink href={DOCS_URL}>TxFlow Docs</ExternalLink><ExternalLink href="https://defillama.com/perps/chain/txflow">DefiLlama</ExternalLink></div>
        </footer>
      </main>
    </div>
  );
}
