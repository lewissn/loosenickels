-- =========================================================================
-- An asset may exist before the day it belongs to.
--
-- `SubmitPhoto.assetId` describes "an asset that has already been uploaded
-- to object storage and registered", and says why: submission is a separate
-- step from transfer, so that a failed commit does not mean re-sending the
-- bytes over a bad connection. That is the right design for a product whose
-- users are outdoors on phones.
--
-- The foundation could not express it. `media_assets.photo_revision_id` was
-- NOT NULL, so no asset could exist until a revision did, which meant every
-- upload had to open a day first and every abandoned upload left a half-
-- written day behind it. And all three media policies decided ownership by
-- joining through that same revision, so an unattached asset would have
-- been invisible to the person who had just uploaded it.
--
-- Both are fixed here: an asset carries its own owner, always, and finds
-- out which day it belongs to later.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Ownership, stated on the row rather than inferred through a join.
-- -------------------------------------------------------------------------

alter table media_assets
  add column user_id uuid references profiles (id) on delete cascade;

/* Existing rows learn their owner from the revision they hang off, which is
   where it was until now. */
update media_assets a
   set user_id = r.user_id
  from photo_revisions r
 where r.id = a.photo_revision_id
   and a.user_id is null;

alter table media_assets
  alter column user_id set not null;

-- -------------------------------------------------------------------------
-- The attachment becomes optional.
-- -------------------------------------------------------------------------

alter table media_assets
  alter column photo_revision_id drop not null;

/* The uniqueness rule was `(photo_revision_id, variant)`, and in Postgres a
   NULL is distinct from every other NULL — so that constraint would have
   permitted any number of unattached originals per user while still
   correctly forbidding two thumbnails on one revision. It is left in place
   for the attached case and paired with a partial index for the other:
   one pending original at a time, per person. A second upload of the same
   photograph is a retry, and a retry must not accumulate rows. */
create unique index media_assets_one_pending
  on media_assets (user_id, variant)
  where photo_revision_id is null;

/* The pipeline and the reaper both want these. An asset that never got
   attached is an abandoned upload, and something will eventually have to
   sweep them. */
create index media_assets_unattached
  on media_assets (user_id, created_at)
  where photo_revision_id is null;

-- =========================================================================
-- Policies
--
-- Ownership now reads from the row. The join through photo_revisions
-- survives only where it was doing the other job: deciding whether a
-- *visitor* may see a derivative of a public day.
-- =========================================================================

drop policy media_assets_read on media_assets;

create policy media_assets_read on media_assets
  for select using (
    /* Yours is yours, attached or not, original or not. */
    user_id = (select auth.uid())
    or (
      /* Anyone else may see a derivative, and only a derivative, and only
         of a revision they are already permitted to read. The original is
         withheld from everyone but the owner however carefully the location
         columns were redacted, because the embedded EXIF carries the GPS
         tag out past all of it. */
      variant <> 'original'
      and photo_revision_id is not null
      and exists (
        select 1
          from photo_revisions r
         where r.id = media_assets.photo_revision_id
      )
    )
  );

drop policy media_assets_create on media_assets;

create policy media_assets_create on media_assets
  for insert with check (
    user_id = (select auth.uid())
    and (
      photo_revision_id is null
      or exists (
        select 1
          from photo_revisions r
         where r.id = media_assets.photo_revision_id
           and r.user_id = (select auth.uid())
      )
    )
  );

drop policy media_assets_write on media_assets;

create policy media_assets_write on media_assets
  for update using (user_id = (select auth.uid()))
  with check (
    /* An asset cannot be attached to somebody else's revision — which is
       the whole of what this check is guarding, since attaching is the only
       update the application makes. */
    user_id = (select auth.uid())
    and (
      photo_revision_id is null
      or exists (
        select 1
          from photo_revisions r
         where r.id = media_assets.photo_revision_id
           and r.user_id = (select auth.uid())
      )
    )
  );
