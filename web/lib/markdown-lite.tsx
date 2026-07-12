/**
 * Minimal renderer for the trusted description_md / notes_md fields we
 * author ourselves in data/manual/*.yaml -- not a general markdown parser.
 * Handles paragraphs, **bold**, and "- " bullet lists only.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export function MarkdownLite({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-text-muted">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        const isList = lines.every((l) => l.startsWith("- "));
        if (isList) {
          return (
            <ul key={i} className="list-inside list-disc space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.slice(2), `${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(lines.join(" "), `${i}`)}</p>;
      })}
    </div>
  );
}
