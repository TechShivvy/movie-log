from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

NotificationType = Literal['follow_request', 'follow_accepted', 'new_follower']


class Notification(BaseModel):
    id: str
    recipient_id: str
    actor_id: Optional[str] = None
    type: NotificationType
    read: bool
    created_at: str

    model_config = ConfigDict(
        extra='ignore',
        json_schema_extra={
            'example': {
                'id': '77777777-7777-7777-7777-777777777777',
                'recipient_id': '11111111-1111-1111-1111-111111111111',
                'actor_id': '22222222-2222-2222-2222-222222222222',
                'type': 'new_follower',
                'read': False,
                'created_at': '2026-08-13T04:00:00+00:00',
            }
        },
    )


class MarkAllReadResult(BaseModel):
    marked_read: int

    model_config = ConfigDict(json_schema_extra={'example': {'marked_read': 3}})
