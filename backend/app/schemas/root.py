from pydantic import BaseModel, ConfigDict, Field


class RootResponse(BaseModel):
    message: str = Field(...)
    version: str = Field(...)

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'message': 'Welcome to the Movie Log API! Use the endpoints to '
                'extract movie metadata from ticket images.',
                # Real value comes from settings.api_version (config.yaml) — this
                # is just an illustrative example, not necessarily today's version.
                'version': 'v1.1.9',
            }
        }
    )


class HealthResponse(BaseModel):
    message: str = Field(...)

    model_config = ConfigDict(json_schema_extra={'example': {'message': 'healthy'}})
