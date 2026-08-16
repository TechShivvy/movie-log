# Plan: OpenAI + Gemini LLM providers, alongside OpenRouter

## Context

Today `llm/openrouter_client.py` only speaks to OpenRouter. Ask: add OpenAI and Gemini as real alternative providers, let the user pick and switch between all three with per-provider credentials, keep OpenRouter as the only one with a backend-funded shared/free path (OpenAI and Gemini are always bring-your-own-key), and build this so a future move to something like LiteLLM — or adding a 4th/5th provider — isn't a rewrite.

**Key finding that shapes the whole design**: Gemini exposes an OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`). Live-verified: same latency profile as Gemini's native `generateContent` (noise-dominated, no systematic gap), full structured-output parity (`response_format: json_schema strict` via compat == `responseSchema` via native, both tested with identical results), and — notably — Google's own native `generateContent` error output right now is steering callers toward a *new* "Interactions API," meaning native isn't even the more stable target. So all three providers (OpenRouter, OpenAI, Gemini) are drivable through one `AsyncOpenAI` client, varying only `base_url`/`api_key` — no per-provider SDK, no per-provider message-building, no per-provider error-mapping. This is also the shape a future LiteLLM swap would present anyway, so it's not throwaway work.

Also live-confirmed: Gemini's `-latest` aliases (`gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-pro-latest`) self-heal against model renames server-side (today `gemini-flash-latest` resolves to `gemini-3.7-flash` under the hood) — the right default/fallback target. Free tier is real but tight: 5 requests/minute confirmed live on `gemini-flash-latest`. A pinned dated model name (`gemini-2.5-flash`) is already deprecated ("no longer available to new users") — real, current evidence for why auto-healing matters here specifically, unlike OpenRouter where a bad model name just fails cleanly today.

## Phase 1 — Provider abstraction

**Commit:** `feat(llm): generalize the OpenRouter client into a provider-agnostic one`

- Rename `llm/openrouter_client.py` → `llm/llm_client.py`. `_call_model`, `_build_image_messages`, `_build_text_messages`, the retry loop are already provider-agnostic (just take a client) — unchanged.
- New `PROVIDERS` registry (provider id → base_url, display name, `supports_shared_key`): `openrouter` (`https://openrouter.ai/api/v1`, shared key allowed), `openai` (default SDK base_url, no shared key), `gemini` (`https://generativelanguage.googleapis.com/v1beta/openai/`, no shared key).
- `extract_movie_metadata_from_image`/`_from_text` gain a `provider: str = 'openrouter'` param, threaded into a new `_client_for(provider, api_key) -> AsyncOpenAI`.
- `check_api_key(provider, api_key)`: OpenRouter keeps its existing free `GET /api/v1/key` metadata lookup unchanged; OpenAI/Gemini use `client.models.list()` (a metadata call, no tokens spent) and catch `AuthenticationError` → `valid: False`.
- `check_model(provider, model_name, api_key=None)`: OpenRouter keeps its existing free public-catalog lookup (rich metadata: modality, context length, pricing); OpenAI/Gemini need a key (`client.models.retrieve()`), return minimal `{'exists': bool}` only — neither exposes OpenRouter-grade catalog metadata generically, documented as a real limitation, not hidden.
- Generalize `utils/openai_utils.py`'s error messages — "Unable to connect to OpenAI"/"Request to OpenAI timed out" currently hardcode OpenAI by name despite already firing for OpenRouter calls today (a latent, pre-existing minor inaccuracy) — reword provider-agnostically now that it's explicit across three providers.

## Phase 2 — Wire OpenAI + Gemini into the extract endpoints

**Commit:** `feat(movie-metadata): add provider selection, OpenAI and Gemini as alternatives to OpenRouter`

- `POST /extract`, `POST /extract-from-link`, `GET /test-key` all gain `provider: Literal['openrouter','openai','gemini'] = 'openrouter'`.
- Header renamed `X-OpenRouter-API-Key` → generic `X-LLM-API-Key` (used for whichever `provider` is active). No live frontend depends on the old name yet, so this is a clean rename, not a deprecation shim — called out explicitly in the PR as an API contract change.
- `provider != 'openrouter'` unconditionally requires `X-LLM-API-Key` (400 `LLM_API_KEY_REQUIRED` if missing) — no shared key, no quota check, no free-model validation for these two, ever. `provider == 'openrouter'` keeps exactly today's behavior (shared key + quota + free-model check when no header key given; any model when a key is given).
- Sensible, non-validated suggested defaults when `model` is omitted: `gemini-flash-latest` for Gemini (self-healing alias), `gpt-4o-mini` for OpenAI (current, cheap, vision-capable — confirmed live in the account's model list). Neither is checked against a "free" list the way OpenRouter's default is — OpenAI has no meaningful free tier, and Gemini's free-tier eligibility isn't machine-readable (see Phase 4).
- Extraction cache key extended to include `provider` (not just `model`) — a same-named model across providers shouldn't collide (unlikely today, but the cache key should reflect reality, not assume it).

## Phase 3 — Stored provider+model preference

**Commit:** `feat(public-profile): let users store a preferred LLM provider/model`

- `user_settings.preferred_provider text not null default 'openrouter' check (in ('openrouter','openai','gemini'))` — `preferred_model` already exists, untouched.
- New `PATCH /public/me/llm-preference` — `{provider, model}`, same dedicated-small-endpoint pattern as `/me/revisit-prefill`.
- Purely a stored *client* preference, not a server-side implicit lookup — same reasoning `prefill_repeat_visit` already established: no extra DB read on the hot `/extract` path. The client reads it once (profile fetch) and resends `provider`/`model` explicitly on each `/extract` call; omitting both still falls back to the existing static default (OpenRouter + free model), unchanged for anyone who never opts in.

## Phase 4 — Gemini auto-healing (revised: no snapshot workflow needed)

**Commit:** `feat(llm): auto-heal a stale Gemini model via its self-healing -latest alias`

Originally planned as an OpenRouter-style snapshot-workflow port for Gemini too. Revised after a direct challenge mid-build (**"wont -latest work? even if it's needed, [infra like this] should be a separate branch off main, not bundled into this one"**) — both points landed:

- **No snapshot needed at all.** The thing that actually matters — self-healing against Gemini's model churn — is already provided by Google itself: `-latest` aliases (`gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-pro-latest`) resolve server-side to whatever the current model is (live-confirmed: `gemini-flash-latest` → `gemini-3.7-flash` today), no client-side tracking required. A periodically-refreshed external list would just be re-tracking something Google already tracks. `services/gemini_free_models.py` is a small hardcoded module (two known-stable aliases, no network call, no cache) — not a smaller copy of `free_models.py`, a genuinely different shape because the underlying problem is different.
- **Also correctly caught: OpenRouter's own snapshot infra (`fetch_free_models.py`, its workflow) doesn't even exist on this branch** — it shipped via its own dedicated branch (`chore/free-models-pipeline`) straight to `main` after `feat/backend-hardening` diverged from `dev`. The runtime consumer (`free_models.py`) only needs the already-live published URL, not the publishing script itself, so this was never actually a gap — reverted an attempt to port those files onto this branch mid-build.
- **Per-request healing (narrow, not "all the time"), unchanged from the original plan**: in the Gemini path only, catch `openai.NotFoundError` specifically (confirmed live as the exact exception a deprecated/nonexistent Gemini model raises) — not any other error class — and retry **once** against `gemini_free_models.default_free_model()`, logged clearly (not silent). Never triggers for OpenRouter/OpenAI, never retries more than once, never overrides a model that actually exists.
- Unlike OpenRouter's shared-key path, this was never an enforcement gate to begin with — Gemini has no shared key at all, so a "free models" list here is advisory (a sensible default), not a security boundary the way `free_models.is_free_model` is for OpenRouter's spend.

## Not in scope for this plan

- LiteLLM itself, or any other provider beyond these three — explicitly deferred, this plan's whole design is chosen so that swap/extension isn't a rewrite later.
- Rich model catalog metadata (modality, context length, live pricing) for OpenAI/Gemini via `check_model` — OpenRouter-only feature, no equivalent public/queryable source exists for the other two.
- Any GitHub Actions workflow/snapshot infra in this PR — infra that publishes independently of the backend app's own runtime belongs in its own branch/PR straight to `main`, same precedent `chore/free-models-pipeline` already set; not bundled here even for Gemini.
- **Routing `provider=gemini` through the OpenRouter shared key** — checked live: OpenRouter does host real `google/gemini-*` models, but every one of them is currently paid, no `:free` variant exists. Doing this would mean every Gemini-selecting free-tier user silently spends real backend money, unbounded by the quota logic (which assumes "shared key path = a free model"). The BYO-Google-key design stays for exactly this reason — it's not a worse "seamless" experience being settled for, it's the only currently-safe way to give Gemini quality without a real spend risk. A user who just wants *some* free model with zero setup already gets that today via the default `provider=openrouter` with no `model` specified — that's the actual "seamless new user" path, it just won't specifically be Gemini's own models until OpenRouter offers a free one.

## Phase 5 — Encrypted server-side API key storage (revises Phase 2's "per-request only" decision)

Prompted directly: since the same account will eventually be used from web, a mobile app, and bot surfaces (Telegram/Discord), re-entering an OpenAI/Gemini key on every surface is bad UX — store it once, reuse everywhere. Correcting terminology from how this was first described: **encryption, not hashing** — a one-way hash can verify a value matches but can never be turned back into the original key, and the backend genuinely needs the real key back out to call the provider on the user's behalf. This needs reversible, server-side-only encryption.

**Commit:** `feat(llm): encrypted server-side storage for a user's own provider API keys`

- New `user_llm_keys` table (`user_id`, `provider`, `encrypted_key`, `key_prefix`, timestamps; PK `(user_id, provider)` — one stored key per provider per user). RLS enabled with **zero policies** — not even the owner's own token can read/write this table directly through PostgREST; every access goes through the backend's service-role key, same pattern already established for `quota.py`/`extraction_cache.py`. This sidesteps ever needing column-level grants to hide `encrypted_key` from the owner's own SELECT — there's no direct SELECT path to it at all.
- `utils/crypto.py`: `encrypt`/`decrypt` via `cryptography`'s `Fernet` (authenticated symmetric encryption), keyed by a new `LLM_KEY_ENCRYPTION_KEY` backend setting. Fails closed if unset — storing/reading a key 500s with a clear message rather than ever silently falling back to plaintext.
- `PUT /public/me/llm-keys/{provider}`, `GET /public/me/llm-keys` (masked: `provider`, `key_prefix` — first ~8 chars — and timestamps only, never the real key or ciphertext), `DELETE /public/me/llm-keys/{provider}`. `PUT` validates the key live via the existing `check_api_key` before storing — rejects a garbage key up front rather than storing something that'll only fail later.

## Phase 6 — Server-side fallback chain: request value → stored preference → static default

Revises Phase 3's "purely a client preference, never read server-side" decision, now that there's a stored key to pair it with — the whole point of storing a key is that a client shouldn't have to keep resending it.

**Commit:** `feat(movie-metadata): resolve provider/model/key through request → stored preference → default`

- `provider`/`model` on `/extract`/`/extract-from-link` become optional with no hardcoded default (`None` means "not specified this call," distinguishable from an explicit value) — resolution order: explicit request value, then the caller's stored `preferred_provider`/`preferred_model` (`user_settings`), then the existing static default (a free OpenRouter model / `gemini-flash-latest` / `gpt-4o-mini`).
- `X-LLM-API-Key` header resolution order: explicit header, then a stored key for that provider (Phase 5, decrypted server-side), then — `openrouter` only — the shared backend key (still gated by quota/free-model check); `openai`/`gemini` still 400 `LLM_API_KEY_REQUIRED` if nothing at any of those three levels is available.

## Phase 7 — Opt-in auto-fallback to the next-best model

Generalizes Phase 4's Gemini-only, always-on "heal a 404'd model" behavior into an explicit, opt-in, all-three-providers mechanism — a deliberate behavior change for Gemini (no longer silently retries by default; requires `auto_fallback: true` now, same as the other two).

**Commit:** `feat(movie-metadata): opt-in auto-fallback to the next available model`

- New `auto_fallback: bool = False` on `/extract`/`/extract-from-link`. Off (default): a `NotFoundError` on the requested model fails normally, same as OpenRouter/OpenAI already do today. On: one retry against that provider's default/suggested model (the same target `resolve_model_name` already falls back to when `model` is omitted), for any of the three providers, not just Gemini.
- Response signals when a fallback actually happened — `fallback_occurred: bool`, `requested_model`/`used_model` (both `None` unless a fallback fired) added to `MovieMetadata` — so the frontend can show a toast ("used gemini-flash-latest instead of gemini-2.5-flash") rather than the swap being invisible.

## Verification

- **Phase 1**: `check_api_key`/`check_model` work correctly for all three providers against real keys (a genuinely valid key → `valid: true`; an obviously-wrong key → `valid: false`, no crash).
- **Phase 2**: a real extraction succeeds end-to-end through OpenAI and through Gemini (real ticket-shaped prompt, not just "reply OK") using the throwaway keys already in `.env` (`OPENAI_API_KEY_1`, `GEMINI_API_KEY_1`, referenced by name only); omitting `X-LLM-API-Key` on a non-OpenRouter provider 400s cleanly; OpenRouter's existing shared-key/quota behavior is unchanged (regression check).
- **Phase 3**: `PATCH /public/me/llm-preference` round-trips correctly; an invalid `provider` value 422s.
- **Phase 4**: calling Gemini with a known-deprecated model name (`gemini-2.5-flash`, confirmed dead live above) auto-heals to `gemini-flash-latest` instead of hard-failing, logged, and the healed call succeeds with correct extracted data.
- **Phase 5**: storing a key returns only `provider`/`key_prefix`/timestamps, never the real value; a garbage key is rejected at store time (live-checked first); a stored key is genuinely usable to call the provider later (round-trip through encrypt → decrypt → real API call succeeds); no `LLM_KEY_ENCRYPTION_KEY` configured fails closed, not open.
- **Phase 6**: an extract call with no `provider`/`model`/header key, but a stored preference + stored key, succeeds using the stored values; an explicit request value still overrides the stored one when both are present.
- **Phase 7**: `auto_fallback: false` (default) on a 404'd model fails exactly like before (regression check on Phase 4's own behavior change); `auto_fallback: true` succeeds and the response correctly reports `fallback_occurred`/`requested_model`/`used_model`.

## Phase 8 — Follow-up: security audit, LOCAL-only key auto-generation, always-populated fallback fields, extraction provenance

Four direct follow-up questions after Phase 7 shipped.

**Security audit** (read-only, no code needed): checked whether any user-info-returning endpoint could leak a stored key. `AccountExport`/admin endpoints never touch `user_llm_keys` at all (separate table, zero PostgREST grants). Checked request-header logging specifically — confirmed httpx redacts `Authorization` from its own `repr()`/`str()`, so even `utils/openai_utils.py`'s `LOGGER.debug(f'Exception details: {exc.__dict__}')` (which includes the failed request object) can't leak a key; httpx's own request/response debug logging is never enabled anywhere in this app either. Clean.

**LOCAL-only auto-generated encryption key** — `LLM_KEY_ENCRYPTION_KEY` now behaves differently per `ENV`, matching the existing `DEV_BYPASS_AUTH` precedent (LOCAL-only convenience toggles must be impossible to leave on outside LOCAL): base `Settings` (LOCAL) auto-generates an ephemeral Fernet key at startup if unset, so a fresh clone works without a manual key-generation step; `DevelopmentSettings`/`ProductionSettings` instead fail to start if it's unset — an ephemeral key in a real deployment would silently break every already-stored user's key on the next restart, an unacceptable failure mode outside pure local dev.

**Always-populated fallback fields, not just on fallback** — `used_provider`/`used_model`/`requested_model` on `MovieMetadataResult` are now required (never null), populated on every extraction regardless of `auto_fallback`, not gated behind `fallback_occurred` — knowing which model actually produced a result is useful on its own (a small "Extracted with Gemini" attribution), not just when something went differently than requested.

**A cache-versioning bug this same change surfaced live**: a stale cache entry from before the fields went required (missing them entirely) got served as-is into a `ResponseValidationError` once code was deployed. `extraction_cache.py`'s `PROMPT_VERSION` hash only tracked prompt *content* drift, not response *schema* drift — fixed by folding `MovieMetadataResult.model_json_schema()` into that same hash, so any future shape change (not just a prompt edit) also auto-invalidates stale entries.

**Extraction provenance on `movie_logs`** — three new columns, client-asserted (same trust model as `is_fdfs`/`arrival_status`): `extraction_provider`/`extraction_model` (must be set together, DB `CHECK` enforced; null means fully manual entry) and `extraction_edited` (whether the caller changed a field after extraction, before saving — null, not false, on a fully-manual log). Surfaced on `public_movie_log_entries`/`feed_entries` too, not just the owner's own `GET /movie-logs` — meant as visible small-text attribution, not private metadata. `search_movie_logs` RPC deliberately not extended in this pass (would need the `DROP FUNCTION`-first dance for a return-shape change) — the owner's own list already carries these fields.

### Verification

- Storing an obviously-wrong key still 422s (unaffected by the ENV changes); a `LOCAL` run with `LLM_KEY_ENCRYPTION_KEY` unset auto-generates one (confirmed via a real restart with the setting removed), and a stored key round-trips through encrypt→decrypt→real provider call successfully under that ephemeral key.
- Every extraction response (fallback or not) now carries populated `used_provider`/`used_model`/`requested_model`; the stale-cache `ResponseValidationError` reproduced live, then confirmed fixed by the schema-aware cache version.
- Creating a log with `extraction_provider`/`extraction_model` set round-trips correctly; `extraction_provider` without `extraction_model` `422`s; the fields correctly appear on the public profile view once the log is made public.
