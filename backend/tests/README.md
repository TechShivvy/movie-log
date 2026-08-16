# Backend test suite

## Why integration tests against the real Supabase project, not mocks

This app is a thin FastAPI proxy over Supabase PostgREST — the actual
business logic mostly lives in RLS policies, triggers, views, and RPCs,
not in Python. Nearly every real bug this project has ever found (the
comments-visibility RLS bug, the `get_movie_log`-wrong-scope bug, the
double-like-404 bug, cascade-delete behavior, the extraction-cache
versioning bug, the provider-override-ignoring-stored-model bug, the
LLM-hallucination-on-a-shared-schema bug, the punctuality
CHECK-with-NULL bugs, the `list_followers` missing-`LEFT JOIN` bug — see
`plan.md`'s history for the full account) was only ever found by **live
testing against the real database**, never by reasoning about Python
code in isolation. A fully-mocked test suite would give false confidence
about exactly the part of this system most likely to actually break.

So: `tests/integration/` runs against the **real linked Supabase
project**, using throwaway users created via the Admin API (see
`conftest.py`'s `make_user`/`admin_user` fixtures) and cleaned up
automatically, even on failure. `tests/unit/` covers pure Python logic
that doesn't need a database at all (Pydantic validators, the LLM
provider/model/key resolution chain, crypto encrypt/decrypt/rotation,
error-code mapping) — fast, deterministic, no network.

## Running

```bash
cd backend
uv run pytest                  # default: everything except @pytest.mark.llm
uv run pytest -m llm           # only the tests that make a real LLM provider call
uv run pytest -m "not slow"    # skip multi-step flows (e.g. the key-rotation lifecycle)
uv run pytest tests/unit       # fast, no network, no real data
```

Needs `backend/.env` configured the same way local dev needs it —
`SUPABASE_URL` + `SUPABASE_SECRET_KEY` (or legacy
`SUPABASE_SERVICE_ROLE_KEY`) at minimum. The suite skips (not fails)
with a clear message if these aren't set, rather than failing every test
cryptically.

**The backend's own paid `OPENROUTER_API_KEY` is never used to call
anything, ever, in any test.** `@pytest.mark.llm` tests use the personal
throwaway test keys already established for manual verification
(`OPENROUTER_API_KEY_1`, `OPENAI_API_KEY_1`, `GEMINI_API_KEY_1` in
`.env`) via `conftest.py`'s `personal_test_key()` helper, and are opt-in
specifically to avoid burning through Gemini's 5 RPM free tier or racking
up real OpenAI cost on every default run.

Rate limiting is force-disabled for the whole suite — it isn't the
feature under test in nearly any of these, and per-IP buckets would make
anonymous-endpoint tests flaky when run back to back.

## What's covered, and what isn't (yet)

- **Comprehensive**: every documented bug/regression from `plan.md`'s
  inventory, core CRUD + RLS visibility rules for every major resource,
  the LLM provider resolution chain, encrypted-key storage/rotation.
- **Baseline, not exhaustive**: venues/movies/reports/notifications get
  real happy-path + the specific documented edge cases, not every
  branch. This is a scaffold to extend, not a claim of completeness.
- **Not covered**: `/extract-from-link`'s actual scrape (needs real
  ticket-booking URLs, not something a suite should depend on) — the
  SSRF-guard logic and domain allowlist are unit-testable in isolation
  if that gets added later, the live scrape itself isn't attempted here.

## House rule going forward

**Write a test for a change if it needs one** — a new endpoint, a new
RLS policy, a new trigger, a bug fix (as a regression test named after
what it guards against, the way most of the tests here already are).
Not every change needs one (a docstring fix, a rename, a pure refactor
with no behavior change don't), but default to adding one rather than
skipping it. Put it next to the feature it covers — `tests/unit/` for
pure logic, `tests/integration/` for anything that touches the real
database — and clean up any data the test creates, the same way every
fixture here already does.
