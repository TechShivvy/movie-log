# Plan: admin/reports triage, notifications, movie catalog, account data export/import

## Context

Four follow-ups from a backend-completeness review, each independently shippable:

1. **Reports have nowhere to go.** `reports.status`/`reviewed_by` exist, nothing writes to them, no admin concept exists anywhere in the codebase.
2. **Notifications don't exist.** New follower, incoming follow request, request accepted — currently discoverable only by polling `GET /follow-requests`.
3. **No canonical movie identity.** Every log stores a free-text `movie` string (OCR'd from a ticket or typed by hand) — no search/autocomplete when adding one manually, no shared movie catalog to key future cross-user features off of.
4. **Export/import is logs-only.** `GET /movie-logs/export`/`POST /movie-logs/import` cover `movie_logs` rows only — not venue ratings, not venue notes, not the profile itself.

Content/review moderation stays explicitly out of scope, per your call. Block staying scoped to profile/follow/search and not reaching shared spaces like venue review lists is a deliberate boundary (already documented on the follow/block PR), not revisited here.

## Established conventions this plan follows

- File naming matches across `routers/`/`schemas/`/`responses/`/`services/` (plural table ↔ plural URL prefix).
- `security definer` Postgres functions for cross-user reads that must bypass a caller's own RLS scope.
- Optional-auth pattern (`get_current_user_optional`) for endpoints that must stay anonymous-callable while still reading identity when a token is present.
- `_raise_for_upstream` collapses upstream errors below 500 to a flat 400 — routers pre-check conditions rather than parse PostgREST error text.
- One phase = one conventional commit (or a tight couple, if a phase has a genuinely separable fix), live-verified against the real Supabase project with throwaway test users before moving to the next phase.

## Phase 1 — Admin role + reports triage

**Commit:** `feat(reports): admin triage — list, review, optionally remove the reported content`

- `ADMIN_USER_IDS` setting (comma-separated UUIDs, empty by default) + `get_current_admin` FastAPI dependency (wraps `get_current_user`, 403s if the caller's `user_id` isn't in the set). Same pragmatic-flag style as `DEV_BYPASS_AUTH`, not a new RBAC system — this is a solo-owner project.
- `GET /admin/reports` (admin-only, service-role read via `supabase_admin.py` — RLS on `reports` is intentionally owner-only, triage bypasses it the same way the table's own migration comment already anticipated) — paginated, filterable by `status`/`target_type`.
- `PATCH /admin/reports/{id}` (admin-only) — sets `status` (`reviewed`/`dismissed`) and `reviewed_by`/`reviewed_at`; optional `remove_content: true` additionally deletes the reported `movie_log` row if `target_type == 'movie_log'` (the common case). `theatre`/`screen`/`profile` removal actions are out of scope for this phase — flagged, not silently ignored.

**Verification:** a reporter files a report; a non-admin caller gets 403 on both new endpoints; the admin lists it, marks it reviewed with `remove_content: true`, confirms the movie log is gone and the report shows `status: reviewed`, `reviewed_by` set.

## Phase 2 — Notifications, with Realtime

**Commit:** `feat(notifications): follow/request events, with Supabase Realtime`

- `notifications` table: `id`, `recipient_id`, `actor_id`, `type` (`follow_request` / `follow_accepted` / `new_follower`), `read` (bool, default false), `created_at`. RLS: recipient can `select`/`update` (mark read) their own rows only; no `insert`/`delete` policy for `authenticated` — rows are only ever written by triggers (`security definer`), never directly by a client.
- Triggers on `follows`: insert on `follows` where the new row is `pending` → `follow_request` notification to the followee; insert where `accepted` (instant-follow case) → `new_follower` to the followee; update `pending`→`accepted` → `follow_accepted` to the follower.
- `alter publication supabase_realtime add table public.notifications;` — lets the frontend subscribe directly (Supabase Realtime, RLS-gated the same as any other read) for live delivery instead of polling; the REST endpoints below remain the source of truth/fallback.
- `GET /notifications` (paginated, `unread_only` filter) and `POST /notifications/{id}/read` / `POST /notifications/read-all`.

**Verification:** B follows public-A → A gets `new_follower`; C follows private-D → D gets `follow_request`; D accepts → C gets `follow_accepted`; `read-all` zeroes the unread count; a second user's notifications are never visible to the first (RLS).

## Phase 3 — Movie catalog via TMDB

**Commit:** `feat(movies): TMDB-backed search/autocomplete, optional catalog linking`

- `TMDB_API_KEY` setting, optional — mirrors `google_places_api_key` exactly: unset means the feature degrades to today's free-typed `movie` string, no hard dependency.
- `movies` table: `id`, `tmdb_id` (unique, nullable — null for a free-typed entry with no TMDB match), `title`, `original_language`, `release_date`, `poster_path`, dedup'd the same way `theatres.place_id` dedupes.
- `POST /movies/search` — proxies TMDB `search/movie`, returns candidates for the client to pick from (title, language, release date, poster).
- `movie_logs.movie_id` — new nullable FK to `movies`, set when the caller picked a TMDB result; the existing free-text `movie` column stays the display source of truth either way (a picked title is copied in, same as theatre name today), so nothing about the existing write path breaks if `movie_id` is never set.
- `GET /movies/upcoming` — thin proxy to TMDB's `movie/upcoming`, no local caching (freshness matters more than dedup here) — for a future "coming soon" surface.

**Verification (needs a real TMDB key from you first):** search returns real candidates across at least one regional-language title; creating a log with a picked `movie_id` round-trips correctly; with `TMDB_API_KEY` unset, `POST /movie-logs` with a free-typed `movie` still works exactly as it does today (regression check).

## Phase 4 — Unified account data export/import

**Commit:** `feat(auth): bundle profile, logs, venue ratings, and notes into one export/import`

- `GET /me/export` — one JSON payload: profile snapshot (display name/bio/avatar/links/visibility/username), every movie log with its `visit_venue_ratings` row nested inline (if any), every `venue_notes` row. Distinct from the existing `GET /movie-logs/export` (kept as-is, logs-only, unchanged) — this is the "everything" version.
- `POST /me/import` — restores movie logs (+ their nested venue rating, in the same call instead of a separate `PUT .../venue-rating` per log) and venue notes from that shape; profile fields are intentionally NOT imported (you're already signed in as yourself — import is for content, not identity), capped at the same 500-item limit as the existing logs importer.

**Verification:** export a fully-populated test account (profile + logs with ratings + notes), delete the content, import the export back, diff before/after byte-for-byte on the fields that matter.

## Not in scope for this plan

- Content/review moderation beyond the single delete-the-reported-log action in Phase 1 (per your call — future work).
- Block reaching venue review lists — deliberate existing boundary, not revisited.
- Push notifications to a device — Phase 2 is in-app/Realtime only, no APNs/FCM.
- `theatre`/`screen`/`profile` removal as an admin report action — flagged in Phase 1, not built.
- Profile-field import (see Phase 4).
