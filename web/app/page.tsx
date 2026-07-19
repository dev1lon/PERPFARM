import { HomeLayoutPreview } from "@/components/HomeLayoutPreview";

export const revalidate = 3600;

export default function HomePage() {
  return <HomeLayoutPreview />;
}
