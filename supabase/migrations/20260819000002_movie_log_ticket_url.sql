-- ticket_url: a link to the booking/ticket itself (a shared BookMyShow/
-- Fandango/etc. confirmation link), alongside the existing
-- ticket_image_path. Same always-private treatment as that column, for
-- the same reason — a real booking confirmation link routinely carries
-- an order id or other identifying info in the URL itself (see
-- routers/movie_metadata.py's /extract-from-link section on how much a
-- real confirmation page can leak), same sensitivity class as
-- booking_ref/ticket_image_path.
--
-- Needs no view change to stay excluded from public_movie_log_entries/
-- feed_entries: both explicitly whitelist columns rather than
-- `select *` (see migration 20260813000027), so a brand new movie_logs
-- column is excluded from them by construction, not by an extra filter
-- that has to be remembered.

alter table public.movie_logs
  add column if not exists ticket_url text;
