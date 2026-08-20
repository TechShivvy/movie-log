"""Public-facing profile search. Anonymous reads (optionally identity-aware,
for block-filtering — see get_current_user_optional), authenticated
username/profile/privacy changes."""

from typing import Any, List, Optional

from auth.supabase_auth import AuthenticatedUser, get_current_user, get_current_user_optional
from config import settings
from fastapi import APIRouter, Depends, Query, Request, status
from llm.llm_client import check_api_key
from openai import OpenAIError
from rate_limit import limiter
from responses.public_profile import responses
from schemas.public_profile import (
    AccountPrivacyUpdate,
    AutoInsertPreferenceUpdate,
    LlmKey,
    LlmKeyInput,
    LlmKeyStorageOptInUpdate,
    LlmPreferenceUpdate,
    ProfileUpdate,
    PublicProfile,
    RevisitPrefillUpdate,
    UsernameUpdate,
)
from services import llm_keys, supabase_rest
from utils.errors import APIError
from utils.openai_utils import openai_error_to_http

router = APIRouter()

_DEFAULT_LIMIT = f'{settings.default_rate_limit_per_minute}/minute'


@router.get(
    '/users/search',
    response_model=List[PublicProfile],
    tags=['Public'],
    description='Search users by username or display name. Public — no sign-in '
    'required, and unrestricted by privacy state — a private/followers-only '
    'account still turns up here, same as a private Instagram account would; '
    "`account_visibility` on each result tells the client whether it's worth "
    'showing a lock indicator before the caller taps in. If a bearer token IS '
    'sent, results exclude anyone the caller has blocked or been blocked by, '
    'in either direction.',
    response_description='Matching profiles.',
    responses=responses['search_users'],
    operation_id='SearchPublicUsers',
)
@limiter.limit(_DEFAULT_LIMIT)
async def search_users(
    request: Request,
    q: str = Query(..., min_length=2),
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    return await supabase_rest.search_public_users(q, viewer_token=viewer_token)


@router.get(
    '/users/{username}',
    tags=['Public'],
    description='A user\'s public profile. Resolves by username alone, so a link '
    "someone was already given keeps working forever (as long as the username "
    "itself does) — unless the caller and this user have blocked each other "
    'in either direction, in which case this 404s exactly like the user does '
    "not exist, rather than confirming a block. Content depends on whether "
    'the caller can view it: `public` accounts show every entry set to '
    "`visibility: public` (never `anonymous` ones — those intentionally never "
    'appear here) to anyone; `followers_only` accounts show it only to '
    "accepted followers (send a bearer token to be recognized as one); "
    "`private` accounts show it to nobody but the owner. Otherwise `logs`/"
    '`favorites` are both empty — same "private account" behavior most '
    'social apps use, rather than 404ing. `favorites` is the owner\'s up-to-4 '
    'Letterboxd-style "Top 4" (see PUT /movie-logs/{id}/favorite), ordered '
    'by slot, gated by the same visibility rule as `logs` — never includes '
    'a `private` favorite regardless of who\'s asking, same as `logs`. '
    'Public — no sign-in required, but sending a token lets the response '
    "reflect the caller's own follow access.",
    response_description='The profile shell, plus public logs/favorites if the caller can view them.',
    responses=responses['public_profile'],
    operation_id='GetPublicProfile',
)
@limiter.limit(_DEFAULT_LIMIT)
async def public_profile(
    request: Request,
    username: str,
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    profile = await supabase_rest.get_public_profile(username, viewer_token=viewer_token)
    if not profile or profile['is_blocked']:
        # Same 404 either way — a block should never be distinguishable
        # from "this user doesn't exist" to the blocked/blocking party.
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'User not found.')
    logs = (
        await supabase_rest.list_public_logs_for_user(profile['user_id'], viewer_token=viewer_token)
        if profile['can_view_content']
        else []
    )
    # Same can_view_content gate as `logs` — a favorite is content like any
    # other, not a separate always-visible showcase tier this app doesn't
    # otherwise have. A `private` favorite already can't appear here
    # regardless (list_favorite_logs_for_user's view excludes private rows
    # entirely), this only controls whether the (public-eligible) favorites
    # are shown to *this* caller at all.
    favorites = (
        await supabase_rest.list_favorite_logs_for_user(profile['user_id'], viewer_token=viewer_token)
        if profile['can_view_content']
        else []
    )
    return {'profile': profile, 'logs': logs, 'favorites': favorites}


@router.patch(
    '/me/username',
    tags=['Public'],
    description='Set or change the caller\'s username (lowercase letters, digits, '
    'underscore only; must be unique). This is what shows up in search and at '
    'GET /users/{username} — both work as soon as a username is set.',
    response_description="The caller's updated settings row.",
    responses=responses['set_username'],
    operation_id='SetUsername',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_username(
    request: Request,
    payload: UsernameUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    try:
        return await supabase_rest.update_username(
            current_user.access_token, current_user.user_id, payload.username
        )
    except APIError as e:
        if e.status_code == 400:
            # PostgREST surfaces the unique-index violation as a generic 4xx;
            # give the caller a clearer, stable error code to key off of.
            raise APIError(
                status.HTTP_409_CONFLICT,
                'USERNAME_TAKEN',
                'That username is already taken.',
            )
        raise


@router.patch(
    '/me/privacy',
    tags=['Public'],
    description='Set who can see the caller\'s content on GET /users/{username} '
    "and in followers' feeds — `public`, `followers_only`, or `private` (default). "
    'See `AccountPrivacyUpdate` for exactly what each tier means. Doesn\'t affect '
    "search: any tier can still turn up at GET /users/search, it just has nothing "
    'to show if someone opens it.',
    response_description="The caller's updated settings row.",
    responses=responses['set_privacy'],
    operation_id='SetAccountPrivacy',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_privacy(
    request: Request,
    payload: AccountPrivacyUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.update_account_privacy(
        current_user.access_token, current_user.user_id, payload.account_visibility
    )


@router.get(
    '/me/profile',
    response_model=PublicProfile,
    tags=['Public'],
    description="The caller's own profile shell — the same shape "
    'PATCH /me/profile accepts (plus `user_id`), read back rather than '
    "written. Unlike GET /users/{username}, this works before a username "
    'is ever set — a brand-new account with no `user_settings` row yet '
    "gets back defaults (nulls, `account_visibility: \"private\"`, empty "
    "`profile_links`), not a 404 — a missing row here is a bootstrap-time "
    'default, same convention GET /me/export\'s own `profile` field '
    'already follows, not an error state. This is what actually powers '
    'an edit-profile form — GET /me/export is a full account-data dump '
    '(every log + venue rating + note nested inline), the wrong shape '
    'and far too heavy to call just to populate one.',
    response_description="The caller's profile.",
    responses=responses['get_own_profile'],
    operation_id='GetOwnProfile',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_own_profile(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    own_settings = await supabase_rest.get_own_settings(
        current_user.access_token, current_user.user_id
    )
    return {**own_settings, 'user_id': current_user.user_id}


@router.patch(
    '/me/profile',
    tags=['Public'],
    description='Update the caller\'s display_name, bio, avatar_path, '
    'banner_path, and/or profile_links (up to 5) in one call — only fields '
    'actually sent are changed. avatar_path/banner_path are Supabase Storage '
    'paths in their own public buckets (avatar-images / banner-images; '
    'client uploads directly to Storage, this only stores the resulting '
    'path string, same pattern as ticket_image_path on movie logs) — both '
    "must be prefixed with the caller's own user_id, same rule ticket "
    'images already enforce.',
    response_description="The caller's updated settings row.",
    responses=responses['set_profile'],
    operation_id='UpdateProfile',
)
@limiter.limit(_DEFAULT_LIMIT)
async def update_profile(
    request: Request,
    payload: ProfileUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    patch = payload.model_dump(exclude_unset=True)
    if not patch:
        raise APIError(status.HTTP_400_BAD_REQUEST, 'EMPTY_UPDATE', 'No fields provided to update.')

    avatar_path = patch.get('avatar_path')
    if avatar_path and not avatar_path.startswith(f'{current_user.user_id}/'):
        raise APIError(
            status.HTTP_400_BAD_REQUEST,
            'INVALID_IMAGE_PATH',
            "avatar_path must be under the caller's own user_id prefix.",
        )
    banner_path = patch.get('banner_path')
    if banner_path and not banner_path.startswith(f'{current_user.user_id}/'):
        raise APIError(
            status.HTTP_400_BAD_REQUEST,
            'INVALID_IMAGE_PATH',
            "banner_path must be under the caller's own user_id prefix.",
        )
    return await supabase_rest.update_profile(
        current_user.access_token, current_user.user_id, patch
    )


@router.patch(
    '/me/revisit-prefill',
    tags=['Public'],
    description='Toggle what happens when the caller starts a new log at a theatre/ '
    "screen they've logged before. Off (default): the client should only suggest "
    "reusing the previous venue rating (tap to accept). On: the client may fill the "
    "new log's venue-rating fields from the most recent matching visit "
    'automatically. Purely a stored preference — GET /movie-logs?theatre_id=/'
    'screen_id=/movie= is what actually supplies the previous visit(s).',
    response_description="The caller's updated settings row.",
    responses=responses['set_revisit_prefill'],
    operation_id='SetRevisitPrefill',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_revisit_prefill(
    request: Request,
    payload: RevisitPrefillUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.update_revisit_prefill(
        current_user.access_token, current_user.user_id, payload.prefill_repeat_visit
    )


@router.patch(
    '/me/auto-insert-preference',
    tags=['Public'],
    description='Stored default for POST /movie-metadata/extract and /extract-from-link\'s '
    '`auto_insert` param. Off (default): extraction always returns metadata for review, '
    'nothing is saved automatically. On: an extract call that omits `auto_insert` skips '
    'review and inserts straight into movie_logs — an explicit `auto_insert` on that call '
    "still overrides this either way. Meant primarily for bot integrations (Discord/"
    "Telegram) with no UI to review/edit an extraction before saving.",
    response_description="The caller's updated settings row.",
    responses=responses['set_auto_insert_preference'],
    operation_id='SetAutoInsertPreference',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_auto_insert_preference(
    request: Request,
    payload: AutoInsertPreferenceUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.update_auto_insert_preference(
        current_user.access_token, current_user.user_id, payload.auto_insert_extractions
    )


@router.patch(
    '/me/llm-preference',
    tags=['Public'],
    description="The caller's preferred LLM provider/model for "
    'POST /movie-metadata/extract and /extract-from-link — `provider` is one of '
    '`openrouter` (default, has a backend-funded shared/free path), `openai`, or '
    '`gemini` (both bring-your-own-key only). **Actually used as a fallback '
    "server-side**, not just an echoed-back client hint: an extract call that "
    "omits `provider`/`model` uses whatever's stored here before falling back "
    'to a static default — an explicit value on that call still overrides it. '
    'This endpoint never stores an API key itself — see '
    'PUT /me/llm-keys/{provider} for that (separate, encrypted).',
    response_description="The caller's updated settings row.",
    responses=responses['set_llm_preference'],
    operation_id='SetLlmPreference',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_llm_preference(
    request: Request,
    payload: LlmPreferenceUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.update_llm_preference(
        current_user.access_token, current_user.user_id, payload.provider, payload.model
    )


@router.patch(
    '/me/llm-key-storage-preference',
    tags=['Public'],
    description='Whether the caller wants their own provider API keys stored '
    'server-side (encrypted — PUT /me/llm-keys/{provider}) at all, or kept '
    'local-only on their own device. Setting this `true` does not store '
    "anything by itself — storing a key is still its own separate PUT call, "
    'and this preference never blocks PUT/GET/DELETE /me/llm-keys/{provider} '
    'either way, so a local-only user can still explicitly PUT a key if they '
    'want to. Setting this `false`, however, deletes every key currently '
    "stored server-side for this user, across all providers — an explicit "
    '"stop storing this" has to mean the already-stored copy goes too, not '
    'just that future storage stops. Defaults to `false` (privacy-first).',
    response_description="The caller's updated settings row.",
    responses=responses['set_llm_key_storage_preference'],
    operation_id='SetLlmKeyStoragePreference',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_llm_key_storage_preference(
    request: Request,
    payload: LlmKeyStorageOptInUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    updated = await supabase_rest.update_llm_key_storage_opt_in(
        current_user.access_token, current_user.user_id, payload.store_on_server
    )
    if not payload.store_on_server:
        await llm_keys.delete_all_llm_keys(current_user.user_id)
    return updated


@router.get(
    '/me/llm-keys',
    response_model=List[LlmKey],
    tags=['Public'],
    description="The caller's own stored provider API keys — masked "
    '(`key_prefix` only, e.g. `sk-proj-`, never the real value or ciphertext). '
    'One entry per provider that has a key stored; providers with none stored '
    "simply don't appear. See PUT /me/llm-keys/{provider} to store one, "
    'POST /movie-metadata/extract for how a stored key gets used '
    '(request header still overrides it, see that endpoint).',
    response_description="The caller's stored keys, masked.",
    responses=responses['list_llm_keys'],
    operation_id='ListLlmKeys',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_llm_keys_route(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await llm_keys.list_llm_keys(current_user.user_id)


@router.put(
    '/me/llm-keys/{provider}',
    response_model=LlmKey,
    tags=['Public'],
    description="Store (or replace) the caller's own API key for one provider, "
    'encrypted at rest — never stored in plaintext, never echoed back after this '
    'call (the response is masked, same shape as GET). The key is validated live '
    'against the provider first (a free metadata call, no tokens spent — same '
    'check GET /movie-metadata/test-key uses) and rejected with `422` if invalid, '
    'so a garbage key is never stored only to fail on a real extract call later. '
    'Storing a key here means every surface using this account (web, app, a bot) '
    'can use it without re-entering it each time — POST /movie-metadata/extract '
    "still lets a request's own `X-LLM-API-Key` header override it for one call.",
    response_description='The stored key, masked.',
    responses=responses['put_llm_key'],
    operation_id='PutLlmKey',
)
@limiter.limit(_DEFAULT_LIMIT)
async def put_llm_key(
    request: Request,
    provider: str,
    payload: LlmKeyInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    if provider not in ('openrouter', 'openai', 'gemini'):
        raise APIError(
            status.HTTP_404_NOT_FOUND, 'NOT_FOUND',
            'Unknown provider — must be one of openrouter, openai, gemini.',
        )
    try:
        check_result = await check_api_key(provider, payload.api_key)
    except OpenAIError as exc:
        # A genuinely unexpected error (connection failure, 5xx) from the
        # live validation call — distinct from a cleanly-rejected key
        # (handled inside check_api_key itself, see its own docstring).
        raise openai_error_to_http(exc)
    if not check_result.get('valid'):
        raise APIError(
            status.HTTP_422_UNPROCESSABLE_ENTITY, 'INVALID_API_KEY',
            f'{provider} rejected this key — not stored.',
        )
    return await llm_keys.store_llm_key(current_user.user_id, provider, payload.api_key)


@router.delete(
    '/me/llm-keys/{provider}',
    status_code=status.HTTP_204_NO_CONTENT,
    tags=['Public'],
    description="Remove the caller's stored key for one provider. Not having one "
    'stored in the first place is a 404, not a no-op 204 — same "tell the caller '
    'clearly" reasoning as elsewhere in this API for a delete-what-does-not-exist.',
    response_description='No content — the key is gone.',
    responses=responses['delete_llm_key'],
    operation_id='DeleteLlmKey',
)
@limiter.limit(_DEFAULT_LIMIT)
async def delete_llm_key(
    request: Request,
    provider: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    deleted = await llm_keys.delete_llm_key(current_user.user_id, provider)
    if not deleted:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'No stored key for this provider.')