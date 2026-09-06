"""Small validators shared across more than one schemas/*.py module.

Kept deliberately minimal — only things actually reused go here. Everything
else stays local to the schema file that needs it, matching how this
codebase already works (most validators are single-file-local).
"""

from typing import Optional


def validate_storage_path(value: Optional[str]) -> Optional[str]:
    """A relative Supabase Storage object path, not a URL or absolute path.

    Originally `movie_logs.py`'s `_validate_image_path` (for
    `ticket_image_path`); extracted here once `public_profile.py`'s
    `avatar_path` needed the identical rule — same storage-bucket upload
    pattern (client uploads directly to Supabase Storage, backend only
    ever sees/validates the resulting path string), just a different
    bucket.
    """
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if '..' in value or value.startswith('/') or '://' in value:
        raise ValueError('must be a relative storage path')
    return value
