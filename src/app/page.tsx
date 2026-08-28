import { brand } from "@/lib/brand";

/* Holding page. The site proper begins with the daily viewer. */
export default function Home() {
  return (
    <p style={{ padding: "var(--margin)", maxWidth: "var(--measure-note)" }}>
      {brand.tagline}
    </p>
  );
}
