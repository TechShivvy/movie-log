/**
 * Random username suggestion for onboarding/Edit Profile.
 *
 * Word source: the `unique-names-generator` npm package (bundled,
 * offline, no runtime network call) rather than a live external API —
 * a username-suggestion API being down would block onboarding
 * entirely, and a bundled wordlist costs nothing and is instant either
 * way. Fed with our own cinema/theatre-themed dictionaries rather than
 * the package's generic built-ins (adjectives+animals gave things like
 * "curly_mastodon" — fine for a generic app, off-theme for this one).
 *
 * Uniqueness: generating a plausible-looking string here says nothing
 * about whether it's actually free — suggestAvailableUsername below
 * checks each candidate against GET /public/users/{username} (the same
 * read-only, no-side-effects check useUsernameAvailability's live
 * field validation already uses) and retries with a fresh candidate on
 * a collision, so what actually lands in the input has already been
 * confirmed available, not just generated.
 */
import { uniqueNamesGenerator } from "unique-names-generator";
import { api } from "./api";

// Cinema/theatre vocabulary rather than a generic wordlist — this is a
// movie-logging app, so "velvet_matinee" reads as on-theme in a way a
// generic adjective+animal combo never would. Kept purely descriptive/
// atmospheric (no film titles, real people, or trademarks) so nothing
// here can collide with someone else's IP.
const ADJECTIVES = [
  "velvet", "midnight", "silent", "golden", "neon", "vintage", "crimson",
  "silver", "final", "opening", "backstage", "candlelit", "nocturnal",
  "classic", "widescreen", "matinee", "rowdy", "hushed", "flickering",
  "technicolor", "retro", "cosmic", "dusty", "grand", "indie", "phantom",
  "balcony", "frontrow", "soldout", "encore", "solo",
];

const NOUNS = [
  "reel", "projector", "popcorn", "marquee", "screening", "cinephile",
  "director", "premiere", "trailer", "cameo", "montage", "flashback",
  "closeup", "usher", "curtain", "sequel", "credits", "extra", "screen",
  "spotlight", "encore", "cut", "frame", "critic", "audience", "matinee",
  "projectionist", "boxoffice", "auditorium", "intermission", "cameo",
];

/** e.g. "velvet_projector482" — matches the backend's own
 * ^[a-z0-9_]{3,30}$ username pattern; sanitized defensively in case a
 * future dictionary entry ever contains anything outside that set.
 * The numeric suffix is generated fresh on every call — a previous
 * version generated it once at module load and reused the same digits
 * for every suggestion in a session, which looked like "the shuffle
 * button isn't actually shuffling the number." */
export function generateUsername(): string {
  const digits = Math.floor(Math.random() * 900 + 100); // 100-999, fresh each call
  const raw = uniqueNamesGenerator({
    dictionaries: [ADJECTIVES, NOUNS],
    separator: "_",
    style: "lowerCase",
  });
  return `${raw}_${digits}`.replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

async function isUsernameAvailable(username: string): Promise<boolean> {
  try {
    await api.get(`/public/users/${username}`);
    return false; // 200 = someone already has it
  } catch (e: any) {
    return e?.status === 404; // nobody has it
  }
}

/**
 * Generates candidates and checks each one live, returning the first
 * confirmed-available username — not just a plausible-looking one.
 * Capped at a handful of tries; on the vanishingly unlikely chance all
 * of them collide, returns the last candidate anyway (still shows the
 * real "taken" state via the normal live-check field once it's typed
 * in, same as anything else the user might type themselves).
 */
export async function suggestAvailableUsername(maxAttempts = 5): Promise<string> {
  let candidate = generateUsername();
  for (let i = 0; i < maxAttempts; i++) {
    candidate = generateUsername();
    if (await isUsernameAvailable(candidate)) return candidate;
  }
  return candidate;
}
