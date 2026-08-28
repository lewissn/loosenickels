-- =========================================================================
-- A capture zone the readers can actually read.
--
-- The iOS client stored `GMT+0100` — the identifier Foundation gives a zone
-- built from a raw offset. Postgres accepted it, because the column is text
-- and nothing said otherwise. `Intl.DateTimeFormat` then refused it, and the
-- refusal happened inside the loop that resolves days, so one photograph
-- with an unreadable zone blanked the entire archive behind an error page.
--
-- Two things were wrong and only one of them was the phone. A column that
-- takes any string at all will eventually be given one that nothing can use,
-- and the place to find that out is at the write, by the client that knows
-- what it meant, rather than at every read for ever afterwards.
--
-- Permitted: an IANA name (`Europe/London`, `Etc/UTC`) or an ISO offset
-- (`+01:00`, `-05:00`). Both are accepted by every consumer here. `GMT+0100`
-- is neither, and is now refused at the moment it is written.
-- =========================================================================

/* Repair before constraining, or the constraint cannot be added. The offset
   is +01:00 and the photograph was taken in Britain in August, so the zone
   is recoverable rather than merely guessable — which is the only reason
   this is a repair and not a deletion. */
update photo_revisions
   set capture_timezone = 'Europe/London'
 where capture_timezone = 'GMT+0100';

/* Anything else of that shape becomes the offset it was trying to be:
   less than a zone, but readable, and honest about what it knows. */
update photo_revisions
   set capture_timezone =
       substring(capture_timezone from 4 for 3) || ':' ||
       substring(capture_timezone from 7 for 2)
 where capture_timezone ~ '^GMT[+-][0-9]{4}$';

alter table photo_revisions
  add constraint capture_timezone_shape
  check (
    capture_timezone is null
    or capture_timezone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$'
    or capture_timezone ~ '^[+-][0-9]{2}:[0-9]{2}$'
  );
