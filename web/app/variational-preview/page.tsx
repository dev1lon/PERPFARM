import { VariationalLayoutPreview } from "@/components/VariationalLayoutPreview";

export const dynamic = "force-dynamic";

/** Local-only layout experiment. The published /variational page is unchanged. */
export default function VariationalPreviewPage() {
  return <VariationalLayoutPreview otherVenues={[]} />;
}
