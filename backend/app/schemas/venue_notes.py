from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


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
    note: str
    created_at: str
    updated_at: str

    model_config = ConfigDict(extra='ignore')
