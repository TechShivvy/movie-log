-- Account self-deletion support (Reddit-style, not a full wipe): a
-- deleted user's PUBLIC and ANONYMOUS movie_logs -- and any
-- visit_venue_ratings tied to them -- survive account deletion, so
-- venue aggregate stats (theatre_rating_stats/screen_rating_stats) and
-- other users' venue-review pages don't retroactively lose data. Only
-- the identity behind them is gone: movie_logs.user_id/
-- visit_venue_ratings.user_id become null on delete instead of cascading
-- the row away. That already surfaces correctly with zero further
-- changes -- public_movie_log_entries/feed_entries LEFT JOIN
-- user_settings and show `username: null` for any row with no match,
-- which is exactly what happens once user_settings is gone too (it
-- still cascades, see below); the frontend already has to handle a null
-- username (today it just means "never set one"), it'll now also mean
-- "account deleted". PRIVATE movie_logs are deleted explicitly by the
-- app (services/supabase_rest.py:delete_private_movie_logs) before the
-- auth.users row goes, since there's nothing there worth preserving.
--
-- Everything else the user owns -- user_settings, follows, blocks,
-- venue_notes, daily_usage, reports they filed -- already cascades on
-- delete from auth.users (see migrations 20260709000001, 20260811000002,
-- 20260811000003, 20260811000012) and needs no change here: it's all
-- private-to-them data with no public-facing survival case.

alter table public.movie_logs
  alter column user_id drop not null;

alter table public.movie_logs
  drop constraint if exists movie_logs_user_id_fkey,
  add constraint movie_logs_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.visit_venue_ratings
  alter column user_id drop not null;

alter table public.visit_venue_ratings
  drop constraint if exists visit_venue_ratings_user_id_fkey,
  add constraint visit_venue_ratings_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

-- Unrelated latent bug fixed alongside the above: theatres.created_by /
-- screens.created_by / reports.reviewed_by reference auth.users with no
-- ON DELETE action at all (implicit RESTRICT) -- meaning ANY account
-- deletion, Reddit-style or otherwise, would have failed outright the
-- moment that user had ever created a theatre/screen or been set as a
-- report reviewer. These are attribution/audit columns, not ownership,
-- so they should survive deletion as null rather than block it.

alter table public.theatres
  drop constraint if exists theatres_created_by_fkey,
  add constraint theatres_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.screens
  drop constraint if exists screens_created_by_fkey,
  add constraint screens_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.reports
  drop constraint if exists reports_reviewed_by_fkey,
  add constraint reports_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users(id) on delete set null;
