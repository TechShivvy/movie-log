import re
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

_MONTHS: dict[str, int] = {
    'jan': 1,
    'january': 1,
    'feb': 2,
    'february': 2,
    'mar': 3,
    'march': 3,
    'apr': 4,
    'april': 4,
    'may': 5,
    'jun': 6,
    'june': 6,
    'jul': 7,
    'july': 7,
    'aug': 8,
    'august': 8,
    'sep': 9,
    'sept': 9,
    'september': 9,
    'oct': 10,
    'october': 10,
    'nov': 11,
    'november': 11,
    'dec': 12,
    'december': 12,
}


def _to_iso_date(year: int, month: int, day: int) -> str:
    return datetime(year, month, day).strftime('%Y-%m-%d')


def _normalize_date(value: str) -> str:
    raw = value.strip()
    if not raw:
        raise ValueError('empty date')

    raw = re.sub(
        r'(?i)\b(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)\b',
        ' ',
        raw,
    )
    raw = re.sub(r'\s+', ' ', raw).strip()

    current_year = datetime.now().year

    # Already ISO.
    m = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2})', raw)
    if m:
        return _to_iso_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))

    # Numeric with separators: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY/MM/DD.
    m = re.fullmatch(r'(\d{1,4})[\-\/.](\d{1,2})[\-\/.](\d{1,4})', raw)
    if m:
        a, b, c = int(m.group(1)), int(m.group(2)), int(m.group(3))

        # YYYY/MM/DD style.
        if a >= 1900 and a <= 2200:
            return _to_iso_date(a, b, c)

        # DD/MM/YYYY style (day-first default).
        if c >= 1900 and c <= 2200:
            return _to_iso_date(c, b, a)

    # Missing year numeric: DD/MM or DD-MM or DD.MM.
    m = re.fullmatch(r'(\d{1,2})[\-\/.](\d{1,2})', raw)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        return _to_iso_date(current_year, month, day)

    # DD MMM [YYYY]
    m = re.fullmatch(r'(\d{1,2})\s+([A-Za-z]+)\s*(\d{4})?', raw)
    if m:
        day = int(m.group(1))
        month_text = m.group(2).lower()
        year = int(m.group(3)) if m.group(3) else current_year
        month = _MONTHS.get(month_text)
        if month is None:
            raise ValueError('unsupported month name')
        return _to_iso_date(year, month, day)

    # MMM DD [YYYY]
    m = re.fullmatch(r'([A-Za-z]+)\s+(\d{1,2})\s*(\d{4})?', raw)
    if m:
        month_text = m.group(1).lower()
        day = int(m.group(2))
        year = int(m.group(3)) if m.group(3) else current_year
        month = _MONTHS.get(month_text)
        if month is None:
            raise ValueError('unsupported month name')
        return _to_iso_date(year, month, day)

    raise ValueError(f'unsupported date format: {value}')


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

    @field_validator('date', mode='before')
    @classmethod
    def normalize_date(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if not isinstance(v, str):
            return v
        return _normalize_date(v)
