"""Schemas for follow/block relationships and the follower/following/
follow-request lists (backend/app/routers/follows.py).

No request-body schema is needed for any endpoint here — every mutation
(follow, unfollow, accept, remove-follower, block, unblock) is fully
described by the path (`{username}`) plus the caller's own identity, so
there's nothing left for a client to submit.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class FollowRelationship(BaseModel):
    follower_id: str
    followee_id: str
    status: Literal['pending', 'accepted']
    created_at: str
    updated_at: str

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'follower_id': '11111111-1111-1111-1111-111111111111',
                'followee_id': '22222222-2222-2222-2222-222222222222',
                'status': 'pending',
                'created_at': '2026-08-11T03:30:16.719405+00:00',
                'updated_at': '2026-08-11T03:30:16.719405+00:00',
            }
        }
    )


class FollowUser(BaseModel):
    """One row of a followers/following list."""

    user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    avatar_path: Optional[str] = None
    followed_at: str


class FeedLogEntry(BaseModel):
    """One row of GET /public/feed — same narrow projection as the public
    profile's own log list (no booking_ref/seats/ticket_image_path/price/
    currency), plus the writer's own identity fields since a feed mixes
    entries from multiple accounts."""

    id: str
    user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    avatar_path: Optional[str] = None
    movie: Optional[str] = None
    watched_date: Optional[str] = None
    watched_time: Optional[str] = None
    timezone_abbrv: Optional[str] = None
    theater: Optional[str] = None
    theatre_id: Optional[str] = None
    language: Optional[str] = None
    screen: Optional[str] = None
    screen_id: Optional[str] = None
    format: Optional[str] = None
    certificate: Optional[str] = None
    notes: Optional[str] = None
    rating: Optional[float] = None
    created_at: str
