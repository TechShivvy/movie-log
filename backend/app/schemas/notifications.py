from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

NotificationType = Literal[
    'follow_request', 'follow_accepted', 'new_follower',
    'new_comment', 'comment_reply', 'log_like', 'comment_like', 'report_resolved',
]


class Notification(BaseModel):
    id: str
    recipient_id: str
    actor_id: Optional[str] = None
    type: NotificationType
    # At most one of these three is set, depending on `type` — null for
    # the three follow-related types, which need no deep-link target
    # beyond the actor's own profile.
    movie_log_id: Optional[str] = None
    comment_id: Optional[str] = None
    report_id: Optional[str] = None
    read: bool
    created_at: str

    model_config = ConfigDict(
        extra='ignore',
        json_schema_extra={
            'example': {
                'id': '77777777-7777-7777-7777-777777777777',
                'recipient_id': '11111111-1111-1111-1111-111111111111',
                'actor_id': '22222222-2222-2222-2222-222222222222',
                'type': 'new_comment',
                'movie_log_id': '33333333-3333-3333-3333-333333333333',
                'comment_id': '44444444-4444-4444-4444-444444444444',
                'report_id': None,
                'read': False,
                'created_at': '2026-08-13T04:00:00+00:00',
            }
        },
    )


class MarkAllReadResult(BaseModel):
    marked_read: int

    model_config = ConfigDict(json_schema_extra={'example': {'marked_read': 3}})
