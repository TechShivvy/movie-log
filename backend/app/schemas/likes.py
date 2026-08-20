from typing import Optional

from pydantic import BaseModel, ConfigDict


class Liker(BaseModel):
    """One entry of GET .../likes (movie_logs and comments both use this
    shape) — enough to render a likers list client-side. Reads through
    movie_log_likes_view/comment_likes_view (schemas/likes.py's own
    migration), not movie_log_likes/comment_likes directly — those tables'
    own RLS only lets a caller read their own like rows, not list who else
    liked something."""

    user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    avatar_path: Optional[str] = None
    liked_at: str

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'user_id': '11111111-1111-1111-1111-111111111111',
                'username': 'shivco_2141',
                'display_name': 'Shivcharan',
                'avatar_path': '11111111-1111-1111-1111-111111111111/avatar.jpg',
                'liked_at': '2026-08-20T04:00:00+00:00',
            }
        }
    )
