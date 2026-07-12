import type { OrderType } from "@/lib/types";

export function ExecutionBadge({ orderType }: { orderType: OrderType }) {
  const isMaker = orderType === "maker";
  return (
    <span
      className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-mono-num font-medium uppercase tracking-wide ${
        isMaker ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
      }`}
    >
      {orderType}
    </span>
  );
}
