"""Reporting: flag a public/anonymous review, a discoverable profile, a
theatre, or a screen — plus admin triage (list, review, optionally remove
the reported content), gated by get_current_admin (a flat user_id allowlist,
see auth/supabase_auth.py). Triage reads/writes go through supabase_admin.py
(service-role key) since reports RLS is deliberately owner-only.
"""

from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from auth.supabase_auth import AuthenticatedUser, get_current_admin, get_current_user
from config import settings
from fastapi import APIRouter, Depends, Query, Request
from rate_limit import limiter
from responses.reports import responses
from schemas.reports import Report, ReportInput, ReportTriageUpdate
from services import supabase_admin, supabase_rest
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
    "`profile` (a user_id with a username set — the profile shell is visible "
    'at GET /users/{username} regardless of account_visibility, so a private '
    "account's profile is reportable too), `theatre` or `screen` (its id). "
    "One report per (caller, target) — reporting the same thing again "
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


@router.get(
    '/admin',
    response_model=list[Report],
    tags=['Reports'],
    description='Admin-only: list reports, newest first. Filter by `status` '
    "(defaults to `open` — the actual triage queue) and/or `target_type`.",
    response_description='Matching reports.',
    responses=responses['list_reports_admin'],
    operation_id='ListReportsAdmin',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_reports_admin(
    request: Request,
    report_status: Annotated[Optional[str], Query(alias='status')] = 'open',
    target_type: Annotated[Optional[str], Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    _admin: AuthenticatedUser = Depends(get_current_admin),
) -> Any:
    return await supabase_admin.list_reports(
        status_filter=report_status, target_type=target_type, limit=limit, offset=offset
    )


@router.patch(
    '/admin/{report_id}',
    response_model=Report,
    tags=['Reports'],
    description="Admin-only: mark a report `reviewed` or `dismissed`, stamping "
    "`reviewed_by`/`reviewed_at` as the calling admin. `remove_content: true` "
    "additionally deletes the reported movie log (target_type == 'movie_log' "
    'only, see ReportTriageUpdate) in the same call.',
    response_description='The updated report.',
    responses=responses['update_report_admin'],
    operation_id='UpdateReportAdmin',
)
@limiter.limit(_DEFAULT_LIMIT)
async def update_report_admin(
    request: Request,
    report_id: str,
    payload: ReportTriageUpdate,
    admin: AuthenticatedUser = Depends(get_current_admin),
) -> Any:
    patch = {
        'status': payload.status,
        'reviewed_by': admin.user_id,
        'reviewed_at': datetime.now(timezone.utc).isoformat(),
    }
    updated = await supabase_admin.update_report(report_id, patch)
    if updated is None:
        raise APIError(404, 'NOT_FOUND', 'Report not found.')

    if payload.remove_content and updated['target_type'] == 'movie_log':
        await supabase_admin.delete_movie_log_as_admin(updated['target_id'])

    return updated
