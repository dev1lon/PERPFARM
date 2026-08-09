import type { Metadata } from "next";
import { HowItWorksV2 } from "@/components/v2/HowItWorksV2";

export const metadata: Metadata = { title: "How it works — PerpFarm" };

export default function HowItWorksPage() {
  return <HowItWorksV2 />;
}
