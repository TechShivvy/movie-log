"""Response shapes for POST/GET /movie-metadata/extract-batch — see
services/extraction_batches.py for the background execution model these
mirror (supabase/migrations/20260817000001_extraction_batches.sql for the
underlying table shape).
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from schemas.movie_metadata import MovieMetadataResult


class ExtractionBatchItem(BaseModel):
    id: str
    position: int
    filename: Optional[str] = None
    status: Literal['queued', 'completed', 'failed']
    result: Optional[MovieMetadataResult] = Field(
        default=None, description='Set iff status == "completed".',
    )
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    auto_insert_status: Optional[Literal['inserted', 'skipped_no_title', 'failed']] = Field(
        default=None, description='Set only when the batch was created with auto_insert=true.',
    )
    movie_log_id: Optional[str] = Field(default=None, description='Set iff auto_insert_status == "inserted".')

    model_config = ConfigDict(extra='ignore')


class ExtractionBatch(BaseModel):
    id: str
    status: Literal['processing', 'completed', 'failed'] = Field(
        description='"completed" means the batch finished processing, not that every '
        'item succeeded — see failed_items and each item\'s own status for that.',
    )
    provider: str
    model: str
    auto_fallback: bool
    auto_insert: bool
    total_items: int
    completed_items: int
    failed_items: int
    error_code: Optional[str] = Field(
        default=None, description='Set only if the whole batch failed outright (e.g. '
        '"STALLED" — see services/extraction_batches.py\'s staleness detector), '
        'distinct from a per-item failure.',
    )
    error_message: Optional[str] = None
    created_at: str
    finished_at: Optional[str] = None
    items: List[ExtractionBatchItem] = Field(default_factory=list)

    model_config = ConfigDict(extra='ignore')


class ExtractionBatchCreateResponse(BaseModel):
    id: str
    status: Literal['processing']
    total_items: int

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'id': '99999999-9999-9999-9999-999999999999',
                'status': 'processing',
                'total_items': 5,
            }
        }
    )
