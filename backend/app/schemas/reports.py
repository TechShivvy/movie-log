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
