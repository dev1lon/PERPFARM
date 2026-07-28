import type { Metadata } from "next";
import { MethodologyV2 } from "@/components/v2/MethodologyV2";

export const metadata: Metadata = { title: "Methodology — perpfarm" };
export const revalidate = 3600;

export default function MethodologyPage() {
  return <MethodologyV2 />;
}
