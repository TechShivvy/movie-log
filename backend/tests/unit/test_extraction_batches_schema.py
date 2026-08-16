"""schemas/extraction_batches.py and schemas/public_profile.py's
AutoInsertPreferenceUpdate — pure validation, no network.
"""

import pytest
from pydantic import ValidationError
from schemas.extraction_batches import ExtractionBatch, ExtractionBatchCreateResponse, ExtractionBatchItem
from schemas.public_profile import AutoInsertPreferenceUpdate


class TestExtractionBatchCreateResponse:
    def test_valid_response(self):
        resp = ExtractionBatchCreateResponse(id='11111111-1111-1111-1111-111111111111', status='processing', total_items=3)
        assert resp.total_items == 3

    def test_rejects_a_non_processing_status(self):
        with pytest.raises(ValidationError):
            ExtractionBatchCreateResponse(id='x', status='completed', total_items=1)


class TestExtractionBatchItem:
    def test_queued_item_has_no_result_yet(self):
        item = ExtractionBatchItem(id='x', position=0, status='queued')
        assert item.result is None
        assert item.auto_insert_status is None

    def test_unknown_status_rejected(self):
        with pytest.raises(ValidationError):
            ExtractionBatchItem(id='x', position=0, status='running')


class TestExtractionBatch:
    def test_defaults_items_to_empty_list(self):
        batch = ExtractionBatch(
            id='x', status='processing', provider='openrouter', model='m',
            auto_fallback=False, auto_insert=False, total_items=3,
            completed_items=0, failed_items=0, created_at='2026-08-17T00:00:00Z',
        )
        assert batch.items == []


class TestAutoInsertPreferenceUpdate:
    def test_requires_a_real_boolean(self):
        with pytest.raises(ValidationError):
            AutoInsertPreferenceUpdate(auto_insert_extractions='yes please')

    def test_true_and_false_both_accepted(self):
        assert AutoInsertPreferenceUpdate(auto_insert_extractions=True).auto_insert_extractions is True
        assert AutoInsertPreferenceUpdate(auto_insert_extractions=False).auto_insert_extractions is False
