"""schemas/movie_logs.py — the cross-field validators, most of which
exist specifically to guard against a NULL-in-CHECK-style gap at the
Pydantic layer (the DB-level version of this same bug class is covered
in plan.md's Iteration 7 inventory — arrival/screening punctuality's
CHECK constraint silently passed an invalid row because
`null in ('early','late')` evaluates to NULL, not FALSE).
"""

import pytest
from pydantic import ValidationError
from schemas.movie_logs import MovieLogInput, MovieLogUpdate


def _minimal(**overrides) -> dict:
    return {'movie': 'Test Movie', **overrides}


class TestPunctualityPairs:
    def test_arrival_delta_without_early_or_late_status_rejected(self):
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(arrival_delta_minutes=5))

    def test_arrival_delta_with_on_time_status_rejected(self):
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(arrival_status='on_time', arrival_delta_minutes=5))

    def test_arrival_delta_with_late_status_accepted(self):
        log = MovieLogInput(**_minimal(arrival_status='late', arrival_delta_minutes=5))
        assert log.arrival_delta_minutes == 5

    def test_screening_delta_with_early_or_delayed_accepted_not_on_time(self):
        MovieLogInput(**_minimal(screening_start_status='delayed', screening_start_delta_minutes=12))
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(screening_start_status='on_time', screening_start_delta_minutes=12))

    def test_movie_log_update_skips_the_pair_check_partial_update(self):
        """Deliberately different from MovieLogInput — a PATCH can't see
        whether the other half of the pair was already set by a prior
        call, so it doesn't reject a lone delta the way create does. The
        DB CHECK constraint is what actually enforces this on update."""

        MovieLogUpdate(arrival_delta_minutes=5)  # no error — same as the router docstring documents


class TestFdfsCoupling:
    def test_fdfs_forces_first_day_true_in_the_same_call(self):
        log = MovieLogInput(**_minimal(is_fdfs=True))
        assert log.is_first_day is True

    def test_fdfs_false_does_not_force_first_day(self):
        log = MovieLogInput(**_minimal(is_fdfs=False, is_first_day=False))
        assert log.is_first_day is False

    def test_fdfs_true_overrides_an_explicit_first_day_false(self):
        """One-directional and always-applied, per the router docstring:
        turning FDFS on always also turns first_day on in the same call,
        even if the caller explicitly tried to set first_day False."""

        log = MovieLogInput(**_minimal(is_fdfs=True, is_first_day=False))
        assert log.is_first_day is True


class TestExtractionProvenancePair:
    """The Iteration 14 pairing rule: extraction_provider/extraction_model
    must be set together — one without the other is meaningless."""

    def test_provider_without_model_rejected(self):
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(extraction_provider='gemini'))

    def test_model_without_provider_rejected(self):
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(extraction_model='gemini-flash-latest'))

    def test_both_set_together_accepted(self):
        log = MovieLogInput(**_minimal(extraction_provider='gemini', extraction_model='gemini-flash-latest'))
        assert log.extraction_provider == 'gemini'
        assert log.extraction_model == 'gemini-flash-latest'

    def test_neither_set_accepted_fully_manual(self):
        log = MovieLogInput(**_minimal())
        assert log.extraction_provider is None
        assert log.extraction_model is None

    def test_invalid_provider_value_rejected(self):
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(extraction_provider='anthropic', extraction_model='claude'))

    def test_movie_log_update_does_not_enforce_the_pair_partial_update(self):
        """Same partial-update reasoning as punctuality — the DB CHECK
        constraint enforces the pair on the row's final state, not this
        schema on a lone PATCH payload."""

        MovieLogUpdate(extraction_provider='gemini')  # no error


class TestBasicFieldValidation:
    def test_blank_movie_title_rejected(self):
        with pytest.raises(ValidationError):
            MovieLogInput(movie='   ')

    def test_watched_date_must_be_iso(self):
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(watched_date='31/12/2026'))
        MovieLogInput(**_minimal(watched_date='2026-12-31'))  # accepted

    def test_watched_time_must_be_24h_hhmm(self):
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(watched_time='7:30 PM'))
        MovieLogInput(**_minimal(watched_time='19:30'))  # accepted

    def test_rating_must_be_half_star_increments(self):
        MovieLogInput(**_minimal(rating=4.5))  # accepted
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(rating=4.3))

    def test_rating_out_of_range_rejected(self):
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(rating=5.5))
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(rating=0))

    def test_visibility_defaults_to_private(self):
        log = MovieLogInput(**_minimal())
        assert log.visibility == 'private'

    def test_invalid_visibility_value_rejected(self):
        with pytest.raises(ValidationError):
            MovieLogInput(**_minimal(visibility='friends_only'))

    def test_is_archived_defaults_false(self):
        log = MovieLogInput(**_minimal())
        assert log.is_archived is False
