/** Dev-only design token preview -- both themes rendered side by side via
 * nested [data-theme] scopes, so this page doesn't depend on the global
 * toggle to compare them. Not linked from the site nav. */

const SWATCHES: { token: string; label: string }[] = [
  { token: "bg", label: "bg" },
  { token: "surface-1", label: "surface-1" },
  { token: "surface-2", label: "surface-2" },
  { token: "surface-hover", label: "surface-hover" },
  { token: "accent", label: "accent" },
  { token: "accent-hover", label: "accent-hover" },
  { token: "positive", label: "positive" },
  { token: "negative", label: "negative" },
];

function ThemePreview({ theme }: { theme: "dark" | "light" }) {
  return (
    <div
      data-theme={theme}
      className="flex-1 rounded-lg border border-border bg-bg p-6 text-text-primary"
    >
      <h2 className="mb-4 text-lg font-semibold capitalize">{theme}</h2>

      <div className="mb-6 grid grid-cols-4 gap-3">
        {SWATCHES.map((s) => (
          <div key={s.token} className="flex flex-col gap-1.5">
            <div
              className="h-14 rounded-md border border-border"
              style={{ background: `var(--${s.token})` }}
            />
            <span className="font-mono-num text-xs text-text-muted">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="mb-6 space-y-2">
        <p className="text-text-primary">text-primary — the quick brown fox</p>
        <p className="text-text-muted">text-muted — the quick brown fox</p>
        <p className="font-mono-num text-sm text-text-primary">
          font-mono-num — PEPE $-0.000267/pt 12,345,678
        </p>
        <p className="text-2xl font-semibold">Heading / Plus Jakarta Sans 600</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="pf-transition rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Primary button
        </button>
        <button
          type="button"
          className="pf-transition rounded-md border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          Secondary button
        </button>
        <span className="rounded-md bg-surface-2 px-2.5 py-1 text-xs text-text-muted">
          season ends 21d
        </span>
        <span className="rounded-md px-2.5 py-1 text-xs font-medium text-positive" style={{ background: "color-mix(in srgb, var(--positive) 15%, transparent)" }}>
          maker
        </span>
        <span className="rounded-md px-2.5 py-1 text-xs font-medium text-negative" style={{ background: "color-mix(in srgb, var(--negative) 15%, transparent)" }}>
          taker
        </span>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-surface-1 p-3 text-xs text-text-muted">
          radius-lg (12px)
        </div>
        <div className="rounded-md border border-border bg-surface-1 p-3 text-xs text-text-muted">
          radius-md (8px)
        </div>
        <div className="rounded-sm border border-border bg-surface-1 p-3 text-xs text-text-muted">
          radius-sm (6px)
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="pf-skeleton h-16 rounded-lg bg-surface-2" />
        <div className="flex h-16 items-center justify-center rounded-lg border border-border bg-surface-1">
          <span key={theme} className="pf-value-pulse font-mono-num text-sm">
            $-0.000267/pt
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TokensPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-lg font-semibold">Design tokens</h1>
      <p className="mb-6 text-sm text-text-muted">
        Dev-only preview, not linked from the site. Both themes are forced via nested
        [data-theme] scopes so this page doesn&apos;t depend on the global toggle.
      </p>
      <div className="flex flex-col gap-6 lg:flex-row">
        <ThemePreview theme="dark" />
        <ThemePreview theme="light" />
      </div>
    </div>
  );
}
