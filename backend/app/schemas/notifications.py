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
    # Resolved from actor_id via notifications_view — there's no endpoint
    # to look a user up by id, so these are the only way a client can
    # render who a notification is from. Both null if the actor has since
    # deleted their account, and always null for report_resolved (no
    # actor at all — see the router description).
    actor_username: Optional[str] = None
    actor_avatar_path: Optional[str] = None
    type: NotificationType
    # At most one of these three is set, depending on `type` — null for
    # the three follow-related types, which need no deep-link target
    # beyond the actor's own profile.
    movie_log_id: Optional[str] = None
    comment_id: Optional[str] = None
    report_id: Optional[str] = None
    # Content preview, resolved the same way — null unless the matching
    # id above is set. `movie` is the log's title; `comment_preview` is
    # the comment's current text verbatim, not truncated server-side
    # (also null if the comment has since been soft-deleted — same shape
    # GET /comments already uses for that); `report_status` is the filed
    # report's current status (`reviewed`/`dismissed`).
    movie: Optional[str] = None
    comment_preview: Optional[str] = None
    report_status: Optional[str] = None
    read: bool
    created_at: str

    model_config = ConfigDict(
        extra='ignore',
        json_schema_extra={
            'example': {
                'id': '77777777-7777-7777-7777-777777777777',
                'recipient_id': '11111111-1111-1111-1111-111111111111',
                'actor_id': '22222222-2222-2222-2222-222222222222',
                'actor_username': 'alex',
                'actor_avatar_path': None,
                'type': 'new_comment',
                'movie_log_id': '33333333-3333-3333-3333-333333333333',
                'comment_id': '44444444-4444-4444-4444-444444444444',
                'report_id': None,
                'movie': 'Nexus',
                'comment_preview': 'Loved this one!',
                'report_status': None,
                'read': False,
                'created_at': '2026-08-13T04:00:00+00:00',
            }
        },
    )


class MarkAllReadResult(BaseModel):
    marked_read: int

    model_config = ConfigDict(json_schema_extra={'example': {'marked_read': 3}})
