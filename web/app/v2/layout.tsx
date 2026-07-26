/**
 * v2 redesign wrapper. The `.pf-v2` class scopes the new design-system tokens
 * (see globals.css) so these pages render in the redesign palette while the
 * existing site is untouched. At switch-over the tokens move up to :root and
 * this wrapper is dropped. The legacy SiteNavigation hides itself on /v2 (the
 * redesign ships its own header); the fixed BTC/ETH SiteFooter stays global.
 */
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <div className="pf-v2 min-h-screen bg-bg text-text-primary">{children}</div>;
}
