from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    model_config = ConfigDict(extra='ignore')


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
    model_config = ConfigDict(extra='ignore')


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