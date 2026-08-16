-- Phase 3 of plan.md (OpenAI/Gemini providers): user_settings.preferred_model
-- already existed (from the very first migration) but had no update path
-- at all — nothing ever wrote to it besides its own default. Adding
-- preferred_provider alongside it now that there's a real choice of
-- provider to remember, not just a model string.
--
-- Purely a stored *client* preference, not a server-side implicit lookup
-- — same reasoning prefill_repeat_visit already established: the client
-- reads this once and resends provider/model explicitly on each
-- /movie-metadata/extract call, no extra DB read on that hot path.

alter table public.user_settings
  add column if not exists preferred_provider text not null default 'openrouter'
    check (preferred_provider in ('openrouter', 'openai', 'gemini'));
