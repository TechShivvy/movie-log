"""Gemini's free-model default/healing target — deliberately much simpler
than services/free_models.py's OpenRouter equivalent, not a smaller copy
of it. Two things make the OpenRouter snapshot-workflow machinery
unnecessary here:

1. Gemini's `-latest` aliases (gemini-flash-latest, gemini-flash-lite-
   latest, gemini-pro-latest) already self-heal against renames on
   Google's own servers — live-confirmed: gemini-flash-latest currently
   resolves to gemini-3.7-flash under the hood, no client-side tracking
   needed at all. That's the actual auto-healing property that mattered
   for llm/llm_client.py's per-request retry-on-NotFoundError — a
   periodically-refreshed external snapshot would just be tracking
   something Google already tracks for us.
2. Unlike OpenRouter's free_models.py, this isn't gating a shared-key
   spend boundary — Gemini has no shared key at all (see plan.md), so
   there's no enforcement need, only a "what's a sensible default"
   question. A hardcoded, well-known-stable alias answers that question
   as well as a live-fetched list would, with zero moving parts.
"""

# Ordered by preference — flash before flash-lite. Both are real Gemini
# aliases (confirmed live), not guesses.
_KNOWN_ALIASES = ('gemini-flash-latest', 'gemini-flash-lite-latest')

HARD_FALLBACK_MODEL = _KNOWN_ALIASES[0]


async def is_free_model(model_name: str) -> bool:
    """Informational only (e.g. a settings-screen hint) — never an
    enforcement gate the way OpenRouter's shared-key path uses this,
    since Gemini has no shared key to protect. A BYO key can use any
    model regardless of what this returns."""

    return model_name in _KNOWN_ALIASES


async def default_free_model() -> str:
    """The suggested default when `model` is omitted, and the healing
    target when a specified Gemini model 404s as not-found (see
    llm/llm_client.py's _heal_gemini_model_if_needed) — async to match
    free_models.default_free_model's signature/call shape even though
    this one needs no I/O."""

    return HARD_FALLBACK_MODEL
