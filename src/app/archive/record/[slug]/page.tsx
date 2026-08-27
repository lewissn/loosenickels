import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { archive, format, DEPARTMENTS } from "@/lib/archive";
import { RecordView } from "@/components/archive/RecordView";
import { longDate } from "@/lib/util/time";

interface Params {
  params: Promise<{ slug: string }>;
}

/* Every record is rendered at build time. The archive is small, the pages
   are static, and the result is that a record opens without a request. */
export async function generateStaticParams() {
  const entries = await archive.entries();
  return entries.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const entry = await archive.entry(slug);
  if (!entry) return { title: "Record not found" };

  const department = DEPARTMENTS[entry.dept];
  const where = entry.place
    ? `${entry.place.name}. `
    : "";

  return {
    title: `${entry.title} · ${format(entry.id)}`,
    description:
      entry.summary ??
      `${department.singular}, accessioned ${format(entry.id)}. ${where}${longDate(entry.date)}.`,
    openGraph: {
      title: entry.title,
      description: entry.summary,
      type: "article",
    },
  };
}

export default async function RecordPage({ params }: Params) {
  const { slug } = await params;
  const entry = await archive.entry(slug);
  if (!entry) notFound();

  const [related, adjacent] = await Promise.all([
    archive.related(entry.id),
    archive.adjacent(entry.id, 4),
  ]);

  return <RecordView entry={entry} related={related} adjacent={adjacent} />;
}
