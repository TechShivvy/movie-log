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


class PublicProfile(BaseModel):
    user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
