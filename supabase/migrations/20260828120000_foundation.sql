-- =========================================================================
-- Foundation: user → day entry → photo revision → media asset
--
-- Four tables and the rules that hold them together. The rules live here
-- rather than in application code because there are two clients and they
-- are not allowed to disagree about what is true.
--
-- Nothing in this file names the product. Table, column and type names are
-- neutral so that a rename stays a configuration exercise.
-- =========================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- Vocabularies
-- -------------------------------------------------------------------------

create type profile_visibility as enum ('private', 'public', 'discoverable');

create type entry_visibility as enum ('private', 'unlisted', 'public');

/* Ordered by increasing disclosure, so `<=` is a meaningful comparison:
   anything at or below the level a viewer is entitled to may be shown. */
create type location_privacy as enum (
  'hidden',
  'region',
  'locality',
  'approximate',
  'precise'
);

create type processing_state as enum ('pending', 'processing', 'ready', 'failed');

create type media_variant as enum ('original', 'large', 'medium', 'thumbnail');

-- -------------------------------------------------------------------------
-- Shared triggers
-- -------------------------------------------------------------------------

create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- profiles
--
-- One row per account, total over auth.users. A profile always exists so
-- that no query has to cope with a signed-in user who has none.
-- -------------------------------------------------------------------------

create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  handle          text not null,
  display_name    text,
  location_label  text,
  bio             text,
  visibility      profile_visibility not null default 'private',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint handle_is_lowercase check (handle = lower(handle)),
  constraint handle_shape check (handle ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$'),
  constraint bio_length check (bio is null or char_length(bio) <= 500)
);

create unique index profiles_handle_key on profiles (handle);

create trigger profiles_touch
  before update on profiles
  for each row execute function touch_updated_at();

/* Signing up creates the profile. The handle is a placeholder the account
   owner is expected to replace during onboarding; it is generated rather
   than derived from the email address, which is not theirs to publish. */
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle)
  values (new.id, 'u' || substr(replace(new.id::text, '-', ''), 1, 12));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -------------------------------------------------------------------------
-- day_entries
--
-- At most one per user per calendar date. That single unique constraint is
-- the product; everything else is decoration.
-- -------------------------------------------------------------------------

create table day_entries (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references profiles (id) on delete cascade,

  /* Deliberately without a default. A day must be stated by whoever knows
     which day it was where the photograph was taken. If this column could
     fall back to the server's idea of today, it eventually would, and a
     photograph taken at 23:40 in Tokyo would file itself under the wrong
     date for anyone whose server lives in London. */
  entry_date           date not null,

  note                 text,
  visibility           entry_visibility not null default 'private',
  current_revision_id  uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint one_entry_per_day unique (user_id, entry_date),
  constraint note_length check (note is null or char_length(note) <= 1000),
  /* The year photography began. A floor only to catch mistyped years. */
  constraint entry_date_floor check (entry_date >= date '1826-01-01')
);

create trigger day_entries_touch
  before update on day_entries
  for each row execute function touch_updated_at();

/* The ceiling cannot be a CHECK — current_date is not immutable. A user on
   the far side of the date line is legitimately a day ahead of the server,
   and no further. Anything beyond that is a clock or a conversion bug, and
   it should fail loudly at the moment it happens rather than surface years
   later as a photograph filed under a day that had not occurred. */
create function guard_entry_date() returns trigger
language plpgsql as $$
begin
  if new.entry_date > current_date + 1 then
    raise exception
      'entry_date % is ahead of the leading edge of the calendar (%)',
      new.entry_date, current_date + 1;
  end if;
  return new;
end;
$$;

create trigger day_entries_guard_date
  before insert or update of entry_date on day_entries
  for each row execute function guard_entry_date();

-- -------------------------------------------------------------------------
-- photo_revisions
--
-- Replacing a photograph appends here. Nothing in this schema removes a
-- row from this table.
-- -------------------------------------------------------------------------

create table photo_revisions (
  id                   uuid primary key default gen_random_uuid(),
  day_entry_id         uuid not null references day_entries (id) on delete cascade,
  /* Carried alongside the entry so authorisation does not need a join. */
  user_id              uuid not null references profiles (id) on delete cascade,
  revision_number      integer not null,

  /* Four separate facts, none derivable from the others. The capture
     timezone is the IANA name recorded by the device at the moment of
     capture, and it is the only thing that can later explain the entry
     date to somebody looking at a UTC timestamp. */
  captured_at          timestamptz,
  capture_timezone     text,
  submitted_at         timestamptz not null default now(),

  state                processing_state not null default 'pending',
  failure_reason       text,
  /* Inlineable low-quality placeholder, held here rather than per variant
     because it describes the photograph, not any one rendering of it. */
  placeholder          text,

  width                integer,
  height               integer,
  orientation          smallint,

  camera_make          text,
  camera_model         text,
  lens                 text,
  focal_length_mm      numeric(6, 2),
  aperture             numeric(4, 2),
  exposure_seconds     numeric(12, 6),
  iso                  integer,

  latitude             double precision,
  longitude            double precision,
  altitude_m           double precision,
  accuracy_m           double precision,
  place_name           text,
  locality             text,
  region               text,
  country              text,
  /* Withheld until the account owner decides otherwise. */
  location_privacy     location_privacy not null default 'hidden',

  /* The historical result as it stood when the entry was processed, kept
     whole. Weather is supplementary and is never queried across, so it
     does not earn columns of its own. */
  weather              jsonb,
  weather_recorded_at  timestamptz,

  created_at           timestamptz not null default now(),

  constraint revision_number_positive check (revision_number > 0),
  constraint one_number_per_entry unique (day_entry_id, revision_number),
  /* Lets a day entry's pointer be constrained to its own revisions. */
  constraint revision_identity unique (id, day_entry_id),
  constraint latitude_range check (latitude is null or latitude between -90 and 90),
  constraint longitude_range check (longitude is null or longitude between -180 and 180),
  constraint coordinates_are_a_pair check ((latitude is null) = (longitude is null)),
  constraint dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
  )
);

/* A day may only point at one of its own revisions. Deferred because
   deleting an entry cascades into the revisions it points at, and both
   sides are only consistent again once the statement has finished. The
   cost of deferring is that a bad pointer is reported at commit rather
   than at the statement that wrote it. */
alter table day_entries
  add constraint current_revision_belongs_to_entry
  foreign key (current_revision_id, id)
  references photo_revisions (id, day_entry_id)
  deferrable initially deferred;

/* Numbering is the database's job. Two uploads racing for the same number
   is then a unique violation the caller can retry, rather than two rows
   both believing they are revision 3. */
create function next_revision_number() returns trigger
language plpgsql as $$
begin
  if new.revision_number is null then
    select coalesce(max(revision_number), 0) + 1
      into new.revision_number
      from photo_revisions
     where day_entry_id = new.day_entry_id;
  end if;
  return new;
end;
$$;

create trigger photo_revisions_number
  before insert on photo_revisions
  for each row execute function next_revision_number();

/* The pipeline's work queue. */
create index photo_revisions_unfinished
  on photo_revisions (created_at)
  where state <> 'ready';

/* The map reads only from entries that have somewhere to be. */
create index photo_revisions_located
  on photo_revisions (user_id)
  where latitude is not null;

-- -------------------------------------------------------------------------
-- media_assets
--
-- One row per rendering of a photograph. The bytes live in object storage;
-- this table only ever holds the key that finds them.
-- -------------------------------------------------------------------------

create table media_assets (
  id                 uuid primary key default gen_random_uuid(),
  photo_revision_id  uuid not null references photo_revisions (id) on delete cascade,
  variant            media_variant not null,

  /* Object key. Neutral, opaque and not guessable from anything a visitor
     can see; the bucket has no public access and every read is a
     short-lived signed URL minted after the session has been checked. */
  storage_key        text not null,

  content_type       text not null,
  byte_size          bigint not null,
  width              integer not null,
  height             integer not null,
  checksum           text,
  created_at         timestamptz not null default now(),

  constraint one_asset_per_variant unique (photo_revision_id, variant),
  constraint storage_key_unique unique (storage_key),
  constraint byte_size_positive check (byte_size > 0),
  constraint asset_dimensions_positive check (width > 0 and height > 0)
);
