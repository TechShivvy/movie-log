# Plan: theatre/screen punctuality aggregates, FDFS/first-day/time-of-day, venue lifecycle status

## Context

Four requests off one message, confirming one thing first: **screening punctuality is not aggregated anywhere today.** `screening_start_status`/`screening_start_delta_minutes` (last iteration) live only on individual `movie_logs` rows — nothing rolls them up to the theatre/screen level the way `visit_venue_ratings` already does for star ratings. That's the first gap this plan closes.

1. **Punctuality as a venue-level aggregate**, shown alongside the existing rating stats on `GET /venues/theatres/{id}/stats` / `.../screens/{id}/stats` — same "venue signal, counts regardless of visibility" precedent already established for ratings.
2. **FDFS / first day**: can't be derived from `watched_time` alone — "first day" needs external knowledge (the movie's real release date), and FDFS additionally needs "was this *the* first show," which isn't recoverable from a single timestamp even with a release date in hand. Both stay explicit, manually-set fields — but marking FDFS implies first day, enforced server-side, not left to frontend discipline.
3. **Time-of-day (noon/night/...)**: *is* fully derivable from `watched_time` alone — a pure bucketing function, no reason to ever store it or ask the user to set it.
4. **Screening cancelled** (a log-level fact) and **theatre/screen closed/renovation** (a venue-level fact, not a log fact) are two different things wearing similar names — handled separately below.

## Phase A — Punctuality aggregates on theatre/screen stats, `cancelled` as a screening outcome

**Commit:** `feat(venues): aggregate screening punctuality, add cancelled as an outcome`

- Widen `screening_start_status` to `('early', 'on_time', 'delayed', 'cancelled')` — a cancelled screening never started, so "how early/late" doesn't apply; the existing delta CHECK constraint already requires `screening_start_delta_minutes` to be null for any status outside `('early','delayed')`, so `cancelled` correctly requires a null delta with **zero** extra constraint logic, it just falls into the branch that already exists.
- New plain views `theatre_punctuality_stats`/`screen_punctuality_stats` — `count(*) filter (where status = 'on_time')`, same for `early`/`delayed`/`cancelled`, plus `avg(delta) filter (where status = 'delayed')` and a `total_count`. Aggregated straight from `movie_logs`, **not** filtered by visibility — same reasoning already applied to ratings and to `movie_rating_stats`: this is venue reliability signal, not review content, so a `private` log's punctuality still counts.
- `GET /venues/theatres/{id}/stats` / `.../screens/{id}/stats` gain a `punctuality` key alongside the existing rating stats, fetched and merged separately in the backend (not one SQL join — the two aggregates come from different sources with independent existence, a theatre can have one without the other). The existing "404 if nothing to show" check widens to "404 only if *both* rating and punctuality data are absent" — a theatre with only punctuality data (nobody's rated the venue itself yet, but people have logged cancellations) shouldn't false-404.

## Phase B — `time_of_day` (computed), `is_fdfs`/`is_first_day` (explicit, coupled)

**Commit:** `feat(movie-logs): computed time_of_day, FDFS/first-day fields`

- `time_of_day_bucket(watched_time)` — a pure, immutable SQL function (`morning`/`afternoon`/`evening`/`night`, boundary cutoffs at 12:00/17:00/21:00), plus a PostgREST computed-column wrapper so `GET /movie-logs` exposes it as `time_of_day` without a stored column. Added to `public_movie_log_entries`/`feed_entries`'s own select lists and the search RPC's output too, so it's consistent everywhere a log appears — one definition, not duplicated per response path. Never stored: it's a pure function of an existing field, storing it would just be a staleness risk with zero benefit.
- `is_fdfs boolean not null default false`, `is_first_day boolean not null default false` — both explicit, both writable. `is_fdfs = true` forces `is_first_day = true`, enforced in the backend (a model validator on both create *and* update — safe to do on partial updates too, unlike the punctuality-delta coupling from last iteration, because this only ever *sets* a value forward, it never needs to know prior row state to decide whether to reject something) — so the frontend gets this UX "for free" by just sending `is_fdfs: true`, no separate coordinated write needed, and a raw API call bypassing the frontend still can't produce an inconsistent state. The DB also carries a matching CHECK constraint (`not is_fdfs or is_first_day`) as the same defense-in-depth backstop the punctuality fields already have.

## Phase C — Theatre/screen lifecycle status (open/closed/renovation)

**Commit:** `feat(venues): theatre/screen lifecycle status, admin-only`

- `theatres.status` / `screens.status`, `text not null default 'open' check (in ('open','closed','renovation'))`.
- `PATCH /venues/theatres/{id}/status`, `PATCH /venues/screens/{id}/status` — **admin-only** (`get_current_admin`, the same flat allowlist reports triage already uses), not open to any authenticated user. This is shared directory data referenced by many users' history — the same reasoning that's kept theatre/screen editing out of scope until now applies just as much to "mark it closed": a false claim misleads everyone who sees that theatre afterward, so it needs the same governance gate as report triage, not crowd-sourced writes.
- `status` surfaces on every existing theatre/screen read (already included via `select *`, no view changes needed) so the frontend can badge a closed/renovating venue — historical logs still reference it, so it stays visible everywhere, just annotated, never hidden from search/match.

## Not in scope for this plan

- Auto-inferring `is_first_day` from a linked `movie_id`'s TMDB release date — a real possibility for later, but a separate design decision (what happens when it disagrees with what the user already set manually?) not asked for here; today's fields stay purely explicit.
- Any relationship between a `cancelled` screening and theatre/screen `status` (e.g. auto-flagging a screen for review after N cancellations) — two independent facts for now, no automatic linkage.
- Non-admin (crowd-sourced) theatre/screen status changes — explicitly rejected above, not a phased-in "later" item.

## Verification

- **Phase A**: two users logging punctuality at the same theatre (one `on_time`, one `delayed` by 12min, one `cancelled`) produce the correct counts + `avg_delay_minutes` on `GET .../stats`; a `private` log's punctuality still counts (same live-test shape already used for ratings); a theatre with punctuality data but zero ratings does not 404.
- **Phase B**: a log at `09:15` shows `time_of_day: "morning"`, one at `19:30` shows `"night"`; `is_fdfs: true` with no `is_first_day` in the same payload still results in `is_first_day: true` on both create and update; a raw PATCH forcing `is_fdfs: true, is_first_day: false` in the same call still results in `true` for both (backend coercion, not just frontend discipline).
- **Phase C**: a non-admin PATCHing theatre status gets `403`; an admin's PATCH updates it and the change is visible on the next plain `GET` of that theatre with no other change; `status` never removes a theatre from `POST /theatres/match`/search results.
