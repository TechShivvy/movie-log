-- Real bug found live while testing the auto-insert feature: user_settings.
-- preferred_model has had a hardcoded default of 'qwen/qwen2.5-vl-72b-
-- instruct:free' since the very first migration (20260709000001). That
-- specific model has since fallen off OpenRouter's live free-tier list —
-- confirmed live, is_free_model('qwen/qwen2.5-vl-72b-instruct:free') is
-- false right now — so any user whose user_settings row was ever created
-- (by *any* endpoint, not just PATCH /me/llm-preference — every profile
-- endpoint upserts the same row) without them ever explicitly choosing a
-- model gets this frozen-stale value as their "preference", and a plain
-- POST /movie-metadata/extract with no explicit provider/model 400s with
-- "Selected shared model must be a free model" instead of the seamless
-- default experience this whole feature exists for.
--
-- Root cause: a column default can only ever be a static, point-in-time
-- value — it can't track a live, changing "currently free" catalog the
-- way default_model_for()/free_models.default_free_model() do. Fix:
-- preferred_model no longer has a default at all (null means "no real
-- preference set" cleanly) — resolve_provider_and_model's existing logic
-- already falls through to the live dynamic default whenever
-- preferred_model is falsy, so this makes "never explicitly chosen" and
-- "resolve dynamically every time" the same state, immune to future
-- free-model-list drift the same way this bug was caused by it.
-- preferred_provider keeps its 'openrouter' default -- that value never
-- goes stale the way a specific model string can.

alter table public.user_settings
  alter column preferred_model drop not null,
  alter column preferred_model drop default;

-- Existing rows still sitting at the original hardcoded default are
-- indistinguishable from "never touched" (an explicit PATCH back to that
-- exact same value would look identical) -- nulling them out lets them
-- re-resolve against whatever's genuinely free right now instead of
-- staying pinned to a value already confirmed broken.
update public.user_settings
set preferred_model = null
where preferred_model = 'qwen/qwen2.5-vl-72b-instruct:free';
