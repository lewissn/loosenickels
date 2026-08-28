"use client";

import { useMemo, useState } from "react";
import type { ResolvedDay } from "@/lib/archive/schema";
import { compareDates, today } from "@/lib/util/calendar";
import { DayViewer } from "./DayViewer";
import { Compose } from "./Compose";

/* =========================================================================
   The archive, as the browser holds it

   The server hands over the days it knows about; anything recorded during
   this session is merged on top. One day per date, newest first — the same
   invariant the database will enforce with a unique index, applied here so
   the interface cannot be shown two photographs for one day even briefly.

   Recording currently lives only in this component's state, because there is
   no database and no object storage yet. That is a real limitation and the
   interface says so rather than implying otherwise: a photograph recorded
   here is gone on reload.

   What it is not is throwaway. The object handed up from Compose is already
   the shape ArchiveSource.submit takes, so connecting this to a real backend
   is replacing the body of `record` with a call through the seam — not
   rebuilding the flow.
   ========================================================================= */

interface Props {
  days: ResolvedDay[];
  timeZone: string;
  status?: { todayRecorded: boolean };
}

export function Archive({ days, timeZone, status }: Props) {
  const [recorded, setRecorded] = useState<ResolvedDay[]>([]);

  const merged = useMemo(() => {
    /* Later writes win, which is what makes recording over an existing day a
       replacement rather than a duplicate. */
    const byDate = new Map<string, ResolvedDay>();
    for (const day of days) byDate.set(day.date, day);
    for (const day of recorded) byDate.set(day.date, day);

    return [...byDate.values()].sort((a, b) => compareDates(b.date, a.date));
  }, [days, recorded]);

  const existing = useMemo(
    () => new Set(merged.map((d) => d.date)),
    [merged],
  );

  /* Asked of the merged archive rather than carried down from the server,
     so that recording today silences the line immediately. Once a day is
     recorded it is complete, and the product stops mentioning it. */
  const todayRecorded = existing.has(today(timeZone));

  return (
    <>
      <DayViewer
        days={merged}
        timeZone={timeZone}
        status={status ? { todayRecorded } : undefined}
      />
      <Compose
        timeZone={timeZone}
        existing={existing}
        onRecord={(day) => setRecorded((all) => [...all, day])}
      />
    </>
  );
}
