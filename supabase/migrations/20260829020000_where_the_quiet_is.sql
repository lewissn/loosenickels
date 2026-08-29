-- =========================================================================
-- Where a photograph is quiet, and where it is busy.
--
-- The brief asks for art direction that responds to the image: put the
-- writing where the picture leaves room, take the ink colour from what is
-- behind it, avoid the busy half. It also says, rightly, that this need not
-- become a computer-vision project.
--
-- So: a coarse grid of measurements, taken once by the pipeline that is
-- already decoding the file anyway, and stored with the revision. Four
-- columns by six rows, each cell carrying its mean luma and how much that
-- luma varies within the cell.
--
-- Luma says whether ink over that area should be pale or dark. Variance says
-- whether it should be there at all — a cell of even tone is sky or wall or
-- water and will hold text; a cell of high variance is branches or a crowd
-- and will swallow it. Between them they answer the two questions the layout
-- actually has, and they cost one pass over a 32-pixel thumbnail.
--
-- jsonb rather than columns because it is 24 pairs that are only ever read
-- as a whole, and never queried across.
-- =========================================================================

alter table photo_revisions
  add column regions jsonb;

comment on column photo_revisions.regions is
  '4x6 grid, row-major from the top-left: [{"l":0..1,"v":0..1}, …]. '
  'l is mean Rec.709 luma, v is normalised variance within the cell. '
  'Written by the derivative pipeline; absent for revisions processed '
  'before this existed, and every reader must cope with that.';
