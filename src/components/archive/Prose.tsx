import type { Footnote, ImageMedia, Media, ProseBlock } from "@/lib/archive";
import styles from "./Prose.module.css";

interface ProseProps {
  blocks: ProseBlock[];
  footnotes?: Footnote[];
  /** Needed only to resolve figure references. */
  media?: Media[];
  className?: string;
}

function Figure({
  media,
  caption,
  scale,
}: {
  media?: Media;
  caption?: string;
  scale: "inset" | "column" | "full" | "bleed";
}) {
  /* A figure whose media reference does not resolve renders nothing at
     all. An empty frame with a caption under it would be worse than the
     omission — it would claim the archive holds something it does not. */
  if (!media || media.kind !== "image") return null;
  const image = media as ImageMedia;

  return (
    <figure className={`${styles.figure} ${styles[scale]}`}>
      <img
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
      />
      {(caption ?? image.caption) && (
        <figcaption className={styles.figureCaption}>
          {caption ?? image.caption}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Renders a record's body.
 *
 * The block set is closed and small, which is what makes this component
 * short. Anything that cannot be said in these seven blocks is a sign that
 * the record wants to be a Research paper.
 */
export function Prose({ blocks, footnotes = [], media = [], className }: ProseProps) {
  if (blocks.length === 0 && footnotes.length === 0) return null;

  return (
    <div className={[styles.prose, className].filter(Boolean).join(" ")}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "lede":
            return (
              <p key={i} className={styles.lede}>
                {block.text}
              </p>
            );

          case "p":
            return <p key={i}>{block.text}</p>;

          case "note":
            return (
              <aside key={i} className={styles.note}>
                {block.text}
              </aside>
            );

          case "quote":
            return (
              <blockquote key={i} className={styles.quote}>
                <p>“{block.text}”</p>
                {block.attribution && (
                  <cite className={styles.attribution}>{block.attribution}</cite>
                )}
              </blockquote>
            );

          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List
                key={i}
                className={`${styles.list} ${block.ordered ? styles.ordered : styles.unordered}`}
              >
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </List>
            );
          }

          case "measurements":
            return (
              <table key={i} className={styles.measurements}>
                <tbody>
                  {block.rows.map(([key, value], j) => (
                    <tr key={j}>
                      <th scope="row">{key}</th>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );

          case "figure":
            return (
              <Figure
                key={i}
                media={media[block.media]}
                caption={block.caption}
                scale={block.scale}
              />
            );
        }
      })}

      {footnotes.length > 0 && (
        <div className={styles.footnotes}>
          {footnotes.map((footnote) => (
            <p key={footnote.marker} className={styles.footnote}>
              <span className={styles.marker}>{footnote.marker}</span>
              <span>{footnote.text}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
