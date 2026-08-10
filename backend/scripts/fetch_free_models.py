#!/usr/bin/env python
"""Fetch OpenRouter's official model catalog and write out the free-tier
subset as a small, easy-to-consume JSON file.

Uses OpenRouter's own GET /api/v1/models — not a third-party aggregator
site, not HTML scraping. It's the actual source of truth (structured,
official, includes real pricing and modality data) and is far less
fragile than scraping a page whose layout can change at any time. A
model is "free" here based on its actual pricing (prompt/completion ==
"0"), not the `:free` suffix naming convention — that's just a
convention some providers happen to follow, not something OpenRouter's
API guarantees or that this app should rely on as ground truth.

Deliberately excludes routing aliases like `openrouter/auto` even though
some report free-looking modality lists — their pricing is "-1"/"-1"
(dynamic, resolved per-request based on whatever underlying model gets
picked), not an actual guarantee of $0. `openrouter/free` is the one
alias that genuinely prices at 0/0 and is worth keeping if it shows up
naturally in this filter — it's OpenRouter's own free-tier router.

Run standalone; used by .github/workflows/refresh-free-models.yml, but
also runnable locally: `python scripts/fetch_free_models.py`.
"""

import json
import sys
from datetime import datetime, timezone

import requests

_MODELS_URL = 'https://openrouter.ai/api/v1/models'
_TIMEOUT = 30
OUTPUT_FILENAME = 'free-models.json'


def fetch_free_models() -> dict:
    response = requests.get(_MODELS_URL, timeout=_TIMEOUT)
    response.raise_for_status()
    all_models = response.json().get('data', [])

    free_models = []
    for m in all_models:
        pricing = m.get('pricing') or {}
        if pricing.get('prompt') != '0' or pricing.get('completion') != '0':
            continue
        architecture = m.get('architecture') or {}
        free_models.append(
            {
                'id': m.get('id'),
                'name': m.get('name'),
                'input_modalities': architecture.get('input_modalities', []),
                'context_length': m.get('context_length'),
            }
        )

    # Stable ordering so the diff between runs is meaningful (only real
    # additions/removals show up), not just whatever order the API
    # happened to return today.
    free_models.sort(key=lambda m: m['id'])

    return {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'source': _MODELS_URL,
        'count': len(free_models),
        'models': free_models,
    }


def main() -> None:
    try:
        data = fetch_free_models()
    except requests.RequestException as exc:
        print(f'Failed to fetch models from OpenRouter: {exc}', file=sys.stderr)
        sys.exit(1)

    with open(OUTPUT_FILENAME, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')

    print(f"Wrote {data['count']} free models to {OUTPUT_FILENAME}")


if __name__ == '__main__':
    main()
