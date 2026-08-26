-- Phase 3 of plan.md: home/following feed.

-- Additive RLS policy on movie_logs itself -- defense in depth for any
-- direct authenticated read of the raw table (the feed listing below goes
-- through a view instead, see the comment on that for why this policy
-- alone isn't sufficient). Permissive/additive alongside the existing
-- movie_logs_select_own policy -- Postgres ORs permissive policies
-- together, so this only ever adds visibility, never removes any.
drop policy if exists "movie_logs_select_followed_public" on public.movie_logs;
create policy "movie_logs_select_followed_public"
on public.movie_logs for select to authenticated
using (
  auth.uid() is not null
  and visibility = 'public'
  and public.can_view_user_content(user_id)
);

-- feed_entries: a *view*, not a query straight against movie_logs, for the
-- same reason public_movie_log_entries already is one -- but with one
-- critical difference. public_movie_log_entries' anon grant only works at
-- all *because* views in this project run with the view owner's rights on
-- the underlying table (Postgres's pre-security_invoker default), not the
-- querying role's -- proven by anon having zero RLS policies on
-- movie_logs, yet reading through that view just fine. That means a
-- feed_entries view built the same way would silently bypass the
-- movie_logs_select_followed_public policy above rather than depend on
-- it, so the real filter has to be repeated explicitly in this view's own
-- where clause -- exactly like public_movie_log_entries already does with
-- `visibility in (...)`. The RLS policy above still matters (defense in
-- depth for direct authenticated table reads outside this view), it's
-- just not what the feed itself actually relies on.
--
-- ml.user_id <> auth.uid() excludes the caller's own logs -- a feed of
-- your own logs isn't a feed. Granted to authenticated only, not anon --
-- the feed requires real sign-in, no anonymous variant, unlike every
-- other public-read view/RPC so far.
create or replace view public.feed_entries as
select
  ml.id, ml.user_id, us.username, us.display_name, us.avatar_path,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility = 'public'
  and auth.uid() is not null
  and ml.user_id <> auth.uid()
  and public.can_view_user_content(ml.user_id);

revoke all on public.feed_entries from anon, authenticated;
grant select on public.feed_entries to authenticated;
