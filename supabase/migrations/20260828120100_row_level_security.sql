-- =========================================================================
-- Row level security
--
-- Authorisation is decided here, not by which buttons a client renders. A
-- visitor holding the anon key and a REST client should be able to reach
-- exactly what a visitor is entitled to, and no more.
--
-- The policies compose: a revision is reachable only through an entry the
-- reader can already see, and an entry only through a profile the reader
-- can already see. Each layer therefore states one thing.
--
-- The service role bypasses all of this, which is what the processing
-- pipeline runs as. Its key must never reach a client.
-- =========================================================================

alter table profiles enable row level security;
alter table day_entries enable row level security;
alter table photo_revisions enable row level security;
alter table media_assets enable row level security;

grant select on profiles, day_entries, photo_revisions, media_assets to anon, authenticated;
grant insert, update on profiles, day_entries, photo_revisions, media_assets to authenticated;
grant delete on day_entries to authenticated;

-- -------------------------------------------------------------------------
-- profiles
-- -------------------------------------------------------------------------

create policy profiles_read on profiles
  for select using (
    id = (select auth.uid())
    or visibility in ('public', 'discoverable')
  );

create policy profiles_write on profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

/* Insert exists for completeness; in practice the signup trigger has
   already created the row. There is no delete policy — an account is
   closed through auth.users, and the cascade does the rest. */
create policy profiles_create on profiles
  for insert with check (id = (select auth.uid()));

-- -------------------------------------------------------------------------
-- day_entries
--
-- A public day inside a private profile stays private. Publishing is a
-- deliberate act at both levels, and the narrower one wins.
--
-- 'unlisted' is not yet reachable by anyone but the owner. It becomes
-- share-link visibility once there are links to check, and until then it
-- fails closed.
-- -------------------------------------------------------------------------

create policy day_entries_read on day_entries
  for select using (
    user_id = (select auth.uid())
    or (
      visibility = 'public'
      and exists (
        select 1 from profiles p
        where p.id = day_entries.user_id
          and p.visibility in ('public', 'discoverable')
      )
    )
  );

create policy day_entries_create on day_entries
  for insert with check (user_id = (select auth.uid()));

create policy day_entries_write on day_entries
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy day_entries_remove on day_entries
  for delete using (user_id = (select auth.uid()));

-- -------------------------------------------------------------------------
-- photo_revisions
--
-- Two rules that are easy to miss.
--
-- A public day exposes its current photograph and nothing else. The
-- revision history is private: what someone chose not to show is at least
-- as revealing as what they did.
--
-- There is no delete policy, and this is the whole enforcement of it.
-- Replacing a photograph must never be a way of destroying one.
-- -------------------------------------------------------------------------

create policy photo_revisions_read on photo_revisions
  for select using (
    user_id = (select auth.uid())
    or exists (
      select 1 from day_entries e
      where e.id = photo_revisions.day_entry_id
        and e.current_revision_id = photo_revisions.id
        and e.visibility = 'public'
    )
  );

create policy photo_revisions_create on photo_revisions
  for insert with check (user_id = (select auth.uid()));

create policy photo_revisions_write on photo_revisions
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -------------------------------------------------------------------------
-- media_assets
--
-- Originals stay with their owner. A published photograph is served from
-- a derivative, which the pipeline writes without the embedded metadata;
-- handing out the original would hand out the GPS tag inside it however
-- carefully the location fields were redacted.
-- -------------------------------------------------------------------------

create policy media_assets_read on media_assets
  for select using (
    exists (
      select 1 from photo_revisions r
      where r.id = media_assets.photo_revision_id
        and (r.user_id = (select auth.uid()) or media_assets.variant <> 'original')
    )
  );

create policy media_assets_create on media_assets
  for insert with check (
    exists (
      select 1 from photo_revisions r
      where r.id = media_assets.photo_revision_id
        and r.user_id = (select auth.uid())
    )
  );

create policy media_assets_write on media_assets
  for update using (
    exists (
      select 1 from photo_revisions r
      where r.id = media_assets.photo_revision_id
        and r.user_id = (select auth.uid())
    )
  );
