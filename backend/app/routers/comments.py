"""Comments on movie logs, with one level of replies. Flat top-level resource
filtered by movie_log_id (same shape GET /movie-logs?theatre_id= already
uses), not nested under /movie-logs/{id}/comments — editing/deleting a
specific comment doesn't need to know which log it's on, so a flat
/comments/{id} avoids an awkward double prefix for those two.
"""

from typing import Annotated, Any, Optional

from auth.supabase_auth import AuthenticatedUser, get_current_user, get_current_user_optional
from config import settings
from fastapi import APIRouter, Depends, Query, Request, status
from loguru_setup import LOGGER
from rate_limit import limiter
from responses.comments import responses
from schemas.comments import Comment, CommentInput, CommentUpdate
from services import supabase_rest
from utils.errors import APIError

router = APIRouter()

_DEFAULT_LIMIT = f'{settings.default_rate_limit_per_minute}/minute'


@router.get(
    '',
    response_model=list[Comment],
    tags=['Comments'],
    description='Comments on a log, oldest first, with each top-level comment\'s '
    'replies (one level only) nested inline — no separate "load replies" call '
    'needed at this depth. Visible to anyone who can currently see the log '
    'itself (same visibility/archive rule as everywhere else); the log\'s own '
    "owner always sees comments on their own logs. Public — no sign-in "
    "required, but a token lets the log's own owner see comments on a "
    '`private` log of theirs.',
    response_description="The log's comments.",
    responses=responses['list_comments'],
    operation_id='ListComments',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_comments(
    request: Request,
    movie_log_id: Annotated[str, Query()],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    return await supabase_rest.list_comments(
        viewer_token, movie_log_id, limit=limit, offset=offset
    )


@router.post(
    '',
    response_model=Comment,
    status_code=status.HTTP_201_CREATED,
    tags=['Comments'],
    description="Comment on a log, or reply to one of its top-level comments "
    '(`parent_comment_id`) — replying to a reply is rejected, one level of '
    "nesting only. Requires the log to be currently `public`/`anonymous`-"
    "visible and not archived; a blocked pair can't comment on each other's "
    "`public` (attributed) logs — not checked for `anonymous` ones, where "
    "the real author is unreadable to the caller by design.",
    response_description='The created comment.',
    responses=responses['create_comment'],
    operation_id='CreateComment',
)
@limiter.limit(_DEFAULT_LIMIT)
async def create_comment(
    request: Request,
    payload: CommentInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    if not await supabase_rest.is_movie_log_reportable(payload.movie_log_id):
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'Movie log not found.')

    row = {
        'movie_log_id': payload.movie_log_id,
        'user_id': current_user.user_id,
        'text': payload.text,
        'parent_comment_id': payload.parent_comment_id,
    }
    try:
        return await supabase_rest.create_comment(current_user.access_token, row)
    except APIError as e:
        if e.status_code == 400:
            # RLS rejected it — either a blocked pair (public log) or
            # parent_comment_id points at a reply, not a top-level comment
            # (trigger-enforced). Can't distinguish the two from the
            # collapsed 400 _raise_for_upstream produces; both are real,
            # deliberate rejections, not upstream flakiness.
            raise APIError(
                status.HTTP_403_FORBIDDEN, 'COMMENT_NOT_ALLOWED',
                "Can't comment here — either you and this log's author have "
                "blocked each other, or parent_comment_id points at a reply "
                'rather than a top-level comment.',
            )
        raise


@router.patch(
    '/{comment_id}',
    response_model=Comment,
    tags=['Comments'],
    description="Edit one of the caller's own comments. Rejected once deleted "
    '(see DELETE below) — nothing to edit.',
    response_description='The updated comment.',
    responses=responses['update_comment'],
    operation_id='UpdateComment',
)
@limiter.limit(_DEFAULT_LIMIT)
async def update_comment(
    request: Request,
    comment_id: str,
    payload: CommentUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    updated = await supabase_rest.update_comment(
        current_user.access_token, current_user.user_id, comment_id, payload.text
    )
    if updated is None:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'Comment not found.')
    LOGGER.info('update_comment user={} id={}', current_user.user_id[:8], comment_id)
    return updated


@router.delete(
    '/{comment_id}',
    response_model=Comment,
    tags=['Comments'],
    description="Remove one of the caller's own comments — always clears the "
    'text and stamps `deleted_at`, never a real delete, regardless of whether '
    "it has replies: the row stays either way so replies underneath it never "
    'orphan. Returns the now-cleared comment rather than 204, so the caller '
    'can confirm the state without a follow-up GET.',
    response_description='The now-deleted comment.',
    responses=responses['delete_comment'],
    operation_id='DeleteComment',
)
@limiter.limit(_DEFAULT_LIMIT)
async def delete_comment(
    request: Request,
    comment_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    deleted = await supabase_rest.delete_comment(
        current_user.access_token, current_user.user_id, comment_id
    )
    if deleted is None:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'Comment not found.')
    LOGGER.info('delete_comment user={} id={}', current_user.user_id[:8], comment_id)
    return deleted