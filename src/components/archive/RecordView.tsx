import { DEPARTMENTS, format, type Entry, type EntrySummary, type ResearchPaper } from "@/lib/archive";
import { formatCoordinates, longDate, stampDate } from "@/lib/util/time";
import { Prose } from "./Prose";
import { Metadata } from "./Metadata";
import { RecordMedia } from "./RecordMedia";
import { RecordCard } from "./RecordCard";
import { Nightfall } from "./Nightfall";
import { Reveal } from "@/components/primitives/Reveal";
import styles from "./record.module.css";

/* =========================================================================
   Five layouts.

   Which one a record gets is decided by its department and by nothing
   else. There is no per-record override and there should not be: the
   archive's coherence depends on every object being presented the way
   objects are presented.
   ========================================================================= */

type Layout = "catalogue" | "field" | "exhibit" | "text" | "paper";

const LAYOUT: Record<string, Layout> = {
  OB: "catalogue",
  PL: "field",
  FN: "field",
  PH: "exhibit",
  AU: "exhibit",
  XP: "exhibit",
  TH: "text",
  DR: "paper",
};

function Accession({ entry }: { entry: Entry }) {
  return (
    <p className={styles.accession}>
      <em>{DEPARTMENTS[entry.dept].singular}</em>
      <span>{format(entry.id)}</span>
    </p>
  );
}

/* ---- 1 · Catalogue ------------------------------------------------------ */

function Catalogue({ entry }: { entry: Entry }) {
  return (
    <div className={styles.catalogue}>
      <div className={styles.catalogueExhibit}>
        <Reveal as="wipe">
          <RecordMedia entry={entry} className={styles.plate} />
        </Reveal>
      </div>

      <div className={styles.catalogueBody}>
        <Reveal delay={90}>
          <Accession entry={entry} />
          <h1 className={styles.title}>{entry.title}</h1>
        </Reveal>

        {entry.summary && (
          <Reveal delay={160} el="p" className={styles.summary} distance={10}>
            {entry.summary}
          </Reveal>
        )}

        <Reveal delay={220}>
          <Prose
            blocks={entry.body}
            footnotes={entry.footnotes}
            media={entry.media}
          />
        </Reveal>

        <Reveal delay={40}>
          <Metadata entry={entry} />
        </Reveal>
      </div>
    </div>
  );
}

/* ---- 2 · Field --------------------------------------------------------- */

function Field({ entry }: { entry: Entry }) {
  const coordinates = entry.place?.coordinates;

  return (
    <div className={styles.field}>
      <Reveal as="wipe">
        <RecordMedia entry={entry} className={styles.fieldPlate} />
      </Reveal>

      <div className={styles.fieldHead}>
        <Reveal className={styles.fieldHeadText} delay={80}>
          <Accession entry={entry} />
          <h1 className={styles.title}>{entry.title}</h1>
          {entry.summary && <p className={styles.summary}>{entry.summary}</p>}
        </Reveal>

        <Reveal delay={200} el="div" className={styles.fieldPosition} distance={8}>
          {entry.place && (
            <span>
              <em>Location</em>
              {entry.place.name}
            </span>
          )}
          {coordinates && (
            <span>
              <em>Position</em>
              {formatCoordinates(coordinates.lat, coordinates.lon)}
            </span>
          )}
          {coordinates?.elevation !== undefined && (
            <span>
              <em>Elevation</em>
              {coordinates.elevation} m
            </span>
          )}
          <span>
            <em>Recorded</em>
            {longDate(entry.date)}
          </span>
          {entry.weather && (
            <span>
              <em>Conditions</em>
              {entry.weather}
            </span>
          )}
        </Reveal>
      </div>

      <div className={styles.fieldBody}>
        <Reveal>
          <Prose
            blocks={entry.body}
            footnotes={entry.footnotes}
            media={entry.media}
          />
        </Reveal>
        <Reveal className={styles.fieldRegister} delay={120}>
          <Metadata entry={entry} />
        </Reveal>
      </div>
    </div>
  );
}

/* ---- 3 · Exhibit ------------------------------------------------------- */

function Exhibit({ entry }: { entry: Entry }) {
  return (
    <div className={styles.exhibit} data-dept={entry.dept}>
      {/* The Sounds department dims the institution for the duration. */}
      {entry.dept === "AU" && <Nightfall />}

      <Reveal as="wipe">
        <RecordMedia entry={entry} className={styles.exhibitPlate} />
      </Reveal>

      <div className={styles.exhibitCaption}>
        <Reveal delay={80}>
          <Accession entry={entry} />
          <h1 className={styles.title}>{entry.title}</h1>
        </Reveal>
        {entry.summary && (
          <Reveal delay={180} el="p" className={styles.summary} distance={8}>
            {entry.summary}
          </Reveal>
        )}
      </div>

      <div className={styles.exhibitBody}>
        <Reveal>
          <Prose
            blocks={entry.body}
            footnotes={entry.footnotes}
            media={entry.media}
          />
        </Reveal>
        <Reveal delay={120}>
          <Metadata entry={entry} />
        </Reveal>
      </div>
    </div>
  );
}

/* ---- 4 · Text ---------------------------------------------------------- */

function Text({ entry }: { entry: Entry }) {
  return (
    <div className={styles.text}>
      <div className={styles.textBody}>
        <Reveal as="settle" el="h1" className={styles.thought}>
          {entry.title}
        </Reveal>

        {entry.body.length > 0 && (
          <Reveal delay={260} className={styles.textProse} distance={10}>
            <Prose blocks={entry.body} footnotes={entry.footnotes} />
          </Reveal>
        )}
      </div>

      <div className={styles.textRegister}>
        <span>
          <em>Accession</em>
          {format(entry.id)}
        </span>
        <span>
          <em>Recorded</em>
          {stampDate(entry.date)}
        </span>
        <span>
          <em>Significance</em>
          {entry.significance}
        </span>
        {entry.collections.length > 0 && (
          <span>
            <em>Collection</em>
            {entry.collections[0]?.replace(/-/g, " ")}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---- 5 · Paper --------------------------------------------------------- */

function Paper({ entry }: { entry: ResearchPaper }) {
  return (
    <div className={styles.paper}>
      <header className={styles.paperHead}>
        <p className={styles.paperMeta}>
          <span>Department of Unnecessary Research</span>
          <span>{format(entry.id)}</span>
          <span>{longDate(entry.date)}</span>
        </p>
        <Reveal as="settle" el="h1" className={styles.question}>
          {entry.question}
        </Reveal>
        <p className={styles.paperTitle}>{entry.title}</p>
      </header>

      {entry.finding && (
        <div className={styles.finding}>
          <p className={styles.findingLabel}>Finding</p>
          <p className={styles.findingText}>{entry.finding}</p>
        </div>
      )}

      <div className={styles.paperBody}>
        <Reveal className={styles.method}>
          {entry.method.length > 0 && (
            <>
              <p className={styles.methodLabel}>Method</p>
              <ol className={styles.methodList}>
                {entry.method.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </>
          )}
          <div className={styles.paperRegister}>
            <Metadata entry={entry} />
          </div>
        </Reveal>

        <Reveal delay={120}>
          <Prose
            blocks={entry.body}
            footnotes={entry.footnotes}
            media={entry.media}
          />
        </Reveal>
      </div>
    </div>
  );
}

/* ---- Cross-references --------------------------------------------------- */

function Related({
  declared,
  adjacent,
}: {
  declared: EntrySummary[];
  adjacent: EntrySummary[];
}) {
  const shown = declared.length > 0 ? declared : adjacent;
  if (shown.length === 0) return null;

  return (
    <section className={styles.related}>
      <div className={styles.relatedHead}>
        <h2 className={styles.relatedLabel}>
          {declared.length > 0 ? "Cross-referenced" : "Elsewhere in the archive"}
        </h2>
        {declared.length === 0 && (
          <p className={styles.relatedNote}>
            Not linked by the archive. Offered because these records share a
            collection, a position, or a week.
          </p>
        )}
      </div>
      <div className={styles.relatedGrid}>
        {shown.map((entry, i) => (
          <Reveal key={entry.id} delay={i * 60}>
            {/* Nothing in this strip claims a transition name: the record
                above it already holds one, and a name may only be used
                once per document. */}
            <RecordCard entry={entry} terse continuous={false} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---- Dispatch ----------------------------------------------------------- */

export function RecordView({
  entry,
  related,
  adjacent,
}: {
  entry: Entry;
  related: EntrySummary[];
  adjacent: EntrySummary[];
}) {
  const layout = LAYOUT[entry.dept] ?? "catalogue";

  return (
    <article className={styles.record} data-dept={entry.dept}>
      {layout === "catalogue" && <Catalogue entry={entry} />}
      {layout === "field" && <Field entry={entry} />}
      {layout === "exhibit" && <Exhibit entry={entry} />}
      {layout === "text" && <Text entry={entry} />}
      {layout === "paper" && <Paper entry={entry as ResearchPaper} />}

      <Related declared={related} adjacent={adjacent} />
    </article>
  );
}
