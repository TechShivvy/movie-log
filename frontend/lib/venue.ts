import type { Theatre, TheatreMatchCandidate } from "../types";

/**
 * The one place the nickname-vs-name display decision gets made — the
 * backend deliberately never coalesces these itself (schemas/venues.py's
 * Theatre.nickname doc: "this is returned raw, never coalesced into
 * `name` server-side"), so every surface that shows a theatre's name
 * needs to make this same call. A nickname is an alternate label, not a
 * correction — shown in place of the real name only when an admin has
 * actually set one.
 */
export function venueDisplayName(v: Pick<Theatre | TheatreMatchCandidate, "name" | "nickname">): string {
  return v.nickname || v.name;
}

/**
 * A Google Maps URL built client-side — nothing in the theatres table
 * stores one (there's no need to: place_id and lat/lng are already
 * enough to construct it on demand). Prefers real coordinates (works for
 * every theatre, source-agnostic); falls back to place_id for the rare
 * user_submitted row that predates having lat/lng at all.
 */
export function venueMapsUrl(v: Pick<Theatre, "lat" | "lng" | "place_id">): string | undefined {
  if (v.lat != null && v.lng != null) return `https://www.google.com/maps?q=${v.lat},${v.lng}`;
  if (v.place_id) return `https://www.google.com/maps/place/?q=place_id:${v.place_id}`;
  return undefined;
}

/** Same URL, with the `output=embed` param web's iframe needs — only ever
 * valid for the lat/lng form (Maps doesn't support embedding the
 * place_id query form), so this is undefined for the address-only
 * fallback case above. */
export function venueMapsEmbedUrl(v: Pick<Theatre, "lat" | "lng">): string | undefined {
  if (v.lat == null || v.lng == null) return undefined;
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return `https://www.google.com/maps?q=${lat},${lng}&output=embed`;
}

/**
 * Shared with SearchScreen (originally LogFormScreen-only) — both screens
 * offer the same explicit-tap Google Places fallback once the local
 * trigram match comes up short.
 */
export function placesFooterLabel(searching: boolean, searched: boolean, resultCount: number): string {
  if (searching) return "Searching Google Places…";
  if (searched) return resultCount > 0 ? "Search Google Places again" : "No results on Google Places — search again";
  return "Search Google Places";
}

export function randomSessionToken(): string {
  // Just needs to be unique per venue-search session, not cryptographically
  // secure — this only ever groups Google Places Autocomplete requests for
  // billing, never used as an auth/security token. No crypto.randomUUID()
  // here on purpose: Hermes (this app's RN JS engine) doesn't polyfill
  // WebCrypto, and pulling in a package just for this would be overkill.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
