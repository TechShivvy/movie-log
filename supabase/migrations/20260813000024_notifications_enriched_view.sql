-- Phase 6 of plan.md: GET /notifications previously returned raw
-- actor_id/movie_log_id/comment_id/report_id uuids with nothing to
-- resolve them to -- no endpoint exists to look a user up by id (only
-- by username), so a frontend genuinely could not render "Alex commented
-- on your log" from what the API gave it. This view joins in exactly
-- enough to render a real notification center: the actor's identity, and
-- a content preview scoped to what each type actually needs.
--
-- Views run with the *view owner's* rights on the underlying tables, not
-- the querying role's (the recurring gotcha noted throughout this
-- schema) -- notifications' own notifications_select_own RLS would be
-- silently bypassed by this view if its condition weren't repeated here
-- explicitly, so it is, verbatim (recipient_id = auth.uid()). Reading
-- the joined movie_logs/movie_log_comments/reports rows under owner
-- rights is intentional and safe here: every row this view can return is
-- already scoped to *this caller's own* notification, so previewing "my
-- own log", "my own comment", or "my own filed report" back to me is
-- never a cross-user leak the same way it would be for an arbitrary join.
create or replace view public.notifications_view as
select
  n.id, n.recipient_id, n.actor_id,
  us.username as actor_username, us.avatar_path as actor_avatar_path,
  n.type,
  n.movie_log_id, ml.movie,
  n.comment_id, c.text as comment_preview,
  n.report_id, r.status as report_status,
  n.read, n.created_at
from public.notifications n
left join public.user_settings us on us.user_id = n.actor_id
left join public.movie_logs ml on ml.id = n.movie_log_id
left join public.movie_log_comments c on c.id = n.comment_id
left join public.reports r on r.id = n.report_id
where n.recipient_id = auth.uid();

-- Never anon -- notifications are never public, same as the base table.
revoke all on public.notifications_view from anon, authenticated;
grant select on public.notifications_view to authenticated;
