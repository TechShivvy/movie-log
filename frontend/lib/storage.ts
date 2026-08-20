// Supabase Storage public-URL construction — avatar_path/banner_path are
// bare storage paths (e.g. "{user_id}/1234.jpg"), same "we store the
// path, client builds the URL" shape as a TMDB poster_path (see
// lib/tmdb.ts). Both avatar-images and banner-images are PUBLIC buckets
// (supabase/migrations/20260811000011_profile_fields_and_avatar.sql and
// the mirrored banner migration), so this is a plain, unsigned
// object-storage URL — no backend round-trip needed to resolve it.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

function publicStorageUrl(bucket: string, path?: string | null): string | undefined {
  if (!path) return undefined;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export function avatarUrl(path?: string | null): string | undefined {
  return publicStorageUrl("avatar-images", path);
}

export function bannerUrl(path?: string | null): string | undefined {
  return publicStorageUrl("banner-images", path);
}
