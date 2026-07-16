import type { Metadata } from "next";
import { MethodologyContent } from "@/components/MethodologyContent";

export const metadata: Metadata = { title: "Methodology — perpfarm" };

export default function MethodologyPage() {
  return <MethodologyContent />;
}
