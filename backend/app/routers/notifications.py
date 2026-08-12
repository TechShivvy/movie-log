"""Follow/request notifications. Rows are only ever written by database
triggers (see supabase/migrations/20260813000003_notifications.sql) — this
router only reads and marks-read, both scoped to the caller's own rows via
RLS (their own token, no service-role calls needed here, unlike reports
triage). The table also has Supabase Realtime enabled, so a client can
subscribe directly instead of polling GET / — these REST endpoints remain
the source of truth/fallback either way.
"""

from typing import Annotated, Any

from auth.supabase_auth import AuthenticatedUser, get_current_user
from config import settings
from fastapi import APIRouter, Depends, Query, Request, status
from rate_limit import limiter
from responses.notifications import responses
from services import supabase_rest
from utils.errors import APIError

router = APIRouter()

_DEFAULT_LIMIT = f'{settings.default_rate_limit_per_minute}/minute'


@router.get(
    '',
    tags=['Notifications'],
    description="The caller's own notifications, newest first — "
    '`follow_request` (someone followers_only/private wants to follow you), '
    '`follow_accepted` (a pending request of yours was accepted), '
    '`new_follower` (someone followed you instantly, i.e. your account is '
    'public). `actor_id` is null if that user has since deleted their '
    'account — the notification itself is kept, not retroactively removed.',
    response_description="The caller's notifications.",
    responses=responses['list_notifications'],
    operation_id='ListNotifications',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_notifications(
    request: Request,
    unread_only: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.list_notifications(
        current_user.access_token, unread_only=unread_only, limit=limit, offset=offset
    )


@router.post(
    '/{notification_id}/read',
    tags=['Notifications'],
    description='Mark one of the caller\'s own notifications as read.',
    response_description='The updated notification.',
    responses=responses['mark_read'],
    operation_id='MarkNotificationRead',
)
@limiter.limit(_DEFAULT_LIMIT)
async def mark_read(
    request: Request,
    notification_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    updated = await supabase_rest.mark_notification_read(
        current_user.access_token, notification_id
    )
    if updated is None:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'Notification not found.')
    return updated


@router.post(
    '/read-all',
    tags=['Notifications'],
    description="Mark every one of the caller's unread notifications as read.",
    response_description='How many were marked read.',
    responses=responses['mark_all_read'],
    operation_id='MarkAllNotificationsRead',
)
@limiter.limit(_DEFAULT_LIMIT)
async def mark_all_read(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    count = await supabase_rest.mark_all_notifications_read(current_user.access_token)
    return {'marked_read': count}
