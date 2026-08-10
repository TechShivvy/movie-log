from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class UsernameUpdate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, pattern=r'^[a-z0-9_]+$')

    model_config = ConfigDict(json_schema_extra={'example': {'username': 'shivco_2141'}})


class DiscoverabilityUpdate(BaseModel):
    """Whether this user's profile/username shows up in public search and the
    public profile page (`GET /public/users/{username}`)."""

    is_discoverable: bool

    model_config = ConfigDict(json_schema_extra={'example': {'is_discoverable': True}})


class RevisitPrefillUpdate(BaseModel):
    """Controls what happens when the caller starts a new log at a theatre/
    screen (or for a movie) they've logged before. Off (default): the client
    should only *suggest* reusing the previous venue rating, tap to accept.
    On: the client may fill the new log's venue-rating fields from the most
    recent matching visit automatically. Either way this is a client-side
    behavior toggle only — GET /movie-logs?theatre_id=/screen_id=/movie= is
    what actually supplies the previous visit(s) to prefill from."""

    prefill_repeat_visit: bool

    model_config = ConfigDict(json_schema_extra={'example': {'prefill_repeat_visit': True}})


class PublicProfile(BaseModel):
    user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
