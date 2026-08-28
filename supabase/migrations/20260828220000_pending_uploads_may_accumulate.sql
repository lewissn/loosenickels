-- =========================================================================
-- A pending upload must not block the next one.
--
-- Migration 4 added `media_assets_one_pending`, unique on (user_id, variant)
-- where the asset is not yet attached to a revision. The reasoning written
-- beside it was "a second upload of the same photograph is a retry, and a
-- retry must not accumulate rows".
--
-- That reasoning was already served by `storage_key_unique`: a retry sends
-- the same object key and finds the same row. What the partial index
-- actually did was refuse the *next distinct photograph* for as long as any
-- unattached one existed — and unattached ones are produced by exactly the
-- ordinary failures the split between transfer and submission exists to
-- survive. One abandoned upload locked the account out of recording.
--
-- It is dropped. Orphans are swept on age, which is what should have been
-- written in the first place: an unattached asset is an abandoned upload,
-- not a conflict with anything.
-- =========================================================================

drop index if exists media_assets_one_pending;

/* The sweep index stays, and now earns its keep. Anything unattached and
   older than a day is a transfer that never became a photograph. */
comment on index media_assets_unattached is
  'Abandoned uploads: unattached assets, oldest first. Safe to delete on age.';
