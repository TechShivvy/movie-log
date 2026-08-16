"""services/auto_insert.py — the pure field-mapping/resolution logic, no
network, no LLM call needed. The actual insert path (upload + create_movie_log)
is integration-tested against the real project in
tests/integration/test_auto_insert.py.
"""

import pytest
from schemas.movie_metadata import MovieMetadata
from services.auto_insert import build_movie_log_row


def test_build_movie_log_row_renames_date_and_time():
    metadata = MovieMetadata(movie='Nexus', date='2026-08-10', time='21:30', theater='PVR')
    row = build_movie_log_row(metadata, extraction_provider='openrouter', extraction_model='qwen/qwen2.5-vl-72b-instruct:free')

    assert row['watched_date'] == '2026-08-10'
    assert row['watched_time'] == '21:30'
    assert 'date' not in row
    assert 'time' not in row
    assert row['movie'] == 'Nexus'
    assert row['theater'] == 'PVR'


def test_build_movie_log_row_sets_extraction_provenance_unedited():
    metadata = MovieMetadata(movie='Nexus')
    row = build_movie_log_row(metadata, extraction_provider='gemini', extraction_model='gemini-flash-latest')

    assert row['extraction_provider'] == 'gemini'
    assert row['extraction_model'] == 'gemini-flash-latest'
    assert row['extraction_edited'] is False


def test_build_movie_log_row_leaves_visibility_unset():
    """MovieLogInput's own default ('private') applies — auto-insert
    never guesses a visibility beyond that existing default."""

    metadata = MovieMetadata(movie='Nexus')
    row = build_movie_log_row(metadata, extraction_provider='openrouter', extraction_model='x')
    assert 'visibility' not in row


@pytest.mark.asyncio
async def test_auto_insert_log_skips_when_no_title():
    """No network needed for this branch — checked before anything else
    in auto_insert_log."""

    from services.auto_insert import auto_insert_log

    metadata = MovieMetadata(movie=None)
    status, log_id = await auto_insert_log(
        user_id='11111111-1111-1111-1111-111111111111',
        user_token='fake-token',
        metadata=metadata,
        content=b'fake-image-bytes',
        content_type='image/jpeg',
        extraction_provider='openrouter',
        extraction_model='qwen/qwen2.5-vl-72b-instruct:free',
    )
    assert status == 'skipped_no_title'
    assert log_id is None
