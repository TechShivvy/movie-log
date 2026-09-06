    # Plan: pytest test suite, covering everything built and verified so far

## Context

Every feature in this PR (and several before it) has been verified live — real throwaway Supabase users, real HTTP calls, real cleanup — but never captured as repeatable, automated tests. Ask: go through the PR body, every follow-up comment, every commit message, every migration/schema/docstring, and build a pytest suite that covers it, then keep writing tests for every future change.

**This plan is the product of actually re-reading the source material**, not recall: the full current PR body (~1,200 lines, all 15 iterations), all 21 follow-up comments (~760 lines), the full `dev..feat/backend-hardening` commit log (84 commits), and the migrations/routers/schemas directory listings (48 migrations, 12 routers, 12 schema files, 10 service modules). The checklist below is organized by what that research actually surfaced, not a generic template.

**No existing test infrastructure at all** — confirmed by search: no `tests/` directory, no `pytest` in `pyproject.toml`, nothing. Building from zero.

## Testing strategy: why integration tests against the real Supabase project, not mocks

This app is a thin FastAPI proxy over Supabase PostgREST — the actual business logic mostly lives in RLS policies, triggers, views, and RPCs, not in Python. Rereading the PR confirms just how true this is — nearly every real bug documented across 15 iterations was found by **live testing against the real database**, never by reasoning about Python code in isolation (see the full bug inventory below). A fully-mocked test suite would give false confidence about exactly the part of this system most likely to actually break.

So: **integration tests against the real linked Supabase project** are the primary value driver, using the same throwaway-user methodology already established (Admin API user creation, real tokens, real cleanup) — wrapped in pytest fixtures instead of ad-hoc bash. **Unit tests** cover pure Python logic that doesn't need a database at all (Pydantic validators, the provider/model/key resolution chain, crypto encrypt/decrypt/rotation, error-code mapping) — cheap, fast, deterministic.

The app runs **in-process** via `httpx.AsyncClient(transport=ASGITransport(app=app))` — no separate uvicorn process. Lifespan (3 headless Chromium processes for link extraction) is **not** triggered by default — too slow/heavy and irrelevant to nearly every test; link-extraction-specific tests are explicitly out of scope this pass (would need real ticket-booking URLs to scrape, not something a suite should depend on).

**Rate limiting disabled for the whole run** (`RATE_LIMIT_ENABLED=false`). **The backend's own paid `OPENROUTER_API_KEY` is never used to call anything, ever, in any test** — only the personal test keys (`OPENROUTER_API_KEY_1`, `OPENAI_API_KEY_1`, `GEMINI_API_KEY_1`, referenced by env var name only) for provider tests, and those are marked `@pytest.mark.llm`, skipped by default (opt-in via `-m llm`) — burning Gemini's 5 RPM free tier or real OpenAI cost on every run isn't acceptable.

## The complete bug/behavior inventory this research surfaced (every regression test below is named after one of these)

**Iteration 1 (security + core):**
- Blank env var (`""`) must resolve to `None`, not be treated as configured.
- `ProductionSettings` must refuse to boot with `DEV_BYPASS_AUTH=true`.
- Rate limiting: `Limiter(default_limits=...)` is a no-op in slowapi 0.1.9 — every route needs its own `@limiter.limit(...)`.
- Body-size cap: a 12MB JSON body → `413`, multipart `/extract` exempt.
- Open redirect: `/dev/google/authorize` and `/callback` both independently validate `redirect_uri` against `localhost`/`127.0.0.1`.
- `visibility` tri-state (`private`/`anonymous`/`public`) — `anonymous` means `user_id`/`username` both `null` on the public projection.
- Venue sub-ratings count toward theatre/screen aggregates regardless of log visibility; only qualitative fields are visibility-gated.
- `theatres.source` (`google_places`/`user_submitted`); `place_id` server-resolved, overrides client input; `UNIQUE(place_id)` never conflicts on `NULL`.
- Reports: a `private` log 404s exactly like a nonexistent one (can't probe existence).

**Iteration 2 (social):**
- `private` account: zero content access even for an *accepted* follower — genuinely stronger than `followers_only`.
- Switching `private` → `followers_only` unlocks content immediately for already-accepted followers, **no new follow action**.
- Follow: instant-accept on `public`, pending-then-accept on `followers_only`/`private`; self-follow rejected; blocked pair rejected.
- Block: severs an existing accepted follow (both directions), rejects future follow attempts (both directions), `GET /users/{username}` 404s for either party, excluded from `GET /users/search` both directions.
- `get_current_user_optional`: `None` on missing token, `401` on present-but-invalid (never silently downgrades to anonymous).
- `feed_entries` view must repeat the RLS filter itself (view-owner-rights gotcha) — caller's own logs excluded, a followed private/followers_only-without-access account's logs excluded.
- **Bug**: `list_followers` was silently dropping an accepted follower who never set a username (missing `LEFT JOIN`) — fixed, regression-test this specifically.

**Iteration 3 (account deletion):**
- `DELETE /auth/me` with no body → `422`; `{"confirm": false}` → `422`; `{"confirm": true}` → `204`.
- Gone entirely: `user_settings`, `follows` (both directions), `blocks`, `venue_notes`, filed `reports`, `private`-visibility logs.
- Survived, anonymized (`user_id`/`created_by`/`reviewed_by` → `null`, `ON DELETE SET NULL` not cascade): `public`/`anonymous` logs + their venue ratings, `theatres.created_by`, `screens.created_by`, `reports.reviewed_by`.
- Theatre/screen rating stats identical before/after deletion (values never re-derived, just the attribution nulls).
- **Bug**: `theatres.created_by`/`screens.created_by`/`reports.reviewed_by` had no `ON DELETE` action at all (implicit `RESTRICT`) — would have hard-failed any deletion by a theatre/screen creator or report reviewer — fixed to `SET NULL`.

**Iteration 4 (admin/notifications/movies/export):**
- `ADMIN_USER_IDS` empty → every admin route `403`s everyone; configured → non-admin still `403`s, admin succeeds.
- Notifications: public-account follow → `new_follower`; private/followers_only → `follow_request`; accepting → `follow_accepted` to the original follower; marking someone else's notification `404`s.
- `TMDB_API_KEY`/`GOOGLE_PLACES_API_KEY` unset → `500 CONFIG_ERROR`, not a crash; a log with no `movie_id` still works (regression).
- `POST /movies` with a known `tmdb_id` returns the existing row, never re-fetches TMDB.
- **Bug**: `visit_venue_ratings.movie_log_id` is that table's own PK, so PostgREST embeds it as to-one (single object or `null`), not a list — import code must not assume a list.
- Export/import round-trip fidelity (profile + rated log + unrated log + venue note, delete, reimport, re-export, byte-for-byte match); empty import `400`s; a venue note with neither/both of `theatre_id`/`screen_id` `422`s.

**Iterations 5-8 (movie pages, CRUD audit, search/favorites/punctuality, aggregates):**
- `visit_venue_ratings` had no `DELETE` grant at all — fixed; deleting a rating recomputes theatre stats to zero/null, leaves the log untouched.
- `edited_at` set on a real content `PATCH`, **not** moved by a `PATCH` resending an identical value, **not** moved by the account-deletion `user_id` nul-ing (a non-content system write).
- `movie_rating_stats` was inconsistently excluding `private` logs (unlike venue stats' own "counts regardless of visibility" precedent) — fixed to match.
- Search: `matched_fields` correctly names which of 6 fields matched a fuzzy query; `theatre_id`/`favorites_only`/`sort`/`order` all combine correctly; cross-user isolation.
- Favorites: unique index `(user_id, favorite_position)` **is** the 4-slot cap; moving into an already-taken slot atomically vacates the old occupant (not a `409`); a `private` log can be favorited but never appears in the public profile's `favorites`.
- **Bug (NULL-in-CHECK)**: `check (delta is null or (status in (...) and delta between 0 and 300))` silently passes an invalid row because `null in (...)` evaluates to `NULL`, not `FALSE` — fixed with explicit `CASE ... else false`. **This exact bug pattern recurs** — also caught proactively in the comments `text_or_deleted` constraint.
- Punctuality stats count a `cancelled` screening as a 4th outcome, regardless of log visibility.
- `time_of_day` is a pure computed function of `watched_time`, never stored.
- `is_fdfs: true` forces `is_first_day: true` in the same call, on both create **and** partial update — a model validator's in-place assignment IS tracked by `exclude_unset=True`.
- Venue lifecycle `status`: non-admin `403`s; a `closed` theatre still appears in search/match (status never hides).

**Iterations 9-11 (comments/likes/notifications):**
- **Bug (RLS)**: comment visibility/insert policies checked `movie_logs` directly (caller's own narrower RLS), not the broader public-visibility rule — a genuine stranger was wrongly rejected on a real public log — fixed with `is_log_commentable`/`commentable_log_is_blocked` security-definer helpers.
- One level of replies only — a reply-to-a-reply is rejected by trigger.
- Soft-delete leaves replies intact, parent shows cleared (`null`) text.
- **Bug**: `get_movie_log` (caller's-own-rows scope) was used to read back a like count after liking *someone else's* log — fixed with `get_like_count` through the public view.
- **Bug**: a duplicate comment-like collapsed to the same `400`/`404` as a genuinely-missing comment — fixed by pre-checking existence, distinguishing `None` from a real `0`.
- **Bug**: `liked_by_caller` was always `false`/`null` on 5 of 6 read paths (profile logs/favorites, theatre/screen/movie reviews) — an identity-blind request helper never carried a viewer token — fixed across all 5.
- Account deletion: a deleted user's comments survive with `user_id: null`; their given/received likes on those comments are unaffected on the receiving side, their own likes-given cascade-delete.
- Notification enrichment (`actor_username`, `movie`, `comment_preview`) — `comment_preview` goes `null` (not `""`) once the comment is soft-deleted, live-joined not snapshotted.

**Iterations 12-15 (LLM providers, encrypted keys):**
- Gemini via its OpenAI-compatible endpoint — one `AsyncOpenAI` client for all 3 providers, varying only `base_url`.
- `provider != openrouter` unconditionally requires `X-LLM-API-Key` (`400`), no quota, no free-model check, ever.
- **Bug (ordering)**: an early draft resolved the API key (and touched quota) *before* the cache-hit check — fixed: model-name resolution (pure) before the cache check, key/quota resolution (side-effecting) strictly after — a cache hit must never cost quota.
- **Bug**: `check_api_key` only caught `401 AuthenticationError`; Gemini rejects a garbage key with `400 BadRequestError` — fixed to catch both (+ `PermissionDeniedError`).
- **Bug**: the `DELETE /me/llm-keys/{provider}` route's `-> Any` + `status_code=204` crashed the app at *startup* (FastAPI's own assertion) — fixed to `-> None`.
- **Bug**: an explicit `provider=openrouter` override with no explicit `model`, while a *different* provider's preference was stored, fell through to the *stored* provider's model name — fixed: stored model only used when the effective provider matches the stored `preferred_provider`.
- **Bug (schema leak)**: `fallback_occurred`/`requested_model`/`used_model` were first fields on `MovieMetadata` itself — the LLM saw them in its own structured-output schema and hallucinated a value (`"ticket"`) — fixed with a separate `MovieMetadataResult` class the LLM never sees.
- **Bug**: `openai.NotFoundError` was never mapped in `OPENAI_ERROR_MAP` at all — fell through to a generic `502` — fixed to a proper `404`.
- **Bug (cache versioning)**: `PROMPT_VERSION` only hashed prompt *content*, not response *schema* — a stale cache entry from before a required-field change crashed with `ResponseValidationError` — fixed by folding `MovieMetadataResult.model_json_schema()` into the version hash.
- `LLM_KEY_ENCRYPTION_KEY`: `LOCAL` auto-generates ephemeral if unset; `DEV`/`PROD` refuse to boot if unset.
- `user_llm_keys` has **zero** PostgREST grants — service-role-mediated only; masked (`key_prefix` only) on every read.
- `MultiFernet` rotation: encrypt always primary, decrypt tries primary then each `LLM_KEY_ENCRYPTION_KEY_PREVIOUS` key in order.
- Account deletion cascades to `user_llm_keys` (`ON DELETE CASCADE`).
- `extraction_provider`/`extraction_model` must be set together (DB `CHECK`); `extraction_edited` is `null`, not `false`, on a fully-manual log.

## Foundational infrastructure — from the original `feat/add-all` port, predates every iteration above

Checked directly (`git show 6e4a6e5 --stat` — the actual port commit — then read the current, evolved state of each file it introduced), not just Iteration 1's summary prose of it. This is the layer every single endpoint depends on, and deserves its own dedicated coverage independent of any specific feature:

- **`utils/errors.py`** — the uniform error shape every response follows: `{"code", "message", "detail"?}`. `_STATUS_CODE_MAP` gives the default `code` for a bare `HTTPException` per status (`400`→`BAD_REQUEST`, `401`→`UNAUTHORIZED`, `403`→`FORBIDDEN`, `404`→`NOT_FOUND`, `408`→`REQUEST_TIMEOUT`, `409`→`CONFLICT`, `413`→`PAYLOAD_TOO_LARGE`, `415`→`UNSUPPORTED_MEDIA_TYPE`, `429`→`RATE_LIMITED`, `500`→`INTERNAL_ERROR`, `502`→`UPSTREAM_ERROR`). `RequestValidationError` → `422 VALIDATION_ERROR` with a sanitized `detail` (non-JSON-serializable Pydantic `ctx` values stringified). `RateLimitExceeded` → `429 RATE_LIMIT_MINUTE` (distinct code from the daily quota's `QUOTA_DAILY_EXCEEDED`) with a `Retry-After` header. Any unhandled exception → `500 INTERNAL_ERROR`, logged full server-side, **never** leaks internals to the response body.
- **`services/supabase_rest.py`'s `_raise_for_upstream`** — every PostgREST call funnels through this: `401`→`UNAUTHORIZED`, `403`→`FORBIDDEN`, `404`→`NOT_FOUND` pass through with their real status; **any other 4xx collapses to a flat `400 BAD_REQUEST`** (this is exactly why, e.g., the follow-request router pre-checks self-follow/already-following/blocked explicitly rather than trying to interpret PostgREST's real error — a `400` reaching the handler could be any of several causes); any `5xx` → `502 UPSTREAM_ERROR`. A transport-level failure (connection refused, timeout) also → `502 UPSTREAM_ERROR`.
- **`auth/supabase_auth.py`** — `get_current_user`: no token → `401` "Missing bearer token."; malformed/expired/wrong-issuer token → `401` "Invalid or expired access token."; token missing `sub` → `401` "Token is missing subject claim."; `sub` not a valid UUID → `401` "Token subject claim is not a valid UUID."; `DEV_BYPASS_AUTH` + `ENV` in `(LOCAL, DEV)` + no token → fixed dev user (`00000000-...-000000000001`). `get_current_admin`: authenticated-but-not-in-`ADMIN_USER_IDS` → `403`. `get_current_user_optional`: no token → `None` (not an error); a present-but-invalid token still `401`s (never silently downgrades to anonymous) — this exact distinction is what several later features (block-aware search/profile, viewer-aware `liked_by_caller`) depend on.
- **`services/quota.py`** — `ensure_within_daily_quota` calls the `increment_daily_usage` RPC with the service-role key; misconfigured Supabase quota settings → `500 INTERNAL_ERROR` with a specific message (not a generic failure); quota RPC itself failing → `500`; an unparseable RPC response → `500`; the limit being reached → `429 QUOTA_DAILY_EXCEEDED`.
- **The original `GET /movie-logs/export`/`POST /movie-logs/import`** (bare logs only) — still exists, unchanged, distinct from Iteration 4's "everything" `GET/POST /me/export`/`/me/import` (profile + logs + venue ratings + notes). Both need coverage, not just the newer one.

## Architecture

```
backend/
  tests/
    conftest.py              # app client fixture, test-user factory+cleanup, env checks, markers
    README.md                # testing philosophy, how to run, house rule for future changes
    unit/
      test_movie_logs_schema.py       # punctuality pairs, FDFS coupling, extraction-provenance pairing
      test_movie_metadata_schema.py   # MovieMetadata vs MovieMetadataResult separation (hallucination bug)
      test_public_profile_schema.py   # LlmPreferenceUpdate, LlmKeyInput, storage opt-in
      test_crypto.py                  # encrypt/decrypt/MultiFernet rotation, fails-closed
      test_llm_client.py              # PROVIDERS registry, _fallback_model_for, healing gate
      test_openai_utils.py            # OPENAI_ERROR_MAP completeness (the NotFoundError gap)
    integration/
      test_auth.py                    # signin, /auth/me, full deletion cascade table above, export/import
      test_movie_logs.py              # CRUD, archive + venue-stats trigger, favorites, search, punctuality,
                                       #   edited_at precision, extraction provenance
      test_venues.py                  # theatres/screens, ratings (+ delete), notes, stats, lifecycle status
      test_movies.py                  # catalog create/dedupe, stats, reviews, CONFIG_ERROR without a key
      test_public_profile.py          # username/privacy/profile, 3-tier visibility incl. the silent-unlock case
      test_follows_blocks.py          # lifecycle, the list_followers LEFT JOIN regression, block's 4 effects
      test_feed.py                    # visibility, self-exclusion, the view-must-repeat-RLS regression
      test_comments.py                # CRUD, one-level replies, the visibility-RLS regression specifically
      test_likes.py                   # the get_movie_log-scope bug, the double-like-404 bug, no-op duplicates
      test_notifications.py           # all 5 types, enrichment, self-notification skip, cascade-delete
      test_reports.py                 # create + admin triage, non-admin 403, private-log-404-not-probe
      test_llm_provider_resolution.py # request > stored preference > default, the provider-override bug
      test_llm_keys.py                # store/list/delete masking, live-validate-before-store, storage pref,
                                       #   rotation lifecycle, account-deletion cascade
      test_llm_auto_fallback.py       # opt-in gate, always-populated fields, cache-versioning regression,
                                       #   the schema-leak regression (marked @pytest.mark.llm)
```

## Fixtures (`conftest.py`)

- `client`: `httpx.AsyncClient` wrapping the real app via `ASGITransport`, no lifespan.
- `make_user`: async factory — creates a throwaway Supabase user via the Admin API, returns `(user_id, token)`; auto-cleanup even on failure.
- `admin_user`: like `make_user`, temporarily adds the id to `ADMIN_USER_IDS` for the test, restores after.
- `@pytest.mark.llm` (real provider calls, opt-in via `-m llm`), `@pytest.mark.slow` (multi-step flows like rotation).
- A session-scoped check that required env vars are present, skipping with a clear message rather than failing cryptically.

## Honest scope boundary

Venues/movies/reports/notifications get real happy-path + the specific documented edge cases above, not exhaustive branch coverage — flagged as a scaffold to extend, not silently glossed over. Link extraction (`/extract-from-link`'s scrape itself) is out of scope — needs real ticket URLs, not something a suite should depend on. Going forward, `backend/tests/README.md` establishes writing a test for every change that needs one as a house rule.

## Verification

- `uv run pytest` (default marks) passes cleanly against the real linked project, fully cleans up its own data.
- `uv run pytest -m llm` separately exercises real-provider paths.
- Each bug-regression test's assertion is precise enough to catch the specific documented failure mode, not just "endpoint returns 200" — spot-checked by temporarily reverting a fix and confirming the test actually fails.
