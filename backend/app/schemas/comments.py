from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class CommentInput(BaseModel):
    movie_log_id: str = Field(..., description='The log being commented on.')
    text: str = Field(..., min_length=1, max_length=2000)
    parent_comment_id: Optional[str] = Field(
        default=None,
        description='Reply to this comment instead of posting a new top-level '
        "one. Must itself be a top-level comment — replying to a reply is "
        'rejected, one level of nesting only.',
    )

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'movie_log_id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                'text': 'The IMAX presentation here is great.',
            }
        }
    )


class CommentUpdate(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)

    model_config = ConfigDict(
        json_schema_extra={'example': {'text': 'The IMAX presentation here is genuinely great.'}}
    )


class Comment(BaseModel):
    id: str
    movie_log_id: str
    user_id: Optional[str] = None
    username: Optional[str] = None
    parent_comment_id: Optional[str] = None
    text: Optional[str] = Field(
        default=None,
        description='null once removed (see deleted_at) — the row stays so '
        "replies underneath it don't orphan, only the text is cleared.",
    )
    like_count: int = 0
    liked_by_caller: Optional[bool] = Field(
        default=None,
        description='Whether the caller has liked this comment — null when not '
        'computed for this response path.',
    )
    edited_at: Optional[str] = None
    deleted_at: Optional[str] = None
    created_at: str
    updated_at: str
    replies: List['Comment'] = Field(
        default_factory=list,
        description='Only ever one level deep — a reply\'s own `replies` is '
        'always empty, replying to a reply is rejected server-side.',
    )

    model_config = ConfigDict(extra='ignore')
