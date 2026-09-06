-- Adds `format` (2D/3D/4DX/IMAX/...) to the public_movie_log_entries view
-- (migration 20260811000007 added the underlying movie_logs column but
-- didn't touch this view, so it silently never appeared on anyone's
-- public profile or theatre/screen review listing).
--
-- `price`/`currency` are deliberately NOT added here — same reasoning
-- migration 20260810000001 already applied to exclude booking_ref/seats/
-- ticket_image_path from this view: what someone paid is personal
-- financial detail, a different sensitivity class than language/screen/
-- certificate, which were already public. `format` has no such concern,
-- same category as those already-exposed fields.
--
-- CREATE OR REPLACE, not DROP + CREATE this time — but `format` still has
-- to go at the very end of the select list, not next to screen/screen_id
-- where it logically belongs: Postgres's CREATE OR REPLACE VIEW rejects
-- inserting a column in the middle (confirmed live — "cannot change name
-- of view column \"certificate\" to \"format\""), only a true append at
-- the end is allowed, same restriction migration 20260810000001's own
-- comment already describes.

create or replace view public.public_movie_log_entries as
select
  ml.id,
  case when ml.visibility = 'public' then ml.user_id else null end as user_id,
  case when ml.visibility = 'public' then us.username else null end as username,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility in ('anonymous', 'public');
