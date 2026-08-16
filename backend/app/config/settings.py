#!/usr/bin/env python
# coding: utf-8

"""
Configuration settings for the application with validators
"""

__author__ = 'Shivcharan Thirunavukkarasu'
__date__ = 'Jul 2025'


import os
import warnings
from typing import Annotated, Literal, Optional, Tuple, Type

from cryptography.fernet import Fernet
from dotenv import find_dotenv
from pydantic import (
    Field,
    SecretStr,
    StringConstraints,
    field_validator,
    model_validator,
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
            description='Maximum number of requests allowed per minute for '
            'movie-metadata/extract specifically (LLM-cost-sensitive, kept low)',
            gt=0,
            le=100,
        ),
    ]
    default_rate_limit_per_minute: Annotated[
        int,
        Field(
            default=60,
            description='Blanket per-minute limit applied to every route that '
            "doesn't set its own via @limiter.limit(...) — see rate_limit.py. "
            'Keyed by user id when authenticated, IP address otherwise (see '
            '_user_aware_rate_limit_key), so this caps both a single abusive '
            'account and an anonymous caller hitting the public endpoints '
            '(theatre/screen stats, user search, public profiles) with no '
            'account at all.',
            gt=0,
            le=1000,
        ),
    ]
    spool_max_size: Annotated[
        float, Field(description='In-memory spool threshold (MB)', gt=0, le=100)
    ]
    max_json_body_size: Annotated[
        float,
        Field(
            default=8,
            description='Max JSON request body size (MB) for non-multipart '
            'endpoints — enforced by middlewares/middleware.py:MaxBodySizeMiddleware '
            'as bytes actually arrive, not just via Content-Length (which a client '
            'can omit or lie about). Multipart uploads use max_part_size/'
            'spool_max_size instead and are exempt. 8MB comfortably covers the '
            'largest legitimate payload (a 500-item POST /movie-logs/import) '
            'while still capping the memory a single request can force the '
            'server to buffer before per-field validation ever runs.',
            gt=0,
            le=100,
        ),
    ]
    openrouter_api_key: Optional[SecretStr] = Field(
        ..., exclude=True, description='API key for OpenRouter'
    )
    google_places_api_key: Optional[SecretStr] = Field(
        default=None,
        exclude=True,
        description='API key for Google Places API (New) — backs theatre '
        'autocomplete/details (routers/venues.py). Optional: theatre creation '
        'still works without it, just falls back to free-typed data with '
        "source='user_submitted' instead of a Places-backed lookup.",
    )
    llm_key_encryption_key: Optional[SecretStr] = Field(
        default=None,
        exclude=True,
        description='Fernet key (cryptography.fernet.Fernet.generate_key()) encrypting '
        "users' own stored OpenAI/Gemini/OpenRouter API keys at rest "
        '(services/llm_keys.py, utils/crypto.py) — the *primary* key: new writes are '
        'always encrypted under this one. LOCAL: optional — auto-generated (ephemeral, '
        'regenerated every restart) if left unset, so a fresh clone works without a '
        'manual key-generation step. DEV/PROD: required — refuses to start if unset '
        '(see require_llm_key_encryption_key below), since an ephemeral key in a real '
        "deployment would silently break every already-stored user's key on the next "
        'restart. To rotate: generate a new key, set it here as the new primary, move '
        'the old value into llm_key_encryption_key_previous (comma-separated if '
        'rotating more than once before a full re-encryption) so already-stored keys '
        'still decrypt, then run backend/scripts/rotate_llm_key_encryption.py to '
        're-encrypt every stored key under the new primary — once that completes, the '
        'old key can be dropped from llm_key_encryption_key_previous entirely.',
    )
    llm_key_encryption_key_previous: Annotated[
        tuple[str, ...],
        NoDecode,
        Field(
            default=(),
            description='Comma-separated older Fernet keys, most-recently-retired '
            'first — used only for *decrypting* keys stored before the last rotation '
            '(utils/crypto.py builds a cryptography.fernet.MultiFernet from '
            '[primary, *these], which tries each in order). Never used to encrypt '
            'anything new. Empty once every stored key has been re-encrypted under '
            'the current primary (see rotate_llm_key_encryption.py) — keeping a '
            'retired key here indefinitely defeats the point of rotating away from it.',
        ),
    ]
    tmdb_api_key: Optional[SecretStr] = Field(
        default=None,
        exclude=True,
        description='TMDB (themoviedb.org) API Read Access Token (v4 auth, a JWT — '
        'sent as Authorization: Bearer) — backs movie search/autocomplete and '
        'upcoming-releases (services/tmdb.py, routers/movies.py). NOT the same as '
        'TMDB\'s separate "API Key" (v3 auth, a short hex string), which requires '
        'a ?api_key= query param instead and will not work here. Optional, same '
        'pattern as google_places_api_key: a movie log still works with just a '
        'free-typed movie title without this, movie_id/catalog features are '
        'unavailable until it is set.',
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
    admin_user_ids: Annotated[
        tuple[str, ...],
        NoDecode,
        Field(
            default=(),
            description='Supabase user_ids (comma-separated) allowed through '
            'get_current_admin (auth/supabase_auth.py) — a flat allowlist, not a '
            'role/RBAC system, matching this being a solo-owner project so far. '
            'Empty by default: every admin-only route 403s for everyone until this '
            'is set.',
        ),
    ]
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
    max_batch_size: Annotated[
        int,
        Field(
            default=20,
            description='Max ticket images accepted per POST /movie-metadata/extract-batch '
            'call — an operational/product cap (tunable without a code deploy), not a '
            "provider limit. Comfortably fits typical mobile multi-select behavior; a "
            'caller with more just submits a second batch.',
            gt=0,
            le=200,
        ),
    ]
    batch_create_rate_limit_per_minute: Annotated[
        int,
        Field(
            default=3,
            description='Per-minute limit on *creating* a batch (services/rate_limit.py) — '
            'deliberately tighter than rate_limit_per_minute (the single /extract limit): '
            'one batch call can enqueue up to max_batch_size background LLM calls, so the '
            'creation action itself needs its own, separately-reasoned cap even though it '
            "is structurally one request.",
            gt=0,
            le=60,
        ),
    ]
    batch_stale_after_minutes: Annotated[
        int,
        Field(
            default=10,
            description='If a batch is still `processing` and no item has updated in this '
            'many minutes, GET /movie-metadata/extract-batch/{id} flips it to `failed` '
            '(error_code=STALLED) instead of leaving the caller polling forever. Covers '
            'the case where the worker process that was running it died/restarted '
            '(deploy, crash) mid-batch — this bounds the damage to a client-visible '
            'failure, it does not recover the lost work.',
            gt=0,
            le=180,
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

    @field_validator('admin_user_ids', mode='before')
    @classmethod
    def validate_admin_user_ids(cls, value: str | tuple[str, ...] | list[str]):
        if isinstance(value, str):
            return tuple(v.strip() for v in value.split(',') if v.strip())
        if isinstance(value, list):
            return tuple(v.strip() for v in value if v.strip())
        return value

    @field_validator('llm_key_encryption_key_previous', mode='before')
    @classmethod
    def validate_llm_key_encryption_key_previous(cls, value: str | tuple[str, ...] | list[str]):
        if isinstance(value, str):
            return tuple(v.strip() for v in value.split(',') if v.strip())
        if isinstance(value, list):
            return tuple(v.strip() for v in value if v.strip())
        return value

    @field_validator(
        'openrouter_api_key',
        'google_places_api_key',
        'tmdb_api_key',
        'supabase_jwt_secret',
        'supabase_service_role_key',
        'supabase_secret_key',
        'supabase_publishable_key',
        'supabase_url',
        'llm_key_encryption_key',
        mode='before',
    )
    @classmethod
    def blank_optional_secret_as_none(cls, value):
        """A field left blank in a dashboard (Render env vars, Docker Compose,
        etc.) arrives as an empty string, not as "unset" — env vars have no
        concept of null. Without this, `if settings.openrouter_api_key:`
        style checks (resolve_shared_api_key, google_places.is_configured,
        extraction_cache._server_key, ...) would treat "" as configured and
        pass an empty string on to OpenRouter/Supabase, turning a simple
        blank-field mistake into a confusing upstream 401 instead of this
        app's own clear "not configured" error.
        """
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator('supabase_url', mode='after')
    @classmethod
    def validate_supabase_url(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.startswith(('http://', 'https://')):
            raise ValueError(
                f'supabase_url must start with http:// or https:// (got {value!r}) — '
                'check for a typo or a stray value if this came from a deploy env var.'
            )
        return value

    @model_validator(mode='after')
    def auto_generate_local_encryption_key(self) -> 'Settings':
        # type(self) is Settings, not isinstance — this must NOT fire for
        # DevelopmentSettings/ProductionSettings instances, which instead
        # carry their own require_llm_key_encryption_key field validator
        # below rejecting a missing key outright. A LOCAL clone shouldn't
        # need a manual `python -c "Fernet.generate_key()"` step just to
        # exercise the stored-API-key feature, but DEV/PROD auto-
        # generating one would be actively dangerous: it's ephemeral
        # (regenerated every process restart), so every already-stored
        # provider key would silently become undecipherable the moment a
        # real deployment restarted — exactly the "quietly corrupts real
        # user data" failure mode this project's other ENV-gated
        # convenience toggles (DEV_BYPASS_AUTH) already refuse to allow
        # outside LOCAL.
        if type(self) is Settings and self.llm_key_encryption_key is None:
            generated = Fernet.generate_key().decode('utf-8')
            object.__setattr__(self, 'llm_key_encryption_key', SecretStr(generated))
            warnings.warn(
                'LLM_KEY_ENCRYPTION_KEY not set — auto-generated an ephemeral one for '
                'this LOCAL run only. Any provider keys stored under it will fail to '
                'decrypt after a restart. Set LLM_KEY_ENCRYPTION_KEY explicitly once '
                'you need stored keys to persist across restarts.',
                stacklevel=2,
            )
        return self


def _require_llm_key_encryption_key(v: Optional[SecretStr]) -> Optional[SecretStr]:
    if v is None:
        raise ValueError(
            'LLM_KEY_ENCRYPTION_KEY must be set explicitly outside LOCAL. Generate '
            'one with: python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())" — LOCAL\'s auto-generated-if-'
            'unset convenience is deliberately not available here, since an ephemeral '
            'key would silently break every already-stored provider key on restart.'
        )
    return v


class DevelopmentSettings(Settings):
    loguru_level: Literal['DEBUG', 'INFO'] = 'DEBUG'  # type: ignore[reportIncompatibleVariableOverride]

    @field_validator('llm_key_encryption_key', mode='after')
    @classmethod
    def require_llm_key_encryption_key(cls, v: Optional[SecretStr]) -> Optional[SecretStr]:
        return _require_llm_key_encryption_key(v)


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

    @field_validator('llm_key_encryption_key', mode='after')
    @classmethod
    def require_llm_key_encryption_key(cls, v: Optional[SecretStr]) -> Optional[SecretStr]:
        return _require_llm_key_encryption_key(v)


def get_settings() -> Settings | DevelopmentSettings | ProductionSettings:
    config = dict(LOCAL=Settings, DEV=DevelopmentSettings, PROD=ProductionSettings)
    try:
        return config[
            os.getenv('ENV', 'LOCAL').upper()
        ]()  # pyright: ignore[reportCallIssue]
    except KeyError as e:
        raise ValueError(f'Invalid environment: {e}') from e
