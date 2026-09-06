-- Replaces is_discoverable (search-only visibility, added in 20260710000001)
-- with a single is_public flag governing everything: Instagram-style
-- public/private. is_discoverable turned out to have no remaining job once
-- private accounts are still meant to be searchable (decided during design
-- of this migration) — a toggle only earns its keep if some state needs it
-- to disagree with is_public, and none does: search never filtered on
-- is_public, and the profile page's content already depends on is_public
-- alone. Two switches producing the same outcome everywhere is just
-- surface area, so it's removed rather than left dormant.
--
-- New model, one flag:
--   is_public (default false — private, matching every other privacy
--   default in this schema) — controls whether GET /users/{username}
--   returns any logs. The route itself always resolves by username
--   regardless of is_public (a private profile still exists, it's just
--   locked) — a stable, chosen identifier someone was already given
--   shouldn't die because they went private, unlike a random opaque link.
--   Search (GET /users/search) is unrestricted by privacy state — a
--   private account still turns up in search, same as a private Instagram
--   account does; the lock only bites once you open the profile.

alter table public.user_settings
  add column if not exists is_public boolean not null default false;

-- Must drop the policy that references is_discoverable before the column
-- itself — Postgres won't drop a column a policy still depends on. The
-- replacement policy is created further down, after the narrowed grant
-- section, same as before.
drop policy if exists "user_settings_select_discoverable" on public.user_settings;

alter table public.user_settings
  drop column if exists is_discoverable;

-- ── GET /users/{username}: username-only lookup. security definer (runs
--    as table owner) so it isn't limited by the narrowed anon grant below
--    — it does its own filtering instead of relying on RLS/grants for
--    what's readable.
drop function if exists public.get_public_profile_by_username(text);
create function public.get_public_profile_by_username(p_username text)
returns table (user_id uuid, username text, display_name text, bio text, is_public boolean)
language sql stable security definer
set search_path = public
as $$
  select user_id, username, display_name, bio, is_public
  from public.user_settings
  where lower(username) = lower(p_username)
  limit 1;
$$;

revoke all on function public.get_public_profile_by_username(text) from public;
grant execute on function public.get_public_profile_by_username(text) to anon, authenticated;

-- ── search_public_users: no privacy filter at all now — a private account
--    is still findable by search, it just shows locked once opened. Also
--    returns is_public so the client can render the lock indicator
--    directly in results. Return type/body changed, so drop+create, not
--    create or replace — Postgres won't let create or replace change a
--    function's out columns.
drop function if exists public.search_public_users(text, int);
create function public.search_public_users(p_query text, p_limit int default 20)
returns table (user_id uuid, username text, display_name text, bio text, is_public boolean)
language sql stable security definer
set search_path = public
as $$
  select user_id, username, display_name, bio, is_public
  from public.user_settings
  where username ilike '%' || p_query || '%' or display_name ilike '%' || p_query || '%'
  order by case when username ilike p_query || '%' then 0 else 1 end, username
  limit p_limit;
$$;

revoke all on function public.search_public_users(text, int) from public;
grant execute on function public.search_public_users(text, int) to anon, authenticated;

-- ── Narrow the raw-table anon grant. 20260710000003 granted anon full-row
--    SELECT reasoning that every column was "already meant to be readable
--    once a user opts into is_discoverable" — an explicit, deliberate
--    opt-in that no longer exists. Actual profile content now goes
--    exclusively through the security-definer RPC above, which bypasses
--    this grant entirely (runs as table owner). The only remaining direct
--    anon table read is is_profile_reportable's existence check
--    (services/supabase_rest.py), which needs nothing beyond
--    user_id/username — so that's all anon gets. Scoped to anon only (not
--    authenticated, unlike the policy it replaces) — no authenticated code
--    path reads *other* users' rows through this policy; their own row
--    stays fully readable via the separate, pre-existing "select own"
--    policy.
create policy "user_settings_select_has_username"
on public.user_settings
for select
to anon
using (username is not null);

revoke all on public.user_settings from anon;
grant select (user_id, username) on public.user_settings to anon;
