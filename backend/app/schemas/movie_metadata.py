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

_CURRENCY_CODE = re.compile(r'^[A-Za-z]{3}$')
_PRICE_STRIP = re.compile(r'[^\d.]')

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


class TicketLinkRequest(BaseModel):
    url: str = Field(
        ...,
        description='A shared movie-ticket booking-confirmation link '
        '(BookMyShow, Fandango, PVR, District, ...). See '
        'services/ticket_link_extractor.py for the supported-site allowlist.',
        min_length=1,
        max_length=2048,
    )

    model_config = ConfigDict(extra='forbid')


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
    screen: Optional[str] = Field(
        None, description='Auditorium/screen identifier only (e.g. "Screen 3", '
        '"Audi 2", "Balcony") — not the presentation format, see `format`'
    )
    booking_ref: Optional[str] = Field(
        None, description='Booking reference or ticket ID'
    )
    certificate: Optional[str] = Field(None, description='Movie certificate details')
    format: Optional[str] = Field(
        None, description='Presentation format (2D, 3D, 4DX, IMAX, ScreenX, '
        'Dolby Atmos, ...) — separate from `screen`, since a ticket can print both'
    )
    price: Optional[float] = Field(
        None, description='Ticket price paid, as a plain amount — see `currency`'
    )
    currency: Optional[str] = Field(
        None, description='ISO 4217 currency code for `price` (e.g. "INR", "USD")'
    )

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

    @field_validator('currency', mode='after')
    @classmethod
    def check_currency(cls, v: Optional[str]) -> Optional[str]:
        # A malformed/unrecognizable currency guess is dropped (null),
        # same posture as timezone_abbrv above — better to omit a field
        # the model got wrong than block the whole extraction over it.
        if v is None:
            return None
        v = v.strip().upper()
        return v if _CURRENCY_CODE.match(v) else None

    @field_validator('price', mode='before')
    @classmethod
    def normalize_price(cls, v):
        # Defensive against the model leaving a currency symbol/thousands
        # separator in despite the prompt saying not to (e.g. "₹1,200.50")
        # — strip anything that isn't a digit or decimal point rather than
        # fail the whole extraction over one field's formatting.
        if v is None:
            return None
        if isinstance(v, str):
            cleaned = _PRICE_STRIP.sub('', v)
            if not cleaned:
                return None
            try:
                v = float(cleaned)
            except ValueError:
                return None
        if not isinstance(v, (int, float)) or v < 0:
            return None
        return v


class MovieMetadataResult(MovieMetadata):
    """The actual API response shape for POST /movie-metadata/extract and
    /extract-from-link — MovieMetadata itself plus backend-filled
    routing metadata. Deliberately a *separate* class from MovieMetadata
    rather than fields added directly onto it: MovieMetadata is also the
    `response_model` handed to the LLM as its structured-output target
    (llm/llm_client.py's _call_model) — a real bug caught live during
    testing was the model itself trying to fill in a plausible-looking
    guess for a field literally named `requested_model`/`used_model`
    once those existed on that shared schema, since it has no way to
    know it's meant to be routing metadata, not ticket content. Keeping
    them here means the LLM never sees these fields at all."""

    fallback_occurred: bool = Field(
        False, description='True if `auto_fallback: true` was set and the originally '
        "requested model wasn't usable (not found), so a different model actually "
        'served this extraction. Always false when `auto_fallback` was off — a '
        'request never silently changes models unless explicitly opted in.',
    )
    requested_model: Optional[str] = Field(
        None, description='The model that was actually requested — only set when '
        '`fallback_occurred` is true, null otherwise.',
    )
    used_model: Optional[str] = Field(
        None, description='The model that actually produced this result — only set '
        'when `fallback_occurred` is true (differs from `requested_model` in that '
        'case), null otherwise.',
    )

    model_config = ConfigDict(extra='forbid', frozen=True)
