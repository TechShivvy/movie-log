from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from schemas.movie_logs import MovieLogInput
from schemas.venues import VenueRatingInput


class AccountDeletionRequest(BaseModel):
    """Requires an explicit `confirm: true` — DELETE requests commonly go
    out with no body at all (most HTTP clients default to one), so this
    exists purely to stop a bodyless/careless DELETE from being processed;
    the caller's bearer token is already the real authorization check."""

    confirm: Literal[True]

    model_config = ConfigDict(json_schema_extra={'example': {'confirm': True}})


class ProfileExport(BaseModel):
    username: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    account_visibility: str = 'private'
    avatar_path: Optional[str] = None
    profile_links: list = Field(default_factory=list)

    model_config = ConfigDict(extra='ignore')


class VenueNoteExport(BaseModel):
    """Same shape both ways — GET /me/export produces this, POST /me/import
    consumes it back. Exactly one of theatre_id/screen_id is set, matching
    the table's own scope check (schemas/venues.py:VenueNoteInput)."""

    theatre_id: Optional[str] = None
    screen_id: Optional[str] = None
    note: str = Field(..., min_length=1, max_length=5000)

    model_config = ConfigDict(extra='ignore')

    @model_validator(mode='after')
    def _exactly_one_scope(self) -> 'VenueNoteExport':
        if bool(self.theatre_id) == bool(self.screen_id):
            raise ValueError('exactly one of theatre_id/screen_id must be set')
        return self


class MovieLogExport(MovieLogInput):
    """A stored log plus its venue rating (if any) inline — unlike GET
    /movie-logs/export, which returns bare movie_logs rows with no rating
    attached at all."""

    id: str
    venue_rating: Optional[VenueRatingInput] = None

    model_config = ConfigDict(extra='ignore')


class AccountExport(BaseModel):
    profile: ProfileExport
    movie_logs: List[MovieLogExport]
    venue_notes: List[VenueNoteExport]


class MovieLogImportItem(MovieLogInput):
    """Same as a create payload, plus an optional nested venue_rating —
    restores both in one call instead of a separate PUT .../venue-rating
    per log."""

    venue_rating: Optional[VenueRatingInput] = None


class AccountImportRequest(BaseModel):
    """Restores content, not identity — profile fields are deliberately not
    importable here, the caller is already signed in as themselves."""

    movie_logs: List[MovieLogImportItem] = Field(default_factory=list, max_length=500)
    venue_notes: List[VenueNoteExport] = Field(default_factory=list, max_length=500)


class AccountImportResult(BaseModel):
    movie_logs_imported: int
    venue_ratings_imported: int
    venue_notes_imported: int

    model_config = ConfigDict(
        json_schema_extra={
            'example': {'movie_logs_imported': 12, 'venue_ratings_imported': 5, 'venue_notes_imported': 3}
        }
    )
