from typing import Literal

from pydantic import BaseModel, ConfigDict


class AccountDeletionRequest(BaseModel):
    """Requires an explicit `confirm: true` — DELETE requests commonly go
    out with no body at all (most HTTP clients default to one), so this
    exists purely to stop a bodyless/careless DELETE from being processed;
    the caller's bearer token is already the real authorization check."""

    confirm: Literal[True]

    model_config = ConfigDict(json_schema_extra={'example': {'confirm': True}})
