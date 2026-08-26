"""Auto-insert-after-extraction: shared by /extract, /extract-from-link
(routers/movie_metadata.py), and the batch loop (services/
extraction_batches.py). A profile-level default
(user_settings.auto_insert_extractions) skips the usual client-side
review step and inserts straight into movie_logs — explicitly for bot
integrations (Discord/Telegram) with no UI to review/edit an extraction
before saving. Overridable per-request; callers resolve that override via
resolve_auto_insert() below, this module only does the actual insertion
work once told to.
"""

import uuid
from typing import Any, Optional

from loguru_setup import LOGGER
from schemas.movie_logs import WRITABLE_FIELDS, MovieLogInput
from schemas.movie_metadata import MovieMetadata
from services import supabase_admin, supabase_rest

_BUCKET = 'ticket-images'
_EXT_BY_CONTENT_TYPE = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}


def build_movie_log_row(
    metadata: MovieMetadata, *, extraction_provider: str, extraction_model: str,
) -> dict[str, Any]:
    """Pure field mapping from an extraction result onto MovieLogInput's
    shape — MovieMetadata.date/time rename to watched_date/watched_time,
    everything else lines up by field name. extraction_edited=False
    (nothing was hand-edited, this went straight from extraction to
    save); visibility is left unset so MovieLogInput's own default
    ('private') applies — auto-insert never guesses a visibility beyond
    that existing default."""

    data = metadata.model_dump()
    row = {k: v for k, v in data.items() if k not in {'date', 'time'}}
    row['watched_date'] = data.get('date')
    row['watched_time'] = data.get('time')
    row['extraction_provider'] = extraction_provider
    row['extraction_model'] = extraction_model
    row['extraction_edited'] = False
    return row


async def resolve_auto_insert(auto_insert: Optional[bool], user_token: str, user_id: str) -> bool:
    """Explicit request value always wins; otherwise falls back to the
    caller's stored profile default — same request > stored > default
    shape routers/movie_metadata.py's own resolve_provider_and_model
    already uses for provider/model resolution."""

    if auto_insert is not None:
        return auto_insert
    stored = await supabase_rest.get_own_settings(user_token, user_id)
    return bool(stored.get('auto_insert_extractions', False))


async def auto_insert_log(
    *,
    user_id: str,
    user_token: str,
    metadata: MovieMetadata,
    content: Optional[bytes],
    content_type: Optional[str],
    extraction_provider: str,
    extraction_model: str,
    extraction_batch_id: Optional[str] = None,
) -> tuple[str, Optional[str]]:
    """Returns (status, movie_log_id) — status is 'inserted',
    'skipped_no_title' (extraction produced no movie title, nothing
    meaningful to insert), or 'failed'. Fail-open throughout: an
    auto-insert problem (a bad upload, a validation edge case, an
    upstream hiccup) never fails the extraction call itself — the caller
    still gets their extraction result either way, just without a log to
    go with it. No dedup against a previous auto-insert of the same
    image — every call that resolves auto_insert=true creates a real,
    distinct log, deliberately predictable rather than silently clever;
    see plan notes on why (a bot's own retry hygiene is the right place
    to solve accidental duplicates, not hidden backend magic here).

    content/content_type are optional — /extract-from-link has no image
    at all (the extraction comes from scraped page text), so that path
    calls this with both None and the resulting log simply has no
    ticket_image_path, same as any other manually-typed log."""

    if not metadata.movie:
        return 'skipped_no_title', None

    try:
        path = None
        if content is not None:
            ext = _EXT_BY_CONTENT_TYPE.get(content_type or '', 'jpg')
            path = f'{user_id}/{uuid.uuid4().hex}.{ext}'
            await supabase_admin.upload_storage_object(_BUCKET, path, content, content_type or 'image/jpeg')

        row_data = build_movie_log_row(
            metadata, extraction_provider=extraction_provider, extraction_model=extraction_model,
        )
        row_data['ticket_image_path'] = path
        # Validates through the same schema a manual POST /movie-logs
        # call would — auto-insert gets no special exemption from
        # MovieLogInput's own field constraints.
        payload = MovieLogInput(**row_data)
        row = {k: v for k, v in payload.model_dump().items() if k in WRITABLE_FIELDS}
        row['user_id'] = user_id
        # Backend-only markers, never part of WRITABLE_FIELDS/MovieLogInput
        # (see supabase/migrations/20260817000002_auto_insert.sql) — set
        # directly here, after the WRITABLE_FIELDS filter above, so a
        # client can never spoof either via a regular POST /movie-logs call.
        row['auto_inserted'] = True
        row['extraction_batch_id'] = extraction_batch_id

        created = await supabase_rest.create_movie_log(user_token, row)
        return 'inserted', created.get('id')
    except Exception as exc:
        LOGGER.warning('auto_insert_log: failed for user={}: {}', user_id[:8], exc)
        return 'failed', None
