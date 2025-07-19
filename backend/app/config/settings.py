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
    max_file_size: Annotated[
        float, Field(description='Maximum single file upload size (MB)', gt=0, le=100)
    ]
    max_part_size: Annotated[
        float,
        Field(description='Max form part size before parser error (MB)', gt=0, le=100),
    ]
    spool_max_size: Annotated[
        float, Field(description='In-memory spool threshold (MB)', gt=0, le=100)
    ]
    openrouter_api_key: Optional[SecretStr] = Field(
        ..., exclude=True, description='API key for OpenRouter'
    )

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


def get_settings() -> Settings | DevelopmentSettings | ProductionSettings:
    config = dict(LOCAL=Settings, DEV=DevelopmentSettings, PROD=ProductionSettings)
    try:
        return config[
            os.getenv('ENV', 'LOCAL').upper()
        ]()  # pyright: ignore[reportCallIssue]
    except KeyError as e:
        raise ValueError(f'Invalid environment: {e}') from e
