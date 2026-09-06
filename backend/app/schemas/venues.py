from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

VenueStatus = Literal['open', 'closed', 'renovation']


def _check_half_star(v: Optional[float]) -> Optional[float]:
    if v is None:
        return None
    if v < 0.5 or v > 5 or (v * 2) % 1 != 0:
        raise ValueError('rating must be between 0.5 and 5 in 0.5 increments')
    return v


class TheatreCreate(BaseModel):
    name: str = Field(..., max_length=300)
    chain: Optional[str] = Field(default=None, max_length=100)
    city: str = Field(..., max_length=150)
    state: Optional[str] = Field(default=None, max_length=150)
    country: str = Field(default='IN', max_length=2)
    lat: Optional[float] = None
    lng: Optional[float] = None
    place_id: Optional[str] = Field(
        default=None,
        max_length=255,
        description='Google Places place_id; used as the real dedup key.',
    )
    formatted_address: Optional[str] = Field(default=None, max_length=500)

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'name': 'PVR Nexus',
                'chain': 'PVR',
                'city': 'Chennai',
                'state': 'Tamil Nadu',
                'country': 'IN',
                'lat': 13.0605,
                'lng': 80.2087,
                'place_id': 'ChIJ_______example_______',
                'formatted_address': 'Nexus Mall, Vadapalani, Chennai, Tamil Nadu 600026',
            }
        }
    )


class Theatre(TheatreCreate):
    id: str
    source: str = Field(
        default='user_submitted',
        description="'google_places' if this theatre's data was fetched "
        "server-side from a real Google Places place_id; 'user_submitted' if "
        "it was free-typed with no place_id to back it. Not client-settable "
        '— the server decides this from whether place_id resolved.',
    )
    status: VenueStatus = Field(
        default='open',
        description="'closed'/'renovation' don't hide the theatre from search/"
        'match/history — historical logs still reference it — this is purely '
        'an annotation for the frontend to badge. Admin-only to change, see '
        'PATCH /theatres/{id}/status.',
    )
    nickname: Optional[str] = Field(
        default=None,
        max_length=300,
        description='Admin-set alternate label — NOT a correction to `name` '
        '(that stays Google-sourced/untouched). null unless an admin has set '
        'one; the frontend decides whether/how to show it, this is returned '
        'raw, never coalesced into `name` server-side. Admin-only to set, see '
        'PATCH /theatres/{id}/nickname.',
    )
    nickname_address: Optional[str] = Field(
        default=None,
        max_length=500,
        description='Admin-set alternate address, paired with `nickname` — '
        'same "not a correction to formatted_address" reasoning, independently '
        'settable from `nickname` itself.',
    )
    model_config = ConfigDict(extra='ignore')


class TheatreSearchRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=300)
    session_token: Optional[str] = Field(
        default=None,
        max_length=100,
        description='Client-generated token, reused across every keystroke of '
        'one search plus the POST /theatres call that follows it. Google bills '
        "a whole autocomplete-then-create session as one unit when it's "
        'reused, instead of every call separately — omitting it still works, '
        'just costs more per search.',
    )

    model_config = ConfigDict(json_schema_extra={'example': {'query': 'PVR Nexus Chennai'}})


class TheatrePlaceSuggestion(BaseModel):
    place_id: str
    description: Optional[str] = None
    main_text: Optional[str] = None
    secondary_text: Optional[str] = None


class TheatreMatchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=300)
    city: Optional[str] = Field(default=None, max_length=150)

    model_config = ConfigDict(
        json_schema_extra={'example': {'query': 'PVR Nexus', 'city': 'Chennai'}}
    )


class TheatreMatchCandidate(BaseModel):
    id: str
    name: str
    chain: Optional[str] = None
    city: str
    formatted_address: Optional[str] = None
    nickname: Optional[str] = Field(
        default=None,
        description='See Theatre.nickname — `similarity` is ranked against '
        'whichever of name/nickname is the closer match to the query, so a '
        "candidate can surface here on its nickname alone even if its "
        "official name doesn't match at all.",
    )
    similarity: float


class ScreenMatchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=100)

    model_config = ConfigDict(json_schema_extra={'example': {'query': 'Screen 4'}})


class ScreenMatchCandidate(BaseModel):
    id: str
    name: str
    screen_type: Optional[str] = None
    similarity: float


class ScreenCreate(BaseModel):
    name: str = Field(..., max_length=100)
    screen_type: Optional[str] = Field(default=None, max_length=50)

    model_config = ConfigDict(
        json_schema_extra={'example': {'name': 'Screen 4 - IMAX', 'screen_type': 'IMAX'}}
    )


class Screen(ScreenCreate):
    id: str
    theatre_id: str
    status: VenueStatus = Field(
        default='open',
        description='Same shape as Theatre.status — admin-only to change, see '
        'PATCH /screens/{id}/status.',
    )
    model_config = ConfigDict(extra='ignore')


class VenueStatusUpdate(BaseModel):
    status: VenueStatus

    model_config = ConfigDict(json_schema_extra={'example': {'status': 'closed'}})


class VenueNicknameUpdate(BaseModel):
    """Body for PATCH /theatres/{id}/nickname (admin-only). Both fields are
    optional and independently settable — a field omitted entirely from the
    request body is left unchanged; a field sent as `null` or `""` clears it
    (sets the column back to null); a field sent as a non-empty string sets
    it. Sending `{}` is a 400 (nothing to do), same as PATCH /movie-logs/{id}
    with an empty patch."""

    nickname: Optional[str] = Field(default=None, max_length=300)
    nickname_address: Optional[str] = Field(default=None, max_length=500)

    model_config = ConfigDict(
        json_schema_extra={
            'example': {'nickname': 'The Old Sathyam', 'nickname_address': None}
        }
    )


class VenueRatingInput(BaseModel):
    screen_rating: Optional[float] = Field(default=None)
    speaker_rating: Optional[float] = Field(default=None)
    ac_rating: Optional[float] = Field(default=None)
    seat_rating: Optional[float] = Field(default=None)

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'screen_rating': 4.5,
                'speaker_rating': 5,
                'ac_rating': 3.5,
                'seat_rating': 4,
            }
        }
    )

    @field_validator('screen_rating', 'speaker_rating', 'ac_rating', 'seat_rating')
    @classmethod
    def _check(cls, v: Optional[float]) -> Optional[float]:
        return _check_half_star(v)


class VenueNoteInput(BaseModel):
    """A private, standing note about a theatre or screen — independent of
    any specific visit/log. One per (user, theatre) or (user, screen);
    saving again overwrites the previous text rather than adding a new one.
    """

    note: str = Field(..., min_length=1, max_length=5000)

    model_config = ConfigDict(
        json_schema_extra={
            'example': {'note': "Always ask for row H — best sightline, less neck strain."}
        }
    )


class VenueNote(BaseModel):
    id: str
    user_id: str
    theatre_id: Optional[str] = None
    screen_id: Optional[str] = None
    movie_id: Optional[str] = Field(
        default=None,
        description='Set instead of theatre_id/screen_id for a note about a '
        'catalog movie rather than a venue — see GET/PUT/DELETE '
        '/movies/{id}/note. Exactly one of the three is ever set.',
    )
    note: str
    created_at: str
    updated_at: str

    model_config = ConfigDict(extra='ignore')

class PunctualityStats(BaseModel):
    """Aggregate screening punctuality at a theatre or screen — same
    "venue signal, counts regardless of visibility" reasoning as the star
    ratings, sourced from movie_logs.screening_start_status/_delta_minutes
    rather than visit_venue_ratings. `total_count` only ever counts logs
    where screening_start_status was actually set — most logs won't have
    an opinion on this, that's expected, not missing data."""

    on_time_count: int = 0
    early_count: int = 0
    delayed_count: int = 0
    cancelled_count: int = 0
    avg_delay_minutes: Optional[float] = Field(
        default=None, description='Average of screening_start_delta_minutes '
        "among delayed screenings only — doesn't include early/on_time/cancelled."
    )
    total_count: int = 0

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'on_time_count': 5,
                'early_count': 1,
                'delayed_count': 3,
                'cancelled_count': 0,
                'avg_delay_minutes': 12.3,
                'total_count': 9,
            }
        }
    )
