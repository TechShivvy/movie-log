from datetime import datetime
from typing import List, Optional
from zoneinfo import ZoneInfo, available_timezones

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

_VALID_ABBR: set[str] = {
    abbr
    for tz in available_timezones()
    if (abbr := ZoneInfo(tz).tzname(datetime.utcnow())) and abbr.isalpha()
}


class MovieMetadata(BaseModel):
    movie: Optional[str] = Field(None, description='Name of the movie')
    date: Optional[str] = Field(None, description='Date of the movie')
    time: Optional[str] = Field(None, description='Time of the movie')
    timezone_abbrv: Optional[str] = Field(
        None, description='Timezone abbreviation (e.g., IST, EST)'
    )
    theater: Optional[str] = Field(
        None, description='Name of the theater or cinema where the movie is shown'
    )
    seats: Optional[List[str]] = Field(
        default_factory=list, description='List of seat identifiers'
    )
    language: Optional[str] = Field(None, description='Language of the movie')
    screen: Optional[str] = Field(None, description='Screen number or details')
    booking_ref: Optional[str] = Field(
        None, description='Booking reference or ticket ID'
    )
    certificate: Optional[str] = Field(None, description='Movie certificate details')

    model_config = ConfigDict(extra='forbid', frozen=True)

    @field_validator('timezone_abbrv', mode='after')
    @classmethod
    def check_abbrv(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return v if v in _VALID_ABBR else None
