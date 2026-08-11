# Social features implementation plan: profiles, follow/block, visibility tiers, feed

## Context

The backend currently supports a single public/private account flag (`is_public`,
[backend/app/schemas/public_profile.py](backend/app/schemas/public_profile.py)) with no
relationship model — anyone can read a public profile, nobody can follow anyone, and
there's no feed. This plan adds:

- Profile picture, bio (already exists but was never settable), and up to 5 optional
  profile links — like Instagram's "edit profile" screen.
- A 3-state account visibility tier (`public` / `followers_only` / `private`), replacing
  the boolean `is_public`.
- One-directional follow relationships (follower/followee, Instagram/Twitter-style, not a
  mutual "friends" model) with follow requests required only for `followers_only`/`private`
  accounts.
- Block, which severs any existing follow relationship, prevents new ones, and hides both
  parties from each other's profile view and search results.
- A home/following feed: reverse-chronological `public`-visibility logs from accounts the
  caller follows.

No frontend exists yet, so every phase below is verified the same way the last two features
in this branch were ([`4bf0944`](../../commit/4bf0944), [`is_public` migration](supabase/migrations/20260811000010_account_privacy.sql)):
throwaway Supabase test users created via the Auth Admin API, exercised through the real
running backend over HTTP, then deleted.

**Each phase below is one commit** — they're ordered so each is buildable and independently
verifiable on top of the last; later phases depend on earlier ones' schema (e.g. the feed's
RLS policy needs `can_view_user_content`, which needs the `follows` table).

---

## Established conventions this plan follows (don't re-derive, just match)

- **RLS shape**: `to authenticated`, `(select auth.uid())` wrapped, explicit null guard —
  see [supabase/migrations/20260709000002_rls_hardening.sql](supabase/migrations/20260709000002_rls_hardening.sql).
- **New tables start with zero grants** — Postgres default privileges were revoked
  project-wide in [20260710000002_venue_refinements.sql](supabase/migrations/20260710000002_venue_refinements.sql);
  every new table needs an explicit `grant`.
- **security definer** used for two reasons only: (a) bypass a deliberately narrowed
  grant/RLS to read/write across users (`search_public_users`, `get_public_profile_by_username`),
  or (b) fully lock a table and force access through explicit RPCs (`extraction_cache`'s RPCs).
- **Upsert pattern**: `POST` with `Prefer: resolution=merge-duplicates,return=representation`
  and `params={'on_conflict': '<pk columns>'}` — see `update_account_privacy` in
  [backend/app/services/supabase_rest.py](backend/app/services/supabase_rest.py).
- **Pagination**: `Annotated[int, Query(ge=1, le=100)] = 20` / `Annotated[int, Query(ge=0)] = 0`,
  passed to PostgREST as stringified `limit`/`offset` + explicit `order` — see
  `list_theatre_reviews` in the same file. No settings-driven page-size convention exists
  today; this plan keeps the per-route-hardcoded pattern rather than inventing a new one.
- **APIError**: `APIError(status_code, code, message)` — see
  [backend/app/utils/errors.py](backend/app/utils/errors.py); the "catch a generic 400
  conflict, re-raise with a precise code" template is in `routers/public_profile.py`'s
  `set_username` (→ `409 USERNAME_TAKEN`).
- **Every route needs its own `@limiter.limit(_DEFAULT_LIMIT)`** — a documented slowapi quirk
  in [backend/app/rate_limit.py](backend/app/rate_limit.py) means undecorated routes are
  silently exempt from rate limiting, not defaulted.

---

## Phase 1 — Profile fields, avatar bucket, account visibility rename

**Commit**: `feat(public): profile picture, bio/links, and 3-state account visibility`

- New migration `supabase/migrations/20260811000011_profile_fields_and_avatar.sql`:
  - `user_settings.account_visibility text not null default 'private' check (in ('public','followers_only','private'))`, backfilled from `is_public`, which is then dropped.
  - `user_settings.avatar_path text`, `user_settings.profile_links jsonb not null default '[]'` with a `jsonb_array_length(...) <= 5` check.
  - New **public** `avatar-images` storage bucket (`public: true` — deliberately unlike the private `ticket-images` bucket, since avatars aren't sensitive and a public bucket needs no signed-URL backend work). Same `{user_id}/...`-prefix RLS shape as `ticket-images`, plus an open `select` policy for anyone (matches the bucket being public).
  - `get_public_profile_by_username`/`search_public_users` RPCs re-created (drop+create — return shape changes) to surface the new columns; not yet block/follow-aware (that's Phase 3).
- `backend/app/schemas/_validators.py` (new): move `_validate_image_path` out of
  `schemas/movie_logs.py` verbatim — now shared by `ticket_image_path` and the new `avatar_path`.
- `backend/app/schemas/public_profile.py`: `AccountVisibility` literal, `AccountPrivacyUpdate`
  updated to `account_visibility`, new `ProfileLink{label, url}` and `ProfileUpdate{display_name?, bio?, avatar_path?, profile_links?}` (bundled into one endpoint — deliberate deviation from the one-field-per-endpoint pattern `username`/`privacy`/`revisit-prefill` use, since these four are naturally a single "edit profile" action).
- `backend/app/routers/public_profile.py`: new `PATCH /public/me/profile`; `set_privacy` updated for the renamed field.
- `backend/app/services/supabase_rest.py`: `update_profile(user_token, user_id, patch: dict)` (generalizes the single-field upsert shape to multiple optional columns at once); `update_account_privacy` renamed field.

**Verification**: one throwaway user — set username, `PATCH /me/profile` with all 4 fields (avatar path both correctly-prefixed and wrongly-prefixed, confirming rejection), confirm `GET /users/{username}` reflects them; confirm `account_visibility` accepts all 3 values and rejects a 4th.

---

## Phase 2 — Follow relationships and blocking

**Commit**: `feat(public): one-directional follow relationships and blocking`

- New migration `supabase/migrations/20260811000012_follows_and_blocks.sql`:
  - `follows(follower_id, followee_id, status 'pending'|'accepted', ...)`, composite PK, `no_self_follow` check. RLS is genuinely new here — two different-privilege columns instead of one owner column: both parties can `select` a row they're part of, only the follower can `insert`, only the followee can `update` (accept), either party can `delete` (unfollow vs. remove/reject).
  - `blocks(blocker_id, blocked_id, ...)`, composite PK, `no_self_block` check. Deliberately asymmetric RLS — only the blocker gets any access at all; the blocked party never reads a block row directly, only observes its effects.
  - `enforce_block_side_effects()` trigger (security definer, `after insert on blocks`): deletes any `follows` row between the two parties in either direction.
  - `check_no_block_before_follow()` trigger (security definer, `before insert on follows`): rejects a new follow if a block exists either direction — defense in depth behind the router's own pre-check.
  - `can_view_user_content(p_target uuid) returns boolean` (security definer): `true` for the owner; else by `account_visibility` — `public`→true, `private`→false, `followers_only`→`exists` an `accepted` follow row. This is the one genuinely new piece with no prior precedent in the codebase; every later phase's content-gating reuses it.
- `backend/app/schemas/follows.py` (new): `FollowRelationship`, `FollowUser`.
- `backend/app/routers/follows.py` (new), mounted at `{api_prefix}/public` (same prefix as `public_profile.py`, split into its own file the same way `movie_logs.py`/`venues.py` are split):
  - `POST /public/follows/{username}` — resolves target, 404 unknown, 403 `BLOCKED` if blocked, 400 `SELF_FOLLOW`, `status='accepted'` if target is `public` else `'pending'`, 409 `ALREADY_FOLLOWING` on repeat.
  - `DELETE /public/follows/{username}` — unfollow (deletes caller's outgoing row).
  - `POST /public/follows/{username}/accept` — caller is followee, transitions a pending row to accepted.
  - `DELETE /public/follows/followers/{username}` — caller is followee; removes a follower or rejects a pending request (same delete, either state).
  - `GET /public/follow-requests` — caller's own pending incoming requests, paginated.
  - `POST /public/blocks/{username}` / `DELETE /public/blocks/{username}` — block/unblock.
- `backend/app/services/supabase_rest.py`: `create_follow`, `delete_follow`, `accept_follow`, `delete_follower`, `list_follow_requests`, `create_block`, `delete_block`.
- `backend/app/app.py`: register `follows.router` at `{api_prefix}/public`.

**Verification**: 3 throwaway users. B follows public A → instant `accepted`. C follows `followers_only` A → `pending`, A sees it in `GET /public/follow-requests`, accepts it, C now follows. A blocks C → C's existing follow row is gone (checked directly), C's new follow attempt → `403 BLOCKED`, C can't re-friend around it. Self-follow/self-block → `400`.

---

## Phase 3 — Feed

**Commit**: `feat(public): home/following feed`

- New migration `supabase/migrations/20260811000013_movie_logs_feed.sql`:
  - Additive RLS policy `movie_logs_select_followed_public` on `movie_logs` (defense in depth for direct authenticated table reads): `visibility='public' AND can_view_user_content(user_id)`.
  - New `feed_entries` view — **must** repeat the filter explicitly in its own `where` clause (views in this project run with the *owner's* rights on the underlying table, proven by the existing `public_movie_log_entries` view reading past `anon`'s lack of RLS policies — so the view would silently bypass the policy above rather than depend on it). Same narrow column list as `public_movie_log_entries` (no `booking_ref`/`seats`/`ticket_image_path`/`price`/`currency`); excludes the caller's own logs (`user_id <> auth.uid()` — a feed of your own logs isn't a feed); granted to `authenticated` only, not `anon` — the feed requires real login, no anonymous variant.
- `backend/app/schemas/follows.py`: add `FeedLogEntry`.
- `backend/app/routers/follows.py`: `GET /public/feed`, `limit`/`offset` (default 20, matching the reviews analog), required auth.
- `backend/app/services/supabase_rest.py`: `list_feed(user_token, *, limit, offset)`.

**Verification**: B (following public A and accepted-followers_only D from Phase 2) sees a merged, `watched_date`-descending feed of A's and D's `public`-visibility logs only — never their `private`/`anonymous` ones, never B's own logs. Pagination checked with >20 seeded logs across two followed accounts.

---

## Phase 4 — Block/visibility-aware profile, search, and followers/following lists

**Commit**: `feat(public): block-aware profile/search and followers/following lists`

- New migration `supabase/migrations/20260811000014_visibility_aware_profile_rpcs.sql`:
  - `get_public_profile_by_username` re-created to also return `is_blocked` (either direction) and `can_view_content` (via `can_view_user_content`).
  - `search_public_users` re-created to exclude any user in a block relationship with the caller (`auth.uid()`) — this is why the endpoint needs to become auth-aware (optionally) in the router layer below.
  - New `list_followers(p_username, limit, offset)` / `list_following(...)` RPCs, gated by the same `can_view_user_content` check as profile content — an unfollowable private account's follower list is empty to outsiders, same as its logs.
- `backend/app/auth/supabase_auth.py`: new `get_current_user_optional` dependency — returns `None` on a missing token (route stays anonymous-callable), but still raises `401` on a present-but-invalid token (doesn't silently mask a bad client). Delegates to the existing `get_current_user`/`decode_access_token`, no duplicated JWKS logic.
- `backend/app/routers/public_profile.py`: `search_users` and `public_profile` both take the optional dependency now; `public_profile` 404s on `is_blocked`, returns `logs: []` when `can_view_content` is false rather than calling `list_public_logs_for_user` at all.
- `backend/app/routers/follows.py`: `GET /public/users/{username}/followers`, `GET /public/users/{username}/following` — optional auth, same 404-on-block/empty-on-no-access behavior as the profile route.
- `backend/app/services/supabase_rest.py`: `get_public_profile`/`search_public_users` take an optional `viewer_token` and route through `_request` when present, `_anon_request` when not (small shared helper, not two copies); `list_followers`, `list_following`.

**Verification**: blocked pair — `GET /users/{username}` 404s both directions; `GET /users/search` excludes each other for authenticated callers but still returns both for a fully anonymous caller (regression check). Private account D (Phase 1/2) followed-but-never-accepted by a 5th throwaway user F → F sees `logs: []` forever (200, not 404 — distinct from the blocked case) and an empty followers list from outside.

---

## Phase 5 — Live verification pass + cleanup

No code changes — a dedicated pass exercising the full matrix end-to-end against the local
backend with 5 throwaway users (A public, B, C, D private→followers_only, F never-accepted),
covering: tier transitions and the "standing pending request silently unlocks on
private→followers_only" behavior, auto-accept on public accounts, block side effects
(search + profile + follow rejection, both directions), unfollow/remove-follower cleanup,
pagination on feed and followers/following, and cascade-delete leaving no orphan
`follows`/`blocks`/`user_settings` rows after the test users are deleted via the Admin API.
Any bug found here gets its own small fix commit rather than amending an earlier phase.

---

## Not in scope for this plan

- Venue review lists (`GET /venues/theatres/{id}/reviews`) staying unfiltered by block —
  a blocked user's `public`-visibility log can still surface there. Deliberate boundary per
  the confirmed requirements (block only affects profile/search/follow), not an oversight.
- A "friends" (mutual/symmetric) relationship tier — confirmed out of scope, this is a
  one-directional follow model only.
- A separate shareable-link mechanism (signed/expiring access tokens) — confirmed out of
  scope; `GET /users/{username}` is the shareable resource, extended for visibility tiers
  but otherwise unchanged.
