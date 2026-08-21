/**
 * Random username suggestion for onboarding/Edit Profile.
 *
 * Word source: the `unique-names-generator` npm package (bundled,
 * offline, no runtime network call) rather than a live external API —
 * a username-suggestion API being down would block onboarding
 * entirely, and a bundled wordlist costs nothing and is instant either
 * way. It's still a real, actively-maintained dictionary (adjectives +
 * animals) rather than a small hand-rolled list.
 *
 * Uniqueness: generating a plausible-looking string here says nothing
 * about whether it's actually free — suggestAvailableUsername below
 * checks each candidate against GET /public/users/{username} (the same
 * read-only, no-side-effects check useUsernameAvailability's live
 * field validation already uses) and retries with a fresh candidate on
 * a collision, so what actually lands in the input has already been
 * confirmed available, not just generated.
 */
import { uniqueNamesGenerator, adjectives, animals, NumberDictionary } from "unique-names-generator";
import { api } from "./api";

const numbers = NumberDictionary.generate({ min: 100, max: 999 });

/** e.g. "happy_panther_482" — matches the backend's own
 * ^[a-z0-9_]{3,30}$ username pattern; sanitized defensively in case a
 * future dictionary entry ever contains anything outside that set. */
export function generateUsername(): string {
  const raw = uniqueNamesGenerator({
    dictionaries: [adjectives, animals, numbers],
    separator: "_",
    style: "lowerCase",
  });
  return raw.replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

async function isUsernameAvailable(username: string): Promise<boolean> {
  try {
    await api.get(`/public/users/${username}`);
    return false; // 200 = someone already has it
  } catch (e: any) {
    return e?.response?.status === 404; // nobody has it
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
