"""schemas/movie_metadata.py — MovieMetadata (the LLM-facing extraction
target) vs MovieMetadataResult (the API response). The split between
these two classes exists specifically because of a real bug: putting
fallback-tracking fields directly on MovieMetadata meant the LLM saw
`requested_model`/`used_model` in its own structured-output schema and
hallucinated a plausible-looking guess for them ("ticket"). This module
guards that the split stays intact.
"""

import pytest
from pydantic import ValidationError
from schemas.movie_metadata import MovieMetadata, MovieMetadataResult


def test_movie_metadata_has_no_routing_fields():
    """The LLM-facing schema (llm/llm_client.py's response_model) must
    never carry fallback/provider metadata — that's the exact
    regression this test guards. If this starts failing, someone put a
    routing field back on the wrong class."""

    fields = set(MovieMetadata.model_fields.keys())
    assert 'used_provider' not in fields
    assert 'used_model' not in fields
    assert 'requested_model' not in fields
    assert 'fallback_occurred' not in fields
    assert 'auto_insert_status' not in fields
    assert 'movie_log_id' not in fields


def test_movie_metadata_result_is_a_superset_with_routing_fields_added():
    result_fields = set(MovieMetadataResult.model_fields.keys())
    base_fields = set(MovieMetadata.model_fields.keys())
    assert base_fields.issubset(result_fields)
    assert result_fields - base_fields == {
        'used_provider', 'used_model', 'requested_model', 'fallback_occurred',
        'auto_insert_status', 'movie_log_id',
    }


def test_movie_metadata_rejects_extra_fields_the_llm_might_hallucinate():
    """extra='forbid' is what makes the split matter in the first place
    — if this were 'ignore', a stray hallucinated field would just be
    silently dropped rather than a real signal something's wrong with
    the schema the LLM was given."""

    with pytest.raises(ValidationError):
        MovieMetadata(movie='Test', used_model='should not be accepted here')


def test_movie_metadata_result_requires_the_routing_fields():
    """These are populated by the router, always, on every response
    (Iteration 14's "always populated, not just on fallback" change) —
    never optional/defaulted, so a caller can't forget to set them."""

    with pytest.raises(ValidationError):
        MovieMetadataResult(movie='Test')  # missing used_provider/used_model/requested_model


def test_movie_metadata_result_constructs_cleanly_from_a_base_instance_plus_routing_info():
    base = MovieMetadata(movie='Dune Part Three')
    result = MovieMetadataResult(
        **base.model_dump(),
        used_provider='gemini',
        used_model='gemini-flash-latest',
        requested_model='gemini-flash-latest',
        fallback_occurred=False,
    )
    assert result.movie == 'Dune Part Three'
    assert result.fallback_occurred is False


def test_timezone_abbreviation_normalizes_unrecognized_to_none(monkeypatch):
    """_VALID_ABBR is computed from the system's real tzdata at import
    time (zoneinfo.available_timezones()) — on this Windows dev machine
    it comes back empty (no tzdata package/system tz database), which
    would make every abbreviation normalize to None regardless of the
    validator's actual logic, proving nothing. Patching the module-level
    set directly (a plain set, not a frozen pydantic field — regular
    monkeypatch works fine here) makes the test of the *validator's own
    logic* deterministic and independent of what tzdata happens to be
    available wherever this runs."""

    import schemas.movie_metadata as movie_metadata_schema

    monkeypatch.setattr(movie_metadata_schema, '_VALID_ABBR', {'IST', 'UTC'})

    assert MovieMetadata(movie='Test', timezone_abbrv='NOTREAL').timezone_abbrv is None
    assert MovieMetadata(movie='Test', timezone_abbrv='IST').timezone_abbrv == 'IST'


def test_date_normalization_handles_common_formats():
    assert MovieMetadata(movie='Test', date='19 Dec 2016').date == '2016-12-19'
    assert MovieMetadata(movie='Test', date='2016-12-19').date == '2016-12-19'
    assert MovieMetadata(movie='Test', date='19/12/2016').date == '2016-12-19'


def test_price_strips_currency_symbols_and_thousands_separators():
    m = MovieMetadata(movie='Test', price='₹1,200.50')
    assert m.price == 1200.50


def test_price_defensive_against_garbage_input():
    m = MovieMetadata(movie='Test', price='not a number at all')
    assert m.price is None
