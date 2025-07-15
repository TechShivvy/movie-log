from pydantic import BaseModel, Field


class RootResponse(BaseModel):
    message: str = Field(
        ...,
        example='Welcome to the Movie Log API! Use the endpoints to extract movie metadata from ticket images.',
    )
    version: str = Field(..., example='v1.0.0')


class HealthResponse(BaseModel):
    message: str = Field(..., example='healthy')
