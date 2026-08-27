import type { Metadata } from "next";
import { archive, DEPARTMENT_LIST } from "@/lib/archive";
import { Masthead, PageFoot } from "@/components/primitives/Masthead";
import { longDate } from "@/lib/util/time";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "About",
  description:
    "Loose Nickels is an independent archive concerned with objects, places, observations and other material of uncertain importance. Founded 2026.",
};

const SIGNIFICANCE_SCHEME = [
  [
    "undetermined",
    "The archive has not formed a view and does not undertake to. The default, and by a considerable margin the commonest.",
  ],
  [
    "negligible",
    "Of no importance by any measure the archive can identify. Retained regardless.",
  ],
  [
    "personal",
    "Significant to the archive and to nobody else. Recorded as such rather than dressed up as anything more.",
  ],
  [
    "contested",
    "Two or more incompatible views are held. Both are recorded. Neither is accepted.",
  ],
  [
    "considerable",
    "The archive is prepared to make a claim. Used sparingly, and its scarcity is the whole of its authority.",
  ],
] as const;

export default async function AboutPage() {
  const stats = await archive.stats();

  return (
    <div className={styles.page}>
      <Masthead
        title="About"
        standfirst="Loose Nickels is an independent archive concerned with objects, places, observations and other material of uncertain importance."
      />

      <div className={styles.body}>
        <div className={styles.statement}>
          <p className={styles.opening}>
            The institute was founded in 2026 for no reason it has been able to
            state since. It collects things, records where and when it found
            them, and presents them at a level of care which is, by any
            reasonable measure, disproportionate.
          </p>

          <p>
            Nothing held here is rare. Nothing is valuable. A number of the
            records concern objects that were, until they were collected,
            gravel. The archive is aware of this and does not consider it a
            difficulty: the interesting question about a stone is not whether
            it is a good stone, but that somebody carried it six kilometres and
            then wrote down how far.
          </p>

          <p>
            What the institute is actually for, insofar as it is for anything,
            is attention. A thing that has been measured, positioned, dated and
            described has been looked at properly at least once. Very little
            else in ordinary circulation has.
          </p>

          <h2 className={styles.heading}>Accession</h2>

          <p>
            Every record receives a number on the day it is taken in, in the
            form LN–XX–0000, where the letters give the department and the
            digits are a sequence running within that department. Sequences are
            never reused. A record that is withdrawn keeps its number and
            leaves a gap, because the alternative is a register that quietly
            revises its own history.
          </p>

          <p>
            Positions are recorded to the accuracy the archive is willing to
            claim rather than to the accuracy the instrument offers. An object
            found somewhere along a forestry road is recorded as being
            somewhere along a forestry road, to within four hundred metres,
            and is drawn on the survey plot with a ring that size. Precision
            that has not been earned is a form of dishonesty and the archive
            declines to practise it.
          </p>

          <h2 className={styles.heading}>Digitisation</h2>

          <p>
            Records without photography are not shown as gaps. Each is issued a
            plate — a drawing generated from its accession number in the
            drawing convention of its department, so that objects receive
            measured outlines, places receive contours, field notes receive
            isobars and thoughts receive almost nothing at all.
          </p>

          <p>
            A plate is a function of the accession number alone. It is
            therefore identical on every device, in every session, and will not
            change for as long as the record exists. It is superseded the
            moment real photography is attached, and not before.
          </p>

          <h2 className={styles.heading}>Significance</h2>

          <div className={styles.scheme}>
            {SIGNIFICANCE_SCHEME.map(([term, definition]) => (
              <div key={term} className={styles.term}>
                <dt className={styles.termName}>{term}</dt>
                <dd className={styles.termDef}>{definition}</dd>
              </div>
            ))}
          </div>

          <h2 className={styles.heading}>Access</h2>

          <p>
            There is nothing to buy, nothing to join and nothing the visitor is
            required to do. The archive does not collect statistics on its
            readers, does not maintain a mailing list and has no plans in
            either direction.
          </p>
        </div>

        <aside className={styles.aside}>
          <div className={styles.block}>
            <p className={styles.blockLabel}>Holdings</p>
            <dl>
              <div className={styles.line}>
                <dt>Records</dt>
                <dd>{String(stats.total).padStart(4, "0")}</dd>
              </div>
              <div className={styles.line}>
                <dt>Departments</dt>
                <dd>{DEPARTMENT_LIST.length}</dd>
              </div>
              <div className={styles.line}>
                <dt>Collections</dt>
                <dd>{stats.collections}</dd>
              </div>
              <div className={styles.line}>
                <dt>Placed</dt>
                <dd>{stats.placed}</dd>
              </div>
              <div className={styles.line}>
                <dt>Undetermined</dt>
                <dd>{stats.undetermined}</dd>
              </div>
              {stats.earliest && (
                <div className={styles.line}>
                  <dt>Earliest</dt>
                  <dd>{longDate(stats.earliest)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className={styles.block}>
            <p className={styles.blockLabel}>Commands</p>
            <dl>
              <div className={styles.line}>
                <dt>Enquiries</dt>
                <dd>
                  <span className={styles.key}>⌘</span>{" "}
                  <span className={styles.key}>K</span>
                </dd>
              </div>
              <div className={styles.line}>
                <dt>Enquiries</dt>
                <dd>
                  <span className={styles.key}>/</span>
                </dd>
              </div>
              <div className={styles.line}>
                <dt>Index</dt>
                <dd>
                  <span className={styles.key}>I</span>
                </dd>
              </div>
              <div className={styles.line}>
                <dt>Dismiss</dt>
                <dd>
                  <span className={styles.key}>Esc</span>
                </dd>
              </div>
            </dl>
          </div>

          <div className={styles.block}>
            <p className={styles.blockLabel}>Colophon</p>
            <dl>
              <div className={styles.line}>
                <dt>Editorial</dt>
                <dd>Newsreader</dd>
              </div>
              <div className={styles.line}>
                <dt>Signage</dt>
                <dd>Archivo</dd>
              </div>
              <div className={styles.line}>
                <dt>Measurement</dt>
                <dd>IBM Plex Mono</dd>
              </div>
              <div className={styles.line}>
                <dt>Datum</dt>
                <dd>WGS 84</dd>
              </div>
              <div className={styles.line}>
                <dt>Established</dt>
                <dd>2026</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      <PageFoot>
        <span>
          Loose Nickels · Independent Archive · For things of questionable
          significance
        </span>
      </PageFoot>
    </div>
  );
}
