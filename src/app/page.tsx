import Link from "next/link";
import { archive, DEPARTMENTS, format } from "@/lib/archive";
import { Plate } from "@/components/plate/Plate";
import { Readout } from "@/components/chrome/Readout";
import { Reveal } from "@/components/primitives/Reveal";
import { plateName } from "@/lib/motion/names";
import { monthYear } from "@/lib/util/time";
import styles from "./page.module.css";

/* The record on display changes daily. Re-rendering hourly is enough to
   catch the turn of the day in any timezone without the page ever being
   built more than a handful of times. */
export const revalidate = 3600;

/** Days since the epoch. Stable within a day, different the next. */
function today(): number {
  return Math.floor(Date.now() / 86_400_000);
}

export default async function Home() {
  const [stats, featured] = await Promise.all([
    archive.stats(),
    archive.random(today()),
  ]);

  const department = featured ? DEPARTMENTS[featured.dept] : null;

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
            <Link href="/random" className={styles.entrance} prefetch={false}>
              Draw at random
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          </Reveal>
        </div>

        {featured && department && (
          <div className={styles.exhibit} data-dept={featured.dept}>
            <Reveal as="wipe" delay={120}>
              <Link
                href={`/archive/record/${featured.slug}`}
                className={styles.frame}
                aria-label={`On display: ${featured.title}, ${format(featured.id)}`}
              >
                <Plate
                  id={featured.id}
                  dept={featured.dept}
                  viewTransitionName={plateName(featured.id)}
                />
              </Link>
            </Reveal>

            <Reveal delay={420} className={styles.caption} distance={8}>
              <span className={styles.standing}>On display</span>
              <span className={styles.captionId}>{format(featured.id)}</span>
              <span className={styles.captionTitle}>{featured.title}</span>
              <span className={styles.captionMeta}>
                {department.name}
                {featured.place?.region ? ` · ${featured.place.region}` : ""} ·{" "}
                {monthYear(featured.date)}
              </span>
            </Reveal>
          </div>
        )}
      </div>

      <Readout
        holdings={stats.total}
        placed={stats.placed}
        latest={stats.latest}
      />
    </div>
  );
}
