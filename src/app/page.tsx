import Link from "next/link";
import { archive } from "@/lib/archive";
import { dayIndex } from "@/lib/archive/featured";
import { Readout } from "@/components/chrome/Readout";
import { Reveal } from "@/components/primitives/Reveal";
import { OnDisplay, type OnDisplayRecord } from "./OnDisplay";
import styles from "./page.module.css";

export default async function Home() {
  const [stats, entries] = await Promise.all([
    archive.stats(),
    archive.entries(),
  ]);

  /* The whole pool goes to the client, not just the record of the day.
     It is a few hundred bytes per record and it is what lets the vitrine
     turn over on the reader's clock rather than on the deploy's. */
  const pool: OnDisplayRecord[] = entries.map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    dept: entry.dept,
    region: entry.place?.region,
    date: entry.date,
  }));

  return (
    <div className={styles.vitrine}>
      <div className={styles.composition}>
        <div className={styles.nameplate}>
          <Reveal as="settle" el="h1" className={styles.institution}>
            <span>Loose</span>
            <span className={styles.second}>Nickels</span>
          </Reveal>

          <Reveal delay={180} el="p" className={styles.charter} distance={10}>
            An independent institute for things of questionable significance.
          </Reveal>

          <Reveal delay={340} className={styles.entrances}>
            <Link href="/archive" className={styles.entrance}>
              Enter the archive
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>
            {/* /random is a static page that draws in the browser and
                replaces itself, so this is a plain navigation rather than
                a client-side transition into a route that has nothing to
                show yet. */}
            <a href="/random" className={styles.entrance}>
              Draw at random
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </a>
          </Reveal>
        </div>

        <OnDisplay pool={pool} built={dayIndex()} />
      </div>

      <Readout
        holdings={stats.total}
        placed={stats.placed}
        latest={stats.latest}
      />
    </div>
  );
}
