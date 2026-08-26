-- Phase 5 of plan.md: encrypted server-side storage for a user's own
-- OpenAI/Gemini/OpenRouter API key, so it doesn't need to be re-entered
-- on every surface (web, app, a future Telegram/Discord bot).
--
-- RLS enabled with *zero* policies, deliberately — not even the owner's
-- own token can read/write this table directly through PostgREST. Every
-- access goes through the backend's service-role key (services/
-- llm_keys.py), same pattern already established for the daily-quota
-- RPC and the extraction cache. This sidesteps ever needing column-level
-- grants to hide encrypted_key from the owner's own SELECT — there's no
-- direct SELECT path to it at all, encryption key never leaves the
-- backend process, and the masked view (provider/key_prefix/timestamps
-- only) is constructed by the backend, never read as a view over this
-- table.
create table if not exists public.user_llm_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openrouter', 'openai', 'gemini')),
  -- Fernet ciphertext (utils/crypto.py) — never plaintext, never read
  -- back out except by the backend process itself.
  encrypted_key text not null,
  -- First ~8 chars of the real key, plaintext — purely a display aid
  -- ("sk-proj-...") so the owner can recognize which key is stored
  -- without it being usable on its own.
  key_prefix text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, provider)
);

drop trigger if exists trg_user_llm_keys_updated_at on public.user_llm_keys;
create trigger trg_user_llm_keys_updated_at
before update on public.user_llm_keys
for each row
execute function public.set_updated_at_timestamp();

alter table public.user_llm_keys enable row level security;

-- New tables start with zero grants (default privileges revoked
-- project-wide) -- deliberately no grant to anon/authenticated at all
-- here, unlike most other tables in this schema. Only the service role
-- (which bypasses RLS/grants entirely) reads or writes this table.
revoke all on public.user_llm_keys from anon, authenticated;
