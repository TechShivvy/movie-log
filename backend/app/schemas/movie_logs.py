"""Schemas for the standalone movie-log CRUD API.

Field names match the `movie_logs` table columns so the API maps 1:1 to the
database (accessed through Supabase PostgREST under the caller's RLS scope).
"""

import re
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator
from schemas._validators import validate_storage_path

_ISO_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_HHMM = re.compile(r'^\d{2}:\d{2}$')
_CURRENCY_CODE = re.compile(r'^[A-Za-z]{3}$')

# Matches a same-row seat range like "L4-L7", "L4-7", or "l 4 - l 7" — group 1
# is the row letters, group 2/3 are the start/end seat numbers. The row on
# the right side is optional (and, if present, isn't checked against the
# left side — "L4-M7" is nonsensical but rare enough not to special-case;
# it just gets expanded as if the row were L, same as "L4-7").
_SEAT_RANGE = re.compile(r'^\s*([A-Za-z]+)\s*(\d+)\s*-\s*(?:[A-Za-z]+\s*)?(\d+)\s*$')
# A single ticket range covering more than this many seats is more likely a
# typo (e.g. a stray "-" between two unrelated numbers) than a real group
# booking — left unexpanded rather than silently guessed at.
_MAX_RANGE_SPAN = 30
# Total individual seats after expansion — matches the pre-existing
# Field(max_length=50) on the raw (pre-expansion) list; that constraint runs
# before this validator and can't see the expanded count, so it's re-checked
# here explicitly.
_MAX_SEATS = 50


def _expand_seat_ranges(raw: list[str]) -> list[str]:
    """Expand same-row seat ranges ("L4-L7") into individual seats
    (["L4","L5","L6","L7"]) so seat search/lookup works on a specific seat
    regardless of whether the ticket printed it as part of a range. Tokens
    that don't look like a range pass through unchanged rather than being
    dropped — better to keep an odd literal value than silently lose data.
    A "backwards" range ("L7-L4") is still a real, well-defined set of
    seats — printed order doesn't change which seats they are — so it's
    normalized (swapped) rather than treated as malformed. Only a
    genuinely implausible span (>_MAX_RANGE_SPAN seats, more likely OCR
    noise or a typo than a real booking) is left unexpanded.
    """

    expanded: list[str] = []
    for token in raw:
        m = _SEAT_RANGE.match(token)
        if not m:
            expanded.append(token)
            continue
        row, start_s, end_s = m.group(1), m.group(2), m.group(3)
        start, end = int(start_s), int(end_s)
        if start > end:
            start, end = end, start
        if (end - start + 1) > _MAX_RANGE_SPAN:
            expanded.append(token)
            continue
        expanded.extend(f'{row}{n}' for n in range(start, end + 1))
    return expanded


def _check_seats(v: list[str]) -> list[str]:
    cleaned = [s.strip() for s in v if s and s.strip()]
    expanded = _expand_seat_ranges(cleaned)
    if len(expanded) > _MAX_SEATS:
        raise ValueError(f'no more than {_MAX_SEATS} seats allowed (after expanding ranges)')
    if any(len(s) > 16 for s in expanded):
        raise ValueError('seat identifiers must be <= 16 chars')
    return expanded

Visibility = Literal['private', 'anonymous', 'public']

# Writable columns a client may set. Server-managed columns (id, user_id,
# created_at, updated_at, verified, verified_at, verified_source) are
# intentionally excluded to prevent mass assignment.
WRITABLE_FIELDS = (
    'movie',
    'watched_date',
    'watched_time',
    'timezone_abbrv',
    'theater',
    'seats',
    'language',
    'screen',
    'format',
    'price',
    'currency',
    'booking_ref',
    'certificate',
    'notes',
    'rating',
    'ticket_image_path',
    'theatre_id',
    'screen_id',
    'movie_id',
    'visibility',
)


def _check_half_star(v: Optional[float]) -> Optional[float]:
    if v is None:
        return None
    if v < 0.5 or v > 5 or (v * 2) % 1 != 0:
        raise ValueError('rating must be between 0.5 and 5 in 0.5 increments')
    return v


def _check_currency(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip().upper()
    if not _CURRENCY_CODE.match(v):
        raise ValueError('currency must be a 3-letter ISO 4217 code, e.g. "INR"')
    return v


class MovieLogInput(BaseModel):
    """Full create payload. Unknown keys are ignored (e.g. pasted exports)."""

    model_config = ConfigDict(
        extra='ignore',
        json_schema_extra={
            'example': {
                'movie': 'Ekkadiki Pothavu Chinnavada',
                'watched_date': '2016-12-19',
                'watched_time': '21:30',
                'timezone_abbrv': 'IST',
                'theater': 'Sri Rama Picture Place: Vizag',
                'seats': ['L18', 'L19', 'L20'],
                'language': 'Telugu',
                'screen': 'Balcony',
                'format': '2D',
                'price': 250.0,
                'currency': 'INR',
                'booking_ref': 'BMS12345678',
                'certificate': 'U/A',
                'notes': 'Great sound, comfy seats.',
                'rating': 4.5,
                'ticket_image_path': None,
                'theatre_id': None,
                'screen_id': None,
                'visibility': 'private',
            }
        },
    )

    movie: Optional[str] = Field(default=None, max_length=300)
    watched_date: Optional[str] = Field(default=None, max_length=10)
    watched_time: Optional[str] = Field(default=None, max_length=5)
    timezone_abbrv: Optional[str] = Field(default=None, max_length=8)
    theater: Optional[str] = Field(default=None, max_length=300)
    seats: List[str] = Field(
        default_factory=list,
        max_length=50,
        description="Individual seat codes, e.g. ['L18','L19','L20']. A "
        "same-row range like 'L18-L20' is expanded into individual seats "
        "automatically, so searching/filtering by one seat later still "
        "works regardless of how the ticket printed it.",
    )
    language: Optional[str] = Field(default=None, max_length=100)
    screen: Optional[str] = Field(default=None, max_length=100)
    format: Optional[str] = Field(
        default=None, max_length=50,
        description='Presentation format (2D, 3D, 4DX, IMAX, ...) — separate '
        'from `screen`, a ticket can print both at once',
    )
    price: Optional[float] = Field(
        default=None, ge=0, description='Ticket price paid — see `currency`'
    )
    currency: Optional[str] = Field(
        default=None, max_length=3, description='ISO 4217 currency code for `price`, e.g. "INR"'
    )
    booking_ref: Optional[str] = Field(default=None, max_length=200)
    certificate: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=5000)
    rating: Optional[float] = Field(
        default=None, description='Audience rating, 0.5-5 in half-star steps'
    )
    ticket_image_path: Optional[str] = Field(default=None, max_length=512)
    theatre_id: Optional[str] = Field(
        default=None, description='FK into public.theatres'
    )
    screen_id: Optional[str] = Field(
        default=None, description='FK into public.screens'
    )
    movie_id: Optional[str] = Field(
        default=None,
        description='FK into public.movies — optional, from POST /movies '
        "after picking a TMDB search result. The `movie` text field above "
        "stays the display source of truth either way; this only links the "
        'log to the catalog.',
    )
    visibility: Visibility = Field(
        default='private',
        description="Who can see this entry (not the venue sub-ratings on "
        "PUT .../venue-rating — those always count toward the theatre/screen "
        "aggregate regardless of this setting, they're never individually "
        "exposed either way). 'private': only the owner. 'anonymous': visible "
        "on the theatre/screen's review list (GET .../reviews), but not "
        "attributed — never shown on the owner's own public profile either, "
        "that would defeat the point. 'public': visible on both, attributed "
        "to the owner's username.",
    )

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
    def _validate_seats(cls, v: List[str]) -> List[str]:
        return _check_seats(v)

    @field_validator('ticket_image_path')
    @classmethod
    def _check_path(cls, v: Optional[str]) -> Optional[str]:
        return validate_storage_path(v)

    @field_validator('rating')
    @classmethod
    def _check_rating(cls, v: Optional[float]) -> Optional[float]:
        return _check_half_star(v)

    @field_validator('currency')
    @classmethod
    def _check_currency_field(cls, v: Optional[str]) -> Optional[str]:
        return _check_currency(v)


class MovieLogUpdate(BaseModel):
    """Partial update payload; only provided fields are sent to the database."""

    model_config = ConfigDict(
        extra='ignore',
        json_schema_extra={
            'example': {
                'rating': 5,
                'notes': 'Rewatched on re-release — even better on a second viewing.',
                'visibility': 'public',
            }
        },
    )

    movie: Optional[str] = Field(default=None, max_length=300)
    watched_date: Optional[str] = Field(default=None, max_length=10)
    watched_time: Optional[str] = Field(default=None, max_length=5)
    timezone_abbrv: Optional[str] = Field(default=None, max_length=8)
    theater: Optional[str] = Field(default=None, max_length=300)
    seats: Optional[List[str]] = Field(
        default=None,
        max_length=50,
        description="Replaces the log's full seat list. Same-row ranges "
        "('L18-L20') are expanded into individual seats, same as on create.",
    )
    language: Optional[str] = Field(default=None, max_length=100)
    screen: Optional[str] = Field(default=None, max_length=100)
    format: Optional[str] = Field(
        default=None, max_length=50,
        description='Presentation format (2D, 3D, 4DX, IMAX, ...) — separate '
        'from `screen`, a ticket can print both at once',
    )
    price: Optional[float] = Field(
        default=None, ge=0, description='Ticket price paid — see `currency`'
    )
    currency: Optional[str] = Field(
        default=None, max_length=3, description='ISO 4217 currency code for `price`, e.g. "INR"'
    )
    booking_ref: Optional[str] = Field(default=None, max_length=200)
    certificate: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=5000)
    rating: Optional[float] = Field(
        default=None, description='Audience rating, 0.5-5 in half-star steps'
    )
    ticket_image_path: Optional[str] = Field(default=None, max_length=512)
    theatre_id: Optional[str] = Field(default=None)
    screen_id: Optional[str] = Field(default=None)
    movie_id: Optional[str] = Field(
        default=None, description='FK into public.movies — see MovieLogInput.movie_id'
    )
    visibility: Optional[Visibility] = Field(default=None)

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

    @field_validator('seats')
    @classmethod
    def _validate_seats(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        # Was missing entirely before — a PATCH with seats bypassed both the
        # length/range-expansion handling and the per-seat length check that
        # MovieLogInput already applied on create.
        if v is None:
            return None
        return _check_seats(v)

    @field_validator('ticket_image_path')
    @classmethod
    def _check_path(cls, v: Optional[str]) -> Optional[str]:
        return validate_storage_path(v)

    @field_validator('rating')
    @classmethod
    def _check_rating(cls, v: Optional[float]) -> Optional[float]:
        return _check_half_star(v)

    @field_validator('currency')
    @classmethod
    def _check_currency_field(cls, v: Optional[str]) -> Optional[str]:
        return _check_currency(v)


class MovieLog(MovieLogInput):
    """A stored movie log as returned by the database."""

    id: str
    user_id: str
    created_at: str
    updated_at: str
