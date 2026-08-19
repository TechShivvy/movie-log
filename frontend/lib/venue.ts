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
  return `https://www.google.com/maps?q=${v.lat},${v.lng}&output=embed`;
}
