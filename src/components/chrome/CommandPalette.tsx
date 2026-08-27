import { archive, DEPARTMENTS, format } from "@/lib/archive";
import { Palette, type PaletteRecord, type PaletteDestination } from "./Palette";

/**
 * Server half of the enquiry surface.
 *
 * The whole searchable index is serialised to the client rather than
 * queried over the network. At the archive's present size that payload is
 * a few kilobytes, and it buys something a round trip cannot: results that
 * appear between one keystroke and the next, with no loading state to
 * design around and no spinner to apologise with.
 *
 * The threshold at which this stops being the right trade is somewhere
 * around a thousand records. At that point this component grows a route
 * handler and the interface above it does not change.
 */
export async function CommandPalette() {
  const [entries, collections] = await Promise.all([
    archive.entries({ order: "recently-accessioned" }),
    archive.collections(),
  ]);

  const records: PaletteRecord[] = entries.map((entry) => ({
    id: entry.id,
    display: format(entry.id),
    dept: entry.dept,
    department: DEPARTMENTS[entry.dept].name,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    place: entry.place
      ? [entry.place.name, entry.place.region].filter(Boolean).join(", ")
      : undefined,
    collections: entry.collections,
    date: entry.date,
  }));

  const destinations: PaletteDestination[] = [
    { href: "/archive", label: "The Archive", note: "Every record, by department" },
    { href: "/collections", label: "Collections", note: `${collections.length} open` },
    { href: "/places", label: "Survey Plot", note: "Records against their coordinates" },
    { href: "/research", label: "Department of Unnecessary Research" },
    { href: "/ledger", label: "Ledger", note: "The accession register in full" },
    { href: "/about", label: "About the institute" },
    { href: "/random", label: "Draw a record at random", note: "Any department" },
  ];

  return <Palette records={records} destinations={destinations} />;
}
