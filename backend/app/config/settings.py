#!/usr/bin/env python
# coding: utf-8

"""
Configuration settings for the application with validators
"""

__author__ = 'Shivcharan Thirunavukkarasu'
__date__ = 'Jul 2025'


import os
from typing import Annotated, Literal, Optional, Tuple, Type

from dotenv import find_dotenv
from pydantic import (
    Field,
    SecretStr,
    StringConstraints,
    field_validator,
)
from pydantic_settings import (
    BaseSettings,
    NoDecode,
    PydanticBaseSettingsSource,
    YamlConfigSettingsSource,
)


class Settings(BaseSettings):
    api_prefix: Annotated[
        str,
        Field(
            ...,
            description='API prefix for all endpoints(except root, health check and docs)',
            title='API Prefix',
        ),
    ]
    api_version: Annotated[
        str,
        Field(
            ...,
            description='API version of the application',
            title='API Version',
        ),
    ]
    allowed_origins: Annotated[
        tuple[str, ...],
        NoDecode,
        Field(
            ...,
            description='Allowed CORS origins',
        ),
    ]
    base_delay: Annotated[
        float,
        Field(
            ...,
            description='Base delay for retry attempts (seconds)',
            title='Base Delay',
        ),
    ]
    env: Annotated[
        str,
        Field(
            ...,
            description='Application environment; must be LOCAL, DEV, or PROD',
            title='Environment',
        ),
        StringConstraints(pattern=r'(?i)^(LOCAL|DEV|PROD)$', to_upper=True),
    ]
    loguru_format: Annotated[str, Field(description='Log message formatting pattern')]
    loguru_level: Annotated[
        Literal['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
        Field(description='Log verbosity level'),
    ]
    max_attempts: Annotated[
        int, Field(description='Maximum number of retry attempts for API calls', gt=0)
    ]
    max_file_size: Annotated[
        float, Field(description='Maximum single file upload size (MB)', gt=0, le=100)
    ]
    max_part_size: Annotated[
        float,
        Field(description='Max form part size before parser error (MB)', gt=0, le=100),
    ]
    rate_limit_enabled: Annotated[
        bool, Field(description='Enable rate limiting for API requests')
    ]
    rate_limit_per_minute: Annotated[
        int,
        Field(
            description='Maximum number of requests allowed per minute',
            gt=0,
            le=100,
        ),
    ]
    spool_max_size: Annotated[
        float, Field(description='In-memory spool threshold (MB)', gt=0, le=100)
    ]
    openrouter_api_key: Optional[SecretStr] = Field(
        ..., exclude=True, description='API key for OpenRouter'
    )
    supabase_jwt_secret: Optional[SecretStr] = Field(
        default=None,
        exclude=True,
        description='Legacy Supabase JWT secret used for HS256 token verification fallback',
    )
    supabase_service_role_key: Optional[SecretStr] = Field(
        default=None,
        exclude=True,
        description='Legacy Supabase service role key used for privileged backend RPC calls',
    )
    supabase_secret_key: Optional[SecretStr] = Field(
        default=None,
        exclude=True,
        description='Supabase secret key for privileged backend RPC calls',
    )
    supabase_url: Optional[str] = Field(
        default=None,
        description='Supabase project URL',
    )
    supabase_publishable_key: Optional[SecretStr] = Field(
        default=None,
        exclude=True,
        description='Supabase publishable/anon key used as the apikey header for '
        'PostgREST calls made with the user access token',
    )
    dev_bypass_auth: bool = Field(
        default=False,
        description='LOCAL/DEV only: skip JWT verification. Never set True in PROD.',
    )
    daily_free_limit: Annotated[
        int,
        Field(
            default=5,
            description='Maximum daily free extractions per user when using server key',
            gt=0,
            le=1000,
        ),
    ]
    default_free_model: Annotated[
        str,
        Field(
            default='qwen/qwen2.5-vl-72b-instruct:free',
            description='Default free OpenRouter model',
        ),
    ]
    free_models: Annotated[
        tuple[str, ...],
        NoDecode,
        Field(
            default=('qwen/qwen2.5-vl-72b-instruct:free',),
            description='Allowed shared-key free models',
        ),
    ]

    class Config:
        extra = 'ignore'
        env_coerce = True
        env_file = find_dotenv('.env')
        populate_by_name = True
        env_file_encoding = 'utf-8'
        env_nested_delimiter = '__'
        validate_assignment = True
        validate_default = True
        frozen = True
        yaml_file = 'config/config.yaml'
        str_strip_whitespace = True

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: Type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> Tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            dotenv_settings,
            env_settings,
            file_secret_settings,
            YamlConfigSettingsSource(settings_cls),
        )

    @field_validator('loguru_level', mode='before')
    @classmethod
    def validate_loguru_level(cls, value: str) -> str:
        if isinstance(value, str):
            return value.upper()
        return value

    @field_validator('allowed_origins', mode='before')
    @classmethod
    def validate_allowed_origins(cls, value: str | tuple[str, ...] | list[str]):
        if isinstance(value, str):
            return tuple(v.strip() for v in value.split(',') if v.strip())
        if isinstance(value, list):
            return tuple(v.strip() for v in value if v.strip())
        return value

    @field_validator('free_models', mode='before')
    @classmethod
    def validate_free_models(cls, value: str | tuple[str, ...] | list[str]):
        if isinstance(value, str):
            return tuple(v.strip() for v in value.split(',') if v.strip())
        if isinstance(value, list):
            return tuple(v.strip() for v in value if v.strip())
        return value


class DevelopmentSettings(Settings):
    loguru_level: Literal['DEBUG', 'INFO'] = 'DEBUG'  # type: ignore[reportIncompatibleVariableOverride]


class ProductionSettings(Settings):
    loguru_level: Literal['INFO', 'WARNING', 'ERROR', 'CRITICAL'] = 'INFO'  # type: ignore[reportIncompatibleVariableOverride]

    @field_validator('loguru_level', mode='before')
    @classmethod
    def ensure_prod_level(
        cls, v
    ) -> Literal['INFO'] | Literal['WARNING'] | Literal['ERROR'] | Literal['CRITICAL']:
        v_str = v.upper()
        if v_str not in ('INFO', 'WARNING', 'ERROR', 'CRITICAL'):
            return 'INFO'
        return v_str

    @field_validator('dev_bypass_auth', mode='after')
    @classmethod
    def reject_dev_bypass_auth(cls, v: bool) -> bool:
        # This used to be enforced by exactly one runtime check, in
        # auth/supabase_auth.py:get_current_user (settings.env in
        # ('LOCAL', 'DEV')) — which does work, but relying on a single
        # request-time check for something this sensitive is thin. Fail
        # loudly at startup instead: a misconfigured DEV_BYPASS_AUTH=true in
        # a PROD environment should crash immediately and obviously, not
        # silently do nothing and leave whoever set it assuming it's active.
        if v:
            raise ValueError(
                'DEV_BYPASS_AUTH must never be true when ENV=PROD. Remove it '
                'from the environment — refusing to start rather than silently '
                'ignoring a misconfiguration this sensitive.'
            )
        return v


def get_settings() -> Settings | DevelopmentSettings | ProductionSettings:
    config = dict(LOCAL=Settings, DEV=DevelopmentSettings, PROD=ProductionSettings)
    try:
        return config[
            os.getenv('ENV', 'LOCAL').upper()
        ]()  # pyright: ignore[reportCallIssue]
    except KeyError as e:
        raise ValueError(f'Invalid environment: {e}') from e
