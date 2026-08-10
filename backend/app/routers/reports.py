"""Reporting: flag a public/anonymous review, a discoverable profile, a
theatre, or a screen. No admin surface exists yet — reports land in the
`reports` table for triage via the service role, same as every other
ad-hoc admin action taken against this project so far.
"""

from typing import Any

from auth.supabase_auth import AuthenticatedUser, get_current_user
from config import settings
from fastapi import APIRouter, Depends, Request
from rate_limit import limiter
from responses.reports import responses
from schemas.reports import Report, ReportInput
from services import supabase_rest
from utils.errors import APIError

router = APIRouter()

_DEFAULT_LIMIT = f'{settings.default_rate_limit_per_minute}/minute'


async def _target_is_reportable(target_type: str, target_id: str) -> bool:
    if target_type == 'movie_log':
        return await supabase_rest.is_movie_log_reportable(target_id)
    if target_type == 'profile':
        return await supabase_rest.is_profile_reportable(target_id)
    if target_type == 'theatre':
        return await supabase_rest.get_theatre(target_id) is not None
    if target_type == 'screen':
        return await supabase_rest.get_screen(target_id) is not None
    return False  # unreachable — target_type is a Literal, FastAPI 422s first


@router.post(
    '',
    response_model=Report,
    status_code=201,
    tags=['Reports'],
    description='Flag something for review. `target_type` decides what '
    "`target_id` means: `movie_log` (a `public`/`anonymous` review's id — "
    "`private` ones aren't reportable, nobody else can see them to report), "
    '`profile` (a discoverable user\'s user_id), `theatre` or `screen` (its '
    "id). One report per (caller, target) — reporting the same thing again "
    "overwrites the previous reason rather than creating a duplicate. "
    "There's no admin UI yet; this only makes misuse queryable instead of "
    'invisible.',
    response_description='The stored report.',
    responses=responses['create_report'],
    operation_id='CreateReport',
)
@limiter.limit(_DEFAULT_LIMIT)
async def create_report(
    request: Request,
    payload: ReportInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    if not await _target_is_reportable(payload.target_type, payload.target_id):
        raise APIError(
            404,
            'NOT_FOUND',
            'Nothing reportable found for this target_type/target_id.',
        )

    row = {
        'reporter_user_id': current_user.user_id,
        'target_type': payload.target_type,
        'target_id': payload.target_id,
        'reason': payload.reason,
    }
    return await supabase_rest.upsert_report(current_user.access_token, row)
