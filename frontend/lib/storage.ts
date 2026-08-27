import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

// Supabase Storage public-URL construction — avatar_path/banner_path are
// bare storage paths (e.g. "{user_id}/1234.jpg"), same "we store the
// path, client builds the URL" shape as a TMDB poster_path (see
// lib/tmdb.ts). Both avatar-images and banner-images are PUBLIC buckets
// (supabase/migrations/20260811000011_profile_fields_and_avatar.sql and
// 20260820000001_banner_image.sql), so this is a plain, unsigned
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

// ── Upload ───────────────────────────────────────────────────────────────────
//
// Both avatar-images and banner-images require the uploaded object's path
// to start with "{user_id}/" (enforced both by the bucket's own RLS
// insert-policy and again server-side in PATCH /me/profile) — the backend
// never sees the file itself, only the resulting path string, so the
// client uploads directly to Supabase Storage with the user's own
// session. Filenames are timestamped so a re-upload gets a fresh path
// instead of silently colliding with a CDN/browser-cached copy of the
// old image at the same URL.

function extensionFor(mimeType?: string | null, fallbackName?: string | null): string {
  if (mimeType) {
    const fromMime = mimeType.split("/")[1];
    if (fromMime) return fromMime.split("+")[0]; // "image/svg+xml" -> "svg"
  }
  const fromName = fallbackName?.split(".").pop();
  return fromName || "jpg";
}

async function uploadToBucket(bucket: string, userId: string, blob: Blob, ext: string, contentType: string): Promise<string> {
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

/**
 * Opens the platform image picker, uploads the chosen image to the given
 * bucket under the caller's own user_id prefix, and returns the new
 * storage path (ready to hand to PATCH /me/profile as avatar_path/
 * banner_path) — or null if the user cancelled.
 */
export async function pickAndUploadImage(bucket: "avatar-images" | "banner-images", userId: string): Promise<string | null> {
  if (Platform.OS === "web") {
    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => resolve(input.files?.[0] ?? null);
      // No file picked at all (dialog dismissed) never fires onchange —
      // there's no reliable cross-browser cancel event for <input type=file>,
      // so this promise simply never resolves in that case, same as the
      // native branch's ImagePicker.canceled check resolves to null instead.
      input.click();
    });
    if (!file) return null;
    const ext = extensionFor(file.type, file.name);
    return uploadToBucket(bucket, userId, file, ext, file.type || "image/jpeg");
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Photo library permission was denied.");

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const ext = extensionFor(asset.mimeType, asset.fileName);
  return uploadToBucket(bucket, userId, blob, ext, asset.mimeType || "image/jpeg");
}
