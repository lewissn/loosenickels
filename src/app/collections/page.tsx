import type { Metadata } from "next";
import Link from "next/link";
import { archive, type EntrySummary } from "@/lib/archive";
import { Plate } from "@/components/plate/Plate";
import { Masthead, PageFoot } from "@/components/primitives/Masthead";
import { Reveal } from "@/components/primitives/Reveal";
import { monthYear } from "@/lib/util/time";
import styles from "./collections.module.css";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Curated groupings of records, assembled on criteria the archive is not always able to state.",
};

/* Past about six the strip stops reading as contents and starts reading as
   a gallery, which is a different and worse thing. */
const STRIP = 6;

export default async function CollectionsIndex() {
  const collections = await archive.collections();

  const populated = await Promise.all(
    collections.map(async (collection) => ({
      collection,
      members: await archive.entries({
        collection: collection.slug,
        order: "accession",
      }),
    })),
  );

  return (
    <div className={styles.page}>
      <Masthead
        title="Collections"
        charter="Groupings assembled on criteria the archive is not always able to state. A record may belong to several, or to none, and a collection is never closed merely because nothing has been added to it."
      />

      <div className={styles.list}>
        {populated.map(({ collection, members }, i) => (
          <Reveal
            key={collection.slug}
            el="article"
            className={styles.collection}
            delay={i < 5 ? i * 60 : 0}
            distance={10}
          >
            <div className={styles.head}>
              <h2 className={styles.name}>
                <Link href={`/collections/${collection.slug}`}>
                  {collection.title}
                </Link>
              </h2>
              <p className={styles.note}>{collection.note}</p>
              <p className={styles.register}>
                <span>
                  {String(members.length).padStart(3, "0")}{" "}
                  {members.length === 1 ? "record" : "records"}
                </span>
                <span>Opened {monthYear(collection.opened)}</span>
                {collection.closed && <span>Closed {monthYear(collection.closed)}</span>}
              </p>
            </div>

            <div className={styles.contents} aria-hidden="true">
              {members.slice(0, STRIP).map((entry: EntrySummary) => (
                <div key={entry.id} className={styles.thumb} data-dept={entry.dept}>
                  <Plate id={entry.id} dept={entry.dept} compact />
                </div>
              ))}
              {members.length > STRIP && (
                <div className={styles.overflow}>+{members.length - STRIP}</div>
              )}
            </div>
          </Reveal>
        ))}
      </div>

      <PageFoot>
        <span>
          {collections.length} collections · membership is not exclusive
        </span>
      </PageFoot>
    </div>
  );
}
