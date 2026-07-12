import type { Confidence } from "@/lib/types";

const STYLES: Record<Confidence, string> = {
  confirmed: "border-accent/50 text-accent bg-accent/10",
  estimated: "border-border text-text-muted bg-surface-2",
  rumor: "border-border border-dashed text-text-muted bg-transparent",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence | null }) {
  if (!confidence) {
    return (
      <span className="inline-block rounded-sm border border-dashed border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
        unknown
      </span>
    );
  }
  return (
    <span
      className={`inline-block rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STYLES[confidence]}`}
    >
      {confidence}
    </span>
  );
}
