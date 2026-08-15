# Plan: movie-log search, Letterboxd-style favorites, arrival/screening punctuality fields

## Context

Three independent features, all scoped to `movie_logs`:

1. **Search across a user's own logs** — fuzzy, multi-field (movie, theatre, screen, seats, language, notes), not exact substring. Mirrors the existing `match_theatres` trigram-search pattern, scoped to the caller's own rows instead of a public directory.
2. **Up to 4 favorite logs, Letterboxd-style**, shown on the profile. Favoriting/unfavoriting and the position-picker UX are frontend concerns — the backend needs a place to store which logs are favorited, in what order, capped at 4, and to surface them on the public profile.
3. **Two new optional punctuality fields**: how the caller's own arrival compared to their booked showtime (early/on-time/late, optional minutes), and whether the screening itself started on time (early/on-time/delayed, optional minutes) — genuinely independent facts (you can arrive late to an on-time screening, or arrive early to a delayed one).

## Code-structure notes (for uniformity)

- New writable columns go through the same pipeline every existing one does: `WRITABLE_FIELDS` tuple → `MovieLogInput`/`MovieLogUpdate` fields with the same validator style as `_check_half_star`/`_check_currency` → surfaced on `MovieLog` (extends `MovieLogInput`).
- A sub-resource with its own business rule (slot uniqueness, capped count) gets its own `PUT`/`DELETE` route, not folded into the general `PATCH` — same shape as `PUT/DELETE .../venue-rating`, not `.../note` (an upsert-only sub-resource, wrong shape here since favoriting needs an explicit unset too).
- Fuzzy/ranked search is always a `language sql stable` trigram function (`match_theatres`), never expressed as PostgREST query params — `similarity() > threshold`, `order by similarity desc`. Mine doesn't need `security definer`: it only ever needs the caller's own rows, which the existing `movie_logs_select_own` RLS policy already allows directly, unlike the cross-user RPCs (`search_public_users`) that need to bypass RLS entirely.
- New GET routes with a fixed path segment (`/search`) are registered before `/{log_id}` in the router, same fix already applied for `/export` — otherwise `/{log_id}` would swallow the literal `search` as if it were an id.

## Phase 1 — Search across a user's own logs

**Commit:** `feat(movie-logs): fuzzy multi-field search, with per-field match highlighting`

- `search_movie_logs(p_query, p_theatre_id default null, p_screen_id default null, p_favorites_only default false, p_sort default 'relevance', p_order default 'desc', p_limit default 20, p_offset default 0)` RPC — computes `similarity()` against each of the six searchable fields (movie, theater, screen, `array_to_string(seats,' ')`, language, notes) individually, keeps whichever exceed a `> 0.15` threshold (looser than `match_theatres`'s 0.2 — a personal log search should be more forgiving than a public directory match) as a `matched_fields text[]` array, filtered to `user_id = auth.uid()` plus the same optional `theatre_id`/`screen_id`/`favorites_only` narrowing `GET /movie-logs` already has.
- **Filtering is server-side** (the `where` clause above) — not a question, that's the only correct place for it once there's pagination involved.
- **Sorting is server-side too**, for the same reason: a fuzzy search with more matches than one page can't be correctly re-sorted by the frontend from a single fetched page — the next page would be wrong. Default `sort=relevance` (the fuzzy score); also accepts the same `created_at`/`updated_at`/`watched_date`/`movie` values `GET /movie-logs` already sorts by, for "fuzzy-matched, but in date order" style queries. Implemented as `plpgsql` with `EXECUTE ... USING` — `p_sort`/`p_order` only ever select from a fixed, hardcoded column/direction mapping before being interpolated into the dynamic `ORDER BY`, every actual value (`p_query`, filters, limit/offset) goes through parameterized `USING` bind params, not string interpolation — no injection surface despite the dynamic SQL.
- `GET /movie-logs/search?q=...&theatre_id=&screen_id=&favorites_only=&sort=&order=` — same auth/pagination shape as the rest of `movie_logs.py`. Response is every existing `GET /movie-logs` field *plus* `matched_fields` (e.g. `["theater", "notes"]`) — the frontend already has each field's actual value from the row itself, `matched_fields` is just which ones to visually highlight, not a duplicate of the content.

**Verification:** logs with a deliberately misspelled/partial match in each of the six fields individually (movie, theater, screen, a seat code, language, notes) each get found, with `matched_fields` correctly naming just that field; a query matching two fields on the same log lists both; `theatre_id`/`favorites_only` narrow correctly combined with the fuzzy query; `sort=watched_date` overrides relevance ordering correctly; a query matching nothing returns `[]`; another user's logs never appear regardless of query.

## Phase 2 — Up to 4 favorite logs

**Commit:** `feat(movie-logs): favorite logs, up to 4, surfaced on the profile`

- `movie_logs.favorite_position smallint`, nullable, `check (favorite_position between 1 and 4)`, `unique (user_id, favorite_position) where favorite_position is not null` — the uniqueness constraint *is* the 4-slot cap, no separate count-trigger needed. Non-null doubles as "is this a favorite" — no separate boolean.
- `PUT /movie-logs/{id}/favorite` — body `{"position": 1-4}`. If another of the caller's own logs already holds that position, it's atomically vacated and reassigned to this one (a "move," not a 409) — matches a drag-to-reorder picker UX, not error-prone slot-clearing first.
- `DELETE /movie-logs/{id}/favorite` — clears just the favorite designation, log itself untouched.
- `GET /public/users/{username}` gains a `favorites` array — sourced from `public_movie_log_entries` (so a `private` favorite never appears there, same visibility rule as everything else on the profile), ordered by `favorite_position`, gated by the same `can_view_content` check `logs` already uses. A favorited `private` log still occupies its slot for the owner (visible via their own `GET /movie-logs?favorites_only=true`), it's just invisible in the public `favorites` array — same "private stays private no matter what other flag it carries" rule as the rest of this app, not a new exception.
- `GET /movie-logs?favorites_only=true` — convenience filter for the caller's own favorites (all 4, any visibility), same narrowing-filter shape `theatre_id`/`screen_id`/`movie` already have.

**Verification:** favoriting 5th log while 4 are filled is rejected without a position (`favorites_only` still shows exactly 4); setting position 2 when it's already held by another log moves it there, doesn't 409; a `private` favorite shows up in the owner's own `favorites_only` list but not in `GET /users/{username}`'s `favorites`; unfavoriting frees the slot for reuse.

## Phase 3 — Arrival and screening-start punctuality

**Commit:** `feat(movie-logs): track arrival and screening-start punctuality`

- `arrival_status text check (in ('early','on_time','late'))`, `arrival_delta_minutes smallint check (0-300)` — how the caller's own arrival compared to their booked showtime. `delta` only allowed alongside `early`/`late` (DB check: `delta is null or status in ('early','late')`), and optional even then — "I was late" without specifying by how much is valid.
- `screening_start_status text check (in ('early','on_time','delayed'))`, `screening_start_delta_minutes smallint check (0-300)` — same shape, independent fact: did the movie itself start on time. `delayed` (not `late`) to read naturally for a screening rather than a person.
- Minutes, not full `HH:MM:SS` — nobody tracks "3 minutes 22 seconds late" for this; a `smallint` is simpler than a duration type and matches the granularity anyone would actually enter. Flagging this choice explicitly in case seconds precision is actually wanted.
- Both pairs added to `WRITABLE_FIELDS`/`MovieLogInput`/`MovieLogUpdate`, same optional-field shape as `format`/`certificate`.

**Verification:** all four combinations of (arrival early/late + screening on-time/delayed) round-trip correctly; `arrival_delta_minutes` set with `arrival_status: on_time` (or unset) is rejected at the DB layer; a delta of 400 (out of range) is rejected.

## Not in scope for this plan

- The favorite-picker's long-press-vs-click UX split, and which screen opens a slot-picker vs. a normal open-on-click search — both pure frontend interaction concerns; the backend exposes one `PUT .../favorite` and one search endpoint, reused by both flows. Documented in the frontend PR comment instead of built here.
- Raw similarity scores in the search response — `matched_fields` (Phase 1) tells the frontend what to highlight without exposing a ranking number nobody needs to display.
- Editing an existing favorite's position via drag-reorder as a distinct "swap" endpoint — `PUT .../favorite` already handles a move correctly in one call.
