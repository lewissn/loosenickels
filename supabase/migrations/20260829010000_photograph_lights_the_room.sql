-- =========================================================================
-- What a photograph does to the room around it.
--
-- The pipeline already measures both of these and has been discarding them,
-- because there was nowhere to put them. The website's whole environmental
-- idea rests on them: a dark photograph tints the ground and pulls the
-- document into its night palette, so the interface belongs to the picture
-- rather than the picture sitting on an interface.
--
-- They live on the revision rather than on a rendition, because they
-- describe the photograph itself and not any one resizing of it.
-- =========================================================================

/* Rec. 709 luma, 0 to 1. Not the mean of the channels: green reads far
   brighter to the eye than blue at the same value, and averaging them makes
   a deep blue photograph arithmetically as bright as a pale green one. */
alter table photo_revisions
  add column lightness real;

/* A single restrained colour drawn from the image, as `#rrggbb`, for the
   ground behind it. Deliberately not a palette — the interface takes one
   hint from the photograph and does not try to theme itself. */
alter table photo_revisions
  add column tone text;

alter table photo_revisions
  add constraint lightness_range
  check (lightness is null or (lightness >= 0 and lightness <= 1));

alter table photo_revisions
  add constraint tone_is_a_hex_colour
  check (tone is null or tone ~ '^#[0-9a-f]{6}$');
