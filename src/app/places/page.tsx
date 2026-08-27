import type { Metadata } from "next";
import { archive, DEPARTMENTS } from "@/lib/archive";
import { SurveyPlot, type PlottedRecord } from "@/components/places/SurveyPlot";
import { Masthead, PageFoot } from "@/components/primitives/Masthead";
import styles from "./places.module.css";

export const metadata: Metadata = {
  title: "Survey Plot",
  description:
    "Every placed record in the archive, drawn against a graticule with no basemap of any kind.",
};

export default async function PlacesPage() {
  const entries = await archive.entries({ placed: true, order: "accession" });

  const plotted: PlottedRecord[] = entries.flatMap((entry) => {
    const coordinates = entry.place?.coordinates;
    if (!coordinates) return [];
    return [
      {
        id: entry.id,
        slug: entry.slug,
        title: entry.title,
        dept: entry.dept,
        department: DEPARTMENTS[entry.dept].singular,
        lat: coordinates.lat,
        lon: coordinates.lon,
        elevation: coordinates.elevation,
        precision: coordinates.precision,
        date: entry.date,
      },
    ];
  });

  return (
    <div className={styles.page}>
      <Masthead
        title="Survey Plot"
        charter="Every record the archive has been willing to place, drawn against a graticule and nothing else. There is no coastline and no road network. The large empty area to the west is the Irish Sea and requires no label to say so."
      />

      <SurveyPlot records={plotted} />

      <PageFoot>
        <span>
          {plotted.length} positions · WGS 84 · equirectangular, corrected for
          the mid-latitude
        </span>
      </PageFoot>
    </div>
  );
}
