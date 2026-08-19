"""Schemas for the standalone movie-log CRUD API.

Field names match the `movie_logs` table columns so the API maps 1:1 to the
database (accessed through Supabase PostgREST under the caller's RLS scope).
"""

import re
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
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
ArrivalStatus = Literal['early', 'on_time', 'late']
ScreeningStartStatus = Literal['early', 'on_time', 'delayed', 'cancelled']
TimeOfDay = Literal['morning', 'afternoon', 'evening', 'night']
_MAX_PUNCTUALITY_DELTA_MINUTES = 300

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
    'ticket_url',
    'theatre_id',
    'screen_id',
    'movie_id',
    'visibility',
    'arrival_status',
    'arrival_delta_minutes',
    'screening_start_status',
    'screening_start_delta_minutes',
    'is_fdfs',
    'is_first_day',
    'is_archived',
    'extraction_provider',
    'extraction_model',
    'extraction_edited',
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


def _check_ticket_url(v: Optional[str]) -> Optional[str]:
    """Same http(s)-scheme check schemas/public_profile.py's ProfileLink.url
    already applies to a user-supplied link — kept file-local here since
    it's only needed in this one place, matching how most validators in
    this codebase stay single-file-local (see _validators.py's own
    docstring for when something graduates to shared)."""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not (v.startswith('http://') or v.startswith('https://')):
        raise ValueError('ticket_url must start with http:// or https://')
    return v


class TheatrePlaceInput(BaseModel):
    """A Google Places identity to resolve-or-create a theatre from, inline
    with a movie-log save — see MovieLogInput.theatre_place. No `city`:
    server-side place_details() (services/google_places.py) already derives
    it from `place_id` directly, the same way POST /venues/theatres does —
    a client-guessed city (e.g. splitting a free-typed address on commas)
    is no longer needed here."""

    place_id: str = Field(..., max_length=255)
    name: Optional[str] = Field(default=None, max_length=300)
    formatted_address: Optional[str] = Field(default=None, max_length=500)

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'place_id': 'ChIJ_______example_______',
                'name': 'PVR Nexus',
                'formatted_address': 'Nexus Mall, Vadapalani, Chennai, Tamil Nadu 600026',
            }
        }
    )


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
                'ticket_url': None,
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
    ticket_url: Optional[str] = Field(
        default=None, max_length=1000,
        description='A link to the booking/ticket itself (e.g. a shared '
        'BookMyShow/Fandango confirmation link) — separate from '
        'ticket_image_path (a photo), and same always-owner-only treatment: '
        'a booking link routinely carries an order id or other identifying '
        "info, so it's excluded from public_movie_log_entries/feed_entries "
        'the same way ticket_image_path already is, regardless of this '
        "log's own `visibility`.",
    )
    theatre_id: Optional[str] = Field(
        default=None, description='FK into public.theatres'
    )
    screen_id: Optional[str] = Field(
        default=None, description='FK into public.screens'
    )
    theatre_place: Optional[TheatrePlaceInput] = Field(
        default=None,
        description='Resolve-or-create a theatre from a Google Places identity, '
        'inline with this log save — an alternative to already having a '
        'theatre_id in hand. Ignored if `theatre_id` is also present (`theatre_id` '
        'always wins). If a theatre gets resolved this way (or `theatre_id` was '
        'given directly) and no `screen_id` is present, but `screen` (below) is '
        'non-empty, a screen is also resolved-or-created under that theatre by '
        "that name and linked — see services/venue_resolution.py. Meant to "
        'replace a create-theatre-then-create-log two-step client flow with one '
        'atomic call.',
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
    arrival_status: Optional[ArrivalStatus] = Field(
        default=None,
        description="How the caller's own arrival compared to their booked "
        'showtime — independent of screening_start_status (you can arrive '
        'late to an on-time screening, or early to a delayed one).',
    )
    arrival_delta_minutes: Optional[int] = Field(
        default=None, ge=0, le=_MAX_PUNCTUALITY_DELTA_MINUTES,
        description='Optional, only meaningful alongside arrival_status '
        "early/late — 'late' without a number is still a valid entry.",
    )
    screening_start_status: Optional[ScreeningStartStatus] = Field(
        default=None,
        description='Whether the movie itself started on time — "delayed", '
        'not "late", since this describes the screening, not the caller. '
        '"cancelled" for a screening that never started at all — no delta '
        'makes sense for that, same as "on_time".',
    )
    screening_start_delta_minutes: Optional[int] = Field(
        default=None, ge=0, le=_MAX_PUNCTUALITY_DELTA_MINUTES,
        description='Optional, only meaningful alongside screening_start_status '
        "early/delayed — 'delayed' without a number is still a valid entry.",
    )
    is_fdfs: bool = Field(
        default=False,
        description='First Day First Show — the very first screening of this '
        "movie's opening day, not just any showing on that day. Not derivable "
        "from watched_time alone (no canonical \"first show\" registry to check "
        'against), stays an explicit, manually-set fact. Setting this true '
        'forces is_first_day true too, in the same call — you don\'t need to '
        'send both.',
    )
    is_first_day: bool = Field(
        default=False,
        description="Watched on the movie's opening day (any showing, not "
        'necessarily the first). Also not derivable from watched_time alone — '
        "would need the movie's real release date (from a linked movie_id) "
        'compared against watched_date, which this app doesn\'t do '
        'automatically; stays explicit like is_fdfs.',
    )
    is_archived: bool = Field(
        default=False,
        description='A genuinely distinct tier from `private`, not another name '
        'for it — a `private` log still counts toward theatre/screen/movie '
        "aggregate stats (it's venue signal, not review content); an archived "
        "one doesn't count toward anything, and never appears anywhere but the "
        "owner's own GET /movie-logs, regardless of visibility. Reversible — "
        'archiving is not deleting.',
    )
    extraction_provider: Optional[Literal['openrouter', 'openai', 'gemini']] = Field(
        default=None,
        description="Which LLM provider's POST /movie-metadata/extract call "
        'informed this log, if any — null means it was entered fully manually. '
        "Set by the client from that endpoint's own `used_provider`, not "
        'independently re-derived here — provenance metadata the frontend can '
        'show as a small attribution ("Extracted with Gemini"), not something '
        'the backend verifies. Must be set together with extraction_model (both '
        'null, or both set).',
    )
    extraction_model: Optional[str] = Field(
        default=None, max_length=200,
        description='Which model actually produced the extraction that informed '
        "this log, if any — from POST /movie-metadata/extract's own `used_model`. "
        'Must be set together with extraction_provider.',
    )
    extraction_edited: Optional[bool] = Field(
        default=None,
        description='Whether the caller changed any field after extraction, '
        'before saving — only meaningful when extraction_model is set. Left null '
        '(not false) on a fully-manual log, since "edited" presupposes something '
        'was extracted to edit in the first place. Client-asserted, like '
        "extraction_provider/extraction_model — the backend can't independently "
        'verify whether the saved values differ from what extraction returned.',
    )

    @model_validator(mode='after')
    def _check_extraction_pair(self) -> 'MovieLogInput':
        if (self.extraction_provider is None) != (self.extraction_model is None):
            raise ValueError(
                'extraction_provider and extraction_model must be set together '
                '(both null, or both set) — one without the other is meaningless.'
            )
        return self

    @model_validator(mode='after')
    def _check_punctuality_pairs(self) -> 'MovieLogInput':
        if self.arrival_delta_minutes is not None and self.arrival_status not in ('early', 'late'):
            raise ValueError('arrival_delta_minutes requires arrival_status to be early or late')
        if self.screening_start_delta_minutes is not None and self.screening_start_status not in ('early', 'delayed'):
            raise ValueError('screening_start_delta_minutes requires screening_start_status to be early or delayed')
        return self

    @model_validator(mode='after')
    def _fdfs_implies_first_day(self) -> 'MovieLogInput':
        # One-directional, always safe to apply regardless of what else is in
        # this payload: turning FDFS on always also turns first_day on, in
        # the same call — the frontend gets this UX for free by sending only
        # is_fdfs, and a raw API call bypassing the frontend can't produce an
        # inconsistent state either. The DB carries the same rule as a CHECK
        # constraint, defense in depth for anything reaching PostgREST directly.
        if self.is_fdfs:
            self.is_first_day = True
        return self

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

    @field_validator('ticket_url')
    @classmethod
    def _check_ticket_url_field(cls, v: Optional[str]) -> Optional[str]:
        return _check_ticket_url(v)

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
    ticket_url: Optional[str] = Field(default=None, max_length=1000)
    theatre_id: Optional[str] = Field(default=None)
    screen_id: Optional[str] = Field(default=None)
    theatre_place: Optional[TheatrePlaceInput] = Field(
        default=None, description='See MovieLogInput.theatre_place — same resolution '
        'order, applied to this patch\'s own theatre_id/screen_id/screen (not the '
        "row's existing stored values).",
    )
    movie_id: Optional[str] = Field(
        default=None, description='FK into public.movies — see MovieLogInput.movie_id'
    )
    visibility: Optional[Visibility] = Field(default=None)
    arrival_status: Optional[ArrivalStatus] = Field(default=None)
    arrival_delta_minutes: Optional[int] = Field(
        default=None, ge=0, le=_MAX_PUNCTUALITY_DELTA_MINUTES
    )
    screening_start_status: Optional[ScreeningStartStatus] = Field(default=None)
    screening_start_delta_minutes: Optional[int] = Field(
        default=None, ge=0, le=_MAX_PUNCTUALITY_DELTA_MINUTES
    )
    is_fdfs: Optional[bool] = Field(default=None)
    is_first_day: Optional[bool] = Field(default=None)
    is_archived: Optional[bool] = Field(default=None)
    extraction_provider: Optional[Literal['openrouter', 'openai', 'gemini']] = Field(default=None)
    extraction_model: Optional[str] = Field(default=None, max_length=200)
    extraction_edited: Optional[bool] = Field(default=None)
    # No cross-field validator here for the extraction_provider/extraction_model
    # pairing either, same reasoning as the punctuality fields just below —
    # a partial update can't see whether the other half was already set by a
    # prior call. The DB CHECK constraint enforces the pair on the row's final
    # state.
    # No cross-field validator here unlike MovieLogInput's
    # _check_punctuality_pairs — this is a partial update, Pydantic can't
    # see whether arrival_status was already set by a prior call, so it
    # can't safely reject "just updating the delta" the way create can
    # reject an inconsistent pair up front. The DB constraint (which sees
    # the row's final state after the patch, not just this payload) is
    # what actually enforces this on update. The FDFS coupling below is
    # different — safe on a partial update, since it only ever forces a
    # value forward, it never needs to know prior row state to decide
    # whether to reject something.

    @model_validator(mode='after')
    def _fdfs_implies_first_day(self) -> 'MovieLogUpdate':
        if self.is_fdfs:
            self.is_first_day = True
        return self

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

    @field_validator('ticket_url')
    @classmethod
    def _check_ticket_url_field(cls, v: Optional[str]) -> Optional[str]:
        return _check_ticket_url(v)

    @field_validator('rating')
    @classmethod
    def _check_rating(cls, v: Optional[float]) -> Optional[float]:
        return _check_half_star(v)

    @field_validator('currency')
    @classmethod
    def _check_currency_field(cls, v: Optional[str]) -> Optional[str]:
        return _check_currency(v)


class FavoritePositionUpdate(BaseModel):
    """Body for PUT /movie-logs/{id}/favorite. Moving into an already-taken
    slot vacates whichever other log currently holds it — a move, not a
    conflict to resolve client-side first."""

    position: int = Field(..., ge=1, le=4)

    model_config = ConfigDict(json_schema_extra={'example': {'position': 1}})


class MovieLog(MovieLogInput):
    """A stored movie log as returned by the database."""

    id: str
    user_id: str
    created_at: str
    updated_at: str
    edited_at: Optional[str] = Field(
        default=None,
        description='Set the first time a content field (movie, dates, rating, '
        "notes, visibility, ...) actually changes after creation — null means "
        'never edited. Deliberately not derived from updated_at (which is '
        'bumped by any row change, including ones that are not a content edit, '
        'e.g. this field going null on account deletion). The client-facing '
        '"edited" indicator on a log — non-null is the flag, the timestamp '
        'itself is free extra context ("edited 3 days ago").',
    )
    favorite_position: Optional[int] = Field(
        default=None,
        description='1-4 if this is one of the caller\'s up-to-4 favorite logs '
        '(Letterboxd-style), null otherwise — this doubles as the favorite '
        "flag, no separate boolean. Read-only here: set via PUT/DELETE "
        ".../favorite, not via PATCH — it has its own business rule (moving "
        "another log out of a taken slot) that doesn't belong in a general "
        'field update.',
    )
    time_of_day: Optional[TimeOfDay] = Field(
        default=None,
        description='Computed from watched_time (morning <12:00, afternoon '
        '<17:00, evening <21:00, else night) — never stored, always derived on '
        'read, so it can never drift from watched_time. Read-only: not settable '
        'via POST/PATCH, sending it has no effect.',
    )
    like_count: int = Field(
        default=0,
        description='A single reaction, not a vote — no dislike/downvote exists. '
        'Trigger-maintained, not computed on read.',
    )
    liked_by_caller: Optional[bool] = Field(
        default=None,
        description="Whether the caller has liked this log — only meaningful "
        "(non-null) where someone else's content can appear (a theatre/screen/"
        "movie's reviews, a profile, the feed); always null on the caller's own "
        "GET /movie-logs, where every row is already their own.",
    )


class VenueRating(BaseModel):
    """The caller's own venue rating for one log, as returned by GET
    .../venue-rating — same fields as VenueRatingInput (schemas/venues.py)
    plus the row's identity/timestamps."""

    movie_log_id: str
    user_id: str
    screen_rating: Optional[float] = Field(default=None)
    speaker_rating: Optional[float] = Field(default=None)
    ac_rating: Optional[float] = Field(default=None)
    seat_rating: Optional[float] = Field(default=None)
    created_at: str
    updated_at: str

    model_config = ConfigDict(
        extra='ignore',
        json_schema_extra={
            'example': {
                'movie_log_id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                'user_id': '11111111-1111-1111-1111-111111111111',
                'screen_rating': 4.5,
                'speaker_rating': 5.0,
                'ac_rating': 3.5,
                'seat_rating': 4.0,
                'created_at': '2026-08-10T03:31:15.977764+00:00',
                'updated_at': '2026-08-10T03:31:15.977764+00:00',
            }
        },
    )


PhotoTag = Literal['food', 'theatre', 'ambiance', 'outside', 'inside', 'other']


class MovieLogPhotoInput(BaseModel):
    """Body for POST /movie-logs/{id}/photos. `storage_path` must already
    exist in Supabase Storage under the caller's own prefix — same
    upload-then-attach flow `ticket_image_path` already uses (see
    `_enforce_image_prefix` in routers/movie_logs.py), just a separate
    bucket ('movie-log-photos') and up to 10 rows per log instead of one
    single column. Not for the ticket photo itself — `tag` has no
    ticket-equivalent value; that stays PATCH /{id} ticket_image_path,
    always owner-only regardless of the log's visibility."""

    storage_path: str = Field(..., max_length=512)
    tag: PhotoTag = Field(
        description="One of 'food', 'theatre', 'ambiance', 'outside', "
        "'inside', 'other' — how the frontend categorizes/filters a log's "
        'photos.'
    )

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'storage_path': '11111111-1111-1111-1111-111111111111/photo1.jpg',
                'tag': 'theatre',
            }
        }
    )

    @field_validator('storage_path')
    @classmethod
    def _check_path(cls, v: str) -> str:
        checked = validate_storage_path(v)
        if not checked:
            raise ValueError('storage_path is required')
        return checked


class MovieLogPhoto(BaseModel):
    """A stored photo attached to a log, as returned by POST/GET
    .../photos. Inherits the parent log's visibility for other viewers —
    a public/anonymous log's photos are visible to everyone, same as its
    notes/rating/movie fields — deliberately different from
    ticket_image_path, which stays owner-only regardless of visibility;
    see the tag CHECK constraint's comment in the movie_log_photos
    migration for why that split holds."""

    id: str
    movie_log_id: str
    user_id: Optional[str] = None
    storage_path: str
    tag: PhotoTag
    created_at: str

    model_config = ConfigDict(
        extra='ignore',
        json_schema_extra={
            'example': {
                'id': '7c9e6679-7425-40de-944b-e07fc1f90ae7',
                'movie_log_id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                'user_id': '11111111-1111-1111-1111-111111111111',
                'storage_path': '11111111-1111-1111-1111-111111111111/photo1.jpg',
                'tag': 'theatre',
                'created_at': '2026-08-19T03:31:15.977764+00:00',
            }
        },
    )


class MovieLogSearchResult(MovieLog):
    """GET /movie-logs/search's response shape — every MovieLog field plus
    which ones matched the query, for the frontend to highlight. The
    matched value itself isn't duplicated here — it's already on the row
    (e.g. `theater`) — this only flags which fields to visually emphasize."""

    matched_fields: List[str] = Field(
        default_factory=list,
        description="Which of movie/theater/screen/seats/language/notes the "
        "query matched, e.g. [\"theater\", \"notes\"] — not a duplicate of "
        "their values, those are already on this same object.",
    )
