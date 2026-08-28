-- =========================================================================
-- What the archive interface needs and the foundation did not have.
--
-- The foundation was written before `ArchiveSource` existed. Four of that
-- interface's promises had nowhere to live: a day's own time zone, a
-- profile-level ceiling on disclosed location, soft deletion, and a way to
-- make a retried submission safe. Each is added here with the reasoning,
-- because each is a rule rather than a field.
-- =========================================================================

-- -------------------------------------------------------------------------
-- The zone a person's days are reckoned in.
--
-- `ArchiveStatus.today` is the user's today, not the server's, and there is
-- no request-time source for that: a browser can offer one, the iOS client
-- can offer another, and a photograph submitted at ten past midnight must
-- not land on a different date depending on which one asked. So it is a
-- property of the account, stated once.
-- -------------------------------------------------------------------------

alter table profiles
  add column time_zone text not null default 'Etc/UTC';

/* IANA names only. Not a full validation — Postgres cannot enumerate the
   zone database in a check constraint — but it refuses the shapes that
   actually get sent by mistake: an offset like '+01:00', an abbreviation
   like 'BST', or an empty string. */
alter table profiles
  add constraint time_zone_shape
  check (time_zone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$');

-- -------------------------------------------------------------------------
-- The profile's ceiling on published location.
--
-- A per-day `location_privacy` can narrow what is disclosed. It must never
-- widen it, and there was nothing for it to be measured against. This is
-- that thing: whatever a day says, a visitor sees no more than this.
--
-- Note the asymmetry, which is deliberate. The owner is not capped by this
-- column at all — they see what they recorded. It governs disclosure, not
-- storage.
-- -------------------------------------------------------------------------

alter table profiles
  add column location_precision location_privacy not null default 'hidden';

-- -------------------------------------------------------------------------
-- Soft deletion.
--
-- Deleting a day is explicit, reversible for a period, and is emphatically
-- not what replacing a photograph does. `on delete cascade` further down
-- this schema would take the revisions and the media rows with it, so a
-- real DELETE is the wrong instrument for a user pressing "delete".
--
-- A deleted day is hidden from its owner as well as from visitors. It is
-- recoverable by support, not by browsing.
-- -------------------------------------------------------------------------

alter table day_entries
  add column deleted_at timestamptz;

/* The unique constraint on (user_id, entry_date) still holds across deleted
   rows, which is correct: recording a day, deleting it and recording it
   again should restore that day rather than create a second one. */

create index day_entries_live
  on day_entries (user_id, entry_date desc)
  where deleted_at is null;

-- -------------------------------------------------------------------------
-- Idempotent submission.
--
-- A phone that loses signal after the request left but before the response
-- arrived will retry. Without a key, that retry is a second revision of the
-- same photograph, and the user's day quietly acquires a duplicate they
-- never asked for.
--
-- Scoped per user rather than globally: a key is generated on a device and
-- two devices are entitled to collide.
-- -------------------------------------------------------------------------

alter table photo_revisions
  add column idempotency_key text;

create unique index photo_revisions_idempotent
  on photo_revisions (user_id, idempotency_key)
  where idempotency_key is not null;

-- =========================================================================
-- Policies that have to change
--
-- A soft-deleted day must stop being readable the moment it is deleted.
-- Adding the column without this would leave every deleted day fully
-- visible, which is the worst possible outcome — the user is told it is
-- gone and it is not.
-- =========================================================================

drop policy day_entries_read on day_entries;

create policy day_entries_read on day_entries
  for select using (
    deleted_at is null
    and (
      user_id = (select auth.uid())
      or (
        visibility = 'public'
        and exists (
          select 1
            from profiles p
           where p.id = day_entries.user_id
             and p.visibility in ('public', 'discoverable')
        )
      )
    )
  );

/* Revisions and media are reached through their day, so a day that has
   stopped being readable takes them with it — but only where the policy
   actually joins back to day_entries. This one does not, so it is
   restated. */

drop policy photo_revisions_read on photo_revisions;

create policy photo_revisions_read on photo_revisions
  for select using (
    exists (
      select 1
        from day_entries e
       where e.id = photo_revisions.day_entry_id
         and e.deleted_at is null
         and (
           e.user_id = (select auth.uid())
           or (
             e.visibility = 'public'
             and exists (
               select 1
                 from profiles p
                where p.id = e.user_id
                  and p.visibility in ('public', 'discoverable')
             )
           )
         )
    )
  );
