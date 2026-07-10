"""Schemas for the standalone movie-log CRUD API.

Field names match the `movie_logs` table columns so the API maps 1:1 to the
database (accessed through Supabase PostgREST under the caller's RLS scope).
"""

import re
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

_ISO_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_HHMM = re.compile(r'^\d{2}:\d{2}$')

# Writable columns a client may set. Server-managed columns (id, user_id,
# created_at, updated_at) are intentionally excluded to prevent mass assignment.
WRITABLE_FIELDS = (
    'movie',
    'watched_date',
    'watched_time',
    'timezone_abbrv',
    'theater',
    'seats',
    'language',
    'screen',
    'booking_ref',
    'certificate',
    'notes',
    'rating',
    'ticket_image_path',
)


def _validate_image_path(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if '..' in value or value.startswith('/') or '://' in value:
        raise ValueError('ticket_image_path must be a relative storage path')
    return value


class MovieLogInput(BaseModel):
    """Full create payload. Unknown keys are ignored (e.g. pasted exports)."""

    model_config = ConfigDict(extra='ignore')

    movie: Optional[str] = Field(default=None, max_length=300)
    watched_date: Optional[str] = Field(default=None, max_length=10)
    watched_time: Optional[str] = Field(default=None, max_length=5)
    timezone_abbrv: Optional[str] = Field(default=None, max_length=8)
    theater: Optional[str] = Field(default=None, max_length=300)
    seats: List[str] = Field(default_factory=list, max_length=50)
    language: Optional[str] = Field(default=None, max_length=100)
    screen: Optional[str] = Field(default=None, max_length=100)
    booking_ref: Optional[str] = Field(default=None, max_length=200)
    certificate: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=5000)
    rating: Optional[int] = Field(default=None, ge=1, le=10)
    ticket_image_path: Optional[str] = Field(default=None, max_length=512)

    @field_validator('watched_date')
    @classmethod
    def _check_date(cls, v: Optional[str]) -> Optional[str]:
        if v and not _ISO_DATE.match(v):
            raise ValueError('watched_date must be YYYY-MM-DD')
        return v

    @field_validator('watched_time')
    @classmethod
    def _check_time(cls, v: Optional[str]) -> Optional[str]:
        if v and not _HHMM.match(v):
            raise ValueError('watched_time must be HH:MM (24h)')
        return v

    @field_validator('movie', mode='before')
    @classmethod
    def _check_movie(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str) and v.strip() == '':
            raise ValueError('movie title must not be blank')
        return v

    @field_validator('seats')
    @classmethod
    def _check_seats(cls, v: List[str]) -> List[str]:
        cleaned = [s.strip() for s in v if s and s.strip()]
        if any(len(s) > 16 for s in cleaned):
            raise ValueError('seat identifiers must be <= 16 chars')
        return cleaned

    @field_validator('ticket_image_path')
    @classmethod
    def _check_path(cls, v: Optional[str]) -> Optional[str]:
        return _validate_image_path(v)


class MovieLogUpdate(BaseModel):
    """Partial update payload; only provided fields are sent to the database."""

    model_config = ConfigDict(extra='ignore')

    movie: Optional[str] = Field(default=None, max_length=300)
    watched_date: Optional[str] = Field(default=None, max_length=10)
    watched_time: Optional[str] = Field(default=None, max_length=5)
    timezone_abbrv: Optional[str] = Field(default=None, max_length=8)
    theater: Optional[str] = Field(default=None, max_length=300)
    seats: Optional[List[str]] = Field(default=None, max_length=50)
    language: Optional[str] = Field(default=None, max_length=100)
    screen: Optional[str] = Field(default=None, max_length=100)
    booking_ref: Optional[str] = Field(default=None, max_length=200)
    certificate: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=5000)
    rating: Optional[int] = Field(default=None, ge=1, le=10)
    ticket_image_path: Optional[str] = Field(default=None, max_length=512)

    @field_validator('watched_date')
    @classmethod
    def _check_date(cls, v: Optional[str]) -> Optional[str]:
        if v and not _ISO_DATE.match(v):
            raise ValueError('watched_date must be YYYY-MM-DD')
        return v

    @field_validator('watched_time')
    @classmethod
    def _check_time(cls, v: Optional[str]) -> Optional[str]:
        if v and not _HHMM.match(v):
            raise ValueError('watched_time must be HH:MM (24h)')
        return v

    @field_validator('movie', mode='before')
    @classmethod
    def _check_movie(cls, v: Optional[str]) -> Optional[str]:
        # Reject blank strings in updates too — null is fine but '' is not.
        if isinstance(v, str) and v.strip() == '':
            raise ValueError('movie title must not be blank')
        return v

    @field_validator('ticket_image_path')
    @classmethod
    def _check_path(cls, v: Optional[str]) -> Optional[str]:
        return _validate_image_path(v)


class MovieLog(MovieLogInput):
    """A stored movie log as returned by the database."""

    id: str
    user_id: str
    created_at: str
    updated_at: str
