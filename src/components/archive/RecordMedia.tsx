import { Plate } from "@/components/plate/Plate";
import { plateName } from "@/lib/motion/names";
import type { Entry } from "@/lib/archive";

/**
 * A record's principal image.
 *
 * Real media takes precedence; a record with none draws its generative
 * plate. Either way the element carries the same transition name, so a
 * navigation from an index stays physically continuous whichever of the
 * two is currently standing in for the record.
 */
export function RecordMedia({
  entry,
  className,
}: {
  entry: Entry;
  className?: string;
}) {
  const image = entry.media.find((m) => m.kind === "image");

  if (image && image.kind === "image") {
    return (
      <img
        className={className}
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        /* The principal image of a record is above the fold by definition
           and is the largest contentful paint on the page. It is never
           lazy and it is always given priority. */
        fetchPriority="high"
        decoding="async"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          /* The placeholder sits behind the photograph at the same crop,
             so the frame carries the tonality of the image from the first
             paint and never stands empty. Half a kilobyte, inline, and it
             is covered completely the moment the real file arrives. */
          ...(image.placeholder
            ? {
                backgroundImage: `url("${image.placeholder}")`,
                backgroundSize: "cover",
                backgroundPosition: image.focal
                  ? `${image.focal[0] * 100}% ${image.focal[1] * 100}%`
                  : "center",
              }
            : null),
          objectPosition: image.focal
            ? `${image.focal[0] * 100}% ${image.focal[1] * 100}%`
            : "center",
          viewTransitionName: plateName(entry.id),
        }}
      />
    );
  }

  return (
    <div className={className}>
      <Plate
        id={entry.id}
        dept={entry.dept}
        viewTransitionName={plateName(entry.id)}
      />
    </div>
  );
}
