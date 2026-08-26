from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

TargetType = Literal['movie_log', 'profile', 'theatre', 'screen']


class ReportInput(BaseModel):
    target_type: TargetType = Field(
        ..., description='What kind of thing is being reported.'
    )
    target_id: str = Field(
        ..., description='id of the movie log / theatre / screen, or user_id for a profile.'
    )
    reason: str = Field(..., min_length=1, max_length=1000)

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'target_type': 'theatre',
                'target_id': '22222222-2222-2222-2222-222222222222',
                'reason': "This theatre closed down last year, shouldn't be listed anymore.",
            }
        }
    )


class ReportTriageUpdate(BaseModel):
    """Admin-only (see get_current_admin). `remove_content: true` additionally
    deletes the reported row when `target_type == 'movie_log'` — the common
    case; `theatre`/`screen`/`profile` removal isn't implemented, `remove_content`
    on one of those is accepted but has no effect beyond setting status."""

    status: Literal['reviewed', 'dismissed']
    remove_content: bool = False

    model_config = ConfigDict(
        json_schema_extra={'example': {'status': 'reviewed', 'remove_content': True}}
    )


class Report(BaseModel):
    id: str
    reporter_user_id: str
    target_type: TargetType
    target_id: str
    reason: str
    status: Literal['open', 'reviewed', 'dismissed']
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    created_at: str
    updated_at: str

    model_config = ConfigDict(extra='ignore')
