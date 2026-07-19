import { VariationalLayoutPreview } from "@/components/VariationalLayoutPreview";

export const revalidate = 3600;

/** Local-only layout experiment. The published /variational page is unchanged. */
export default function VariationalPreviewPage() {
  return <VariationalLayoutPreview otherVenues={[]} />;
}
