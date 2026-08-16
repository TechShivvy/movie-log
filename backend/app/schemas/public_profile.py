from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator
from schemas._validators import validate_storage_path

AccountVisibility = Literal['public', 'followers_only', 'private']


class UsernameUpdate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, pattern=r'^[a-z0-9_]+$')

    model_config = ConfigDict(json_schema_extra={'example': {'username': 'shivco_2141'}})


class AccountPrivacyUpdate(BaseModel):
    """Who can see this account's content on `GET /public/users/{username}`
    and in followers' feeds. Doesn't affect search (`GET /public/users/search`)
    — any tier still turns up there (unless blocked), same as a private
    Instagram account does; this only gates content once someone opens the
    profile. `public` (open to everyone) and `followers_only` (accepted
    followers + owner) both accept follows instantly or on request
    respectively — see `routers/follows.py`. `private` (default — nobody but
    the owner, ever, not even accepted followers) still accepts follow
    requests; they just don't unlock anything on their own, so a standing
    request quietly starts working the moment the account switches to
    `followers_only`/`public` instead of needing to be re-sent."""

    account_visibility: AccountVisibility

    model_config = ConfigDict(
        json_schema_extra={'example': {'account_visibility': 'followers_only'}}
    )


class ProfileLink(BaseModel):
    """One entry of the up-to-5 optional links shown on a profile, e.g. a
    Letterboxd/Instagram/personal-site link — same idea as Instagram's
    link-in-bio, just labeled rather than a single bare URL."""

    label: str = Field(..., min_length=1, max_length=50)
    url: str = Field(..., min_length=1, max_length=500)

    model_config = ConfigDict(
        json_schema_extra={'example': {'label': 'Letterboxd', 'url': 'https://letterboxd.com/shivco'}}
    )

    @field_validator('url')
    @classmethod
    def _check_url(cls, v: str) -> str:
        v = v.strip()
        if not (v.startswith('http://') or v.startswith('https://')):
            raise ValueError('url must start with http:// or https://')
        return v


class ProfileUpdate(BaseModel):
    """Partial update — only fields actually sent are changed (same
    exclude-unset convention as `MovieLogUpdate`). Bundled into one endpoint
    rather than one-per-field like `username`/`privacy`/`revisit-prefill`,
    since these four naturally belong to a single "edit profile" screen
    action; `username` (uniqueness) and `account_visibility` (its own
    semantics, see `AccountPrivacyUpdate`) still get their own endpoints."""

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'display_name': 'Shivcharan',
                'bio': 'Telugu/Tamil cinema, always front row.',
                'avatar_path': None,
                'profile_links': [
                    {'label': 'Letterboxd', 'url': 'https://letterboxd.com/shivco'}
                ],
            }
        }
    )

    display_name: Optional[str] = Field(default=None, max_length=100)
    bio: Optional[str] = Field(default=None, max_length=500)
    avatar_path: Optional[str] = Field(
        default=None, max_length=512,
        description='Storage path in the avatar-images bucket, e.g. '
        '"{user_id}/avatar.jpg" — client uploads directly to Supabase '
        'Storage, this only stores the resulting path. null clears it.',
    )
    profile_links: Optional[List[ProfileLink]] = Field(default=None, max_length=5)

    @field_validator('display_name', 'bio', mode='before')
    @classmethod
    def _blank_to_none(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str) and v.strip() == '':
            return None
        return v

    @field_validator('avatar_path')
    @classmethod
    def _check_avatar_path(cls, v: Optional[str]) -> Optional[str]:
        return validate_storage_path(v)


class LlmKeyInput(BaseModel):
    """Stores the caller's own API key for one provider, encrypted at
    rest — see utils/crypto.py, services/llm_keys.py. Validated live
    against the provider before being stored (rejects a garbage key up
    front rather than storing something that only fails on the next real
    extract call). Never echoed back — GET /public/me/llm-keys returns
    only a masked prefix, never this value again."""

    api_key: str = Field(..., min_length=1, max_length=500)

    model_config = ConfigDict(json_schema_extra={'example': {'api_key': 'sk-...'}})


class LlmKey(BaseModel):
    provider: Literal['openrouter', 'openai', 'gemini']
    key_prefix: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'provider': 'gemini',
                'key_prefix': 'AIzaSyBx',
                'created_at': '2026-08-16T06:00:00+00:00',
                'updated_at': '2026-08-16T06:00:00+00:00',
            }
        }
    )


class LlmKeyStorageOptInUpdate(BaseModel):
    """Whether the caller wants their provider API keys stored server-
    side (encrypted, PUT /me/llm-keys/{provider}) at all, or kept local-
    only on their own device — both already work mechanically regardless
    of this setting; it's purely a *remembered* signal for the frontend
    to decide whether to default to "save this key" UI or treat every
    key as session-only, so the user isn't re-prompted every session.
    Defaults to false (privacy-first) — setting this true doesn't store
    anything by itself, it's still a separate PUT call per key."""

    store_on_server: bool

    model_config = ConfigDict(json_schema_extra={'example': {'store_on_server': True}})


class LlmPreferenceUpdate(BaseModel):
    """Stored fallback for POST /movie-metadata/extract's `provider`/
    `model` fields — unlike RevisitPrefillUpdate below, this one *is*
    read server-side: an extract call that omits `provider`/`model` uses
    whichever is stored here before falling back to a static default. An
    explicit value on that call still overrides it. Storing a preference
    here doesn't store an API key — see PUT /me/llm-keys/{provider}
    (separate, encrypted) for that."""

    provider: Literal['openrouter', 'openai', 'gemini']
    model: str = Field(..., min_length=1, max_length=200)

    model_config = ConfigDict(
        json_schema_extra={'example': {'provider': 'gemini', 'model': 'gemini-flash-latest'}}
    )


class RevisitPrefillUpdate(BaseModel):
    """Controls what happens when the caller starts a new log at a theatre/
    screen (or for a movie) they've logged before. Off (default): the client
    should only *suggest* reusing the previous venue rating, tap to accept.
    On: the client may fill the new log's venue-rating fields from the most
    recent matching visit automatically. Either way this is a client-side
    behavior toggle only — GET /movie-logs?theatre_id=/screen_id=/movie= is
    what actually supplies the previous visit(s) to prefill from."""

    prefill_repeat_visit: bool

    model_config = ConfigDict(json_schema_extra={'example': {'prefill_repeat_visit': True}})


class PublicProfile(BaseModel):
    user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    account_visibility: AccountVisibility = 'private'
    avatar_path: Optional[str] = None
    profile_links: List[ProfileLink] = Field(default_factory=list)
