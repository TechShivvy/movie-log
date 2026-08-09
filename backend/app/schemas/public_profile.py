from typing import Optional
from pydantic import BaseModel, Field


class UsernameUpdate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, pattern=r'^[a-z0-9_]+$')


class PublicProfile(BaseModel):
    user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    