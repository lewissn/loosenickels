import type { Metadata } from "next";
import { archive } from "@/lib/archive";
import { RandomRedirect } from "./RandomRedirect";

export const metadata: Metadata = {
  title: "Random record",
  robots: { index: false, follow: true },
};

export default async function RandomPage() {
  const entries = await archive.entries();
  return <RandomRedirect slugs={entries.map((entry) => entry.slug)} />;
}
