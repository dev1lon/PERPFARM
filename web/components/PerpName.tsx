/** The perp's name rendered as live text in a bold, uppercase "wordmark"
 * style (see the Hibachi reference: heavy geometric caps). We render the
 * name ourselves rather than shipping a per-perp wordmark image -- one
 * consistent treatment across every perp, and nothing to source/redistribute
 * per venue. The logo mark (PerpDexLogo) is still a real per-perp image. */
export function PerpName({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`font-extrabold uppercase tracking-wide text-text-primary ${className}`}>
      {name}
    </span>
  );
}
