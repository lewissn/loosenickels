import type { Metadata } from "next";
import Link from "next/link";
import { archive, format } from "@/lib/archive";
import { Masthead, PageFoot } from "@/components/primitives/Masthead";
import { Reveal } from "@/components/primitives/Reveal";
import { longDate } from "@/lib/util/time";
import styles from "./research.module.css";

export const metadata: Metadata = {
  title: "Department of Unnecessary Research",
  description:
    "Investigations into questions that did not require answering, conducted to a standard the questions did not deserve.",
};

export default async function ResearchIndex() {
  const papers = await archive.research();
  const concluded = papers.filter((paper) => paper.finding).length;

  return (
    <div className={styles.page}>
      <Masthead
        title="Unnecessary Research"
        charter="Investigations into questions that did not require answering, conducted to a standard the questions did not deserve. The methods are real methods; that is the only part of this the department takes seriously."
      />

      <div className={styles.papers}>
        {papers.map((paper, i) => (
          <Reveal
            key={paper.id}
            el="article"
            className={styles.paper}
            delay={i < 4 ? i * 80 : 0}
            distance={12}
          >
            <span className={styles.index} aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>

            <h2 className={styles.question}>
              {/* A paper is a record like any other and lives at its
                  accession address. The department indexes them; it does
                  not hold a second copy of them. */}
              <Link href={`/archive/record/${paper.slug}`}>{paper.question}</Link>
            </h2>

            <div className={styles.aside}>
              <p className={styles.findingLabel}>
                {paper.finding ? "Finding" : "In progress"}
              </p>
              <p
                className={`${styles.finding} ${paper.finding ? "" : styles.pending}`}
              >
                {paper.finding ??
                  "The investigation is open. No finding has been reached and none is promised."}
              </p>
              <p className={styles.register}>
                <span>{format(paper.id)}</span>
                <span>{longDate(paper.date)}</span>
                {paper.place?.region && <span>{paper.place.region}</span>}
              </p>
              {paper.method.length > 0 && (
                <p className={styles.steps}>
                  {paper.method.length}-step method
                </p>
              )}
            </div>
          </Reveal>
        ))}
      </div>

      <PageFoot>
        <span>
          {papers.length} papers · {concluded} concluded ·{" "}
          {papers.length - concluded} open
        </span>
      </PageFoot>
    </div>
  );
}
