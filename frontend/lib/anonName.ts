/**
 * anonName — a deterministic, cinema-themed stand-in name for an
 * anonymous log's author.
 *
 * An anonymous log's `username`/`display_name`/`avatar_path` are all
 * server-null (see types/index.ts's own comment on MovieLog — "the real
 * author is deliberately unreadable there"), so a Public/Following feed
 * showing several anonymous entries used to show nothing at all in that
 * slot: no way to tell one anonymous review from another, or to refer
 * back to "the one who called it overrated" a moment later. Same idea as
 * a collaborative doc assigning anonymous editors a stable animal name —
 * themed here around cinema vocabulary instead of animals, and per-log,
 * not per-session: the SAME log always renders the SAME name (hashed
 * from its own id), everywhere it's shown, on every reload — it's a
 * label, not a fresh random name generator.
 */

const ADJECTIVES = [
  "Velvet", "Midnight", "Front-Row", "Back-Row", "Silent", "Golden",
  "Curtain-Call", "Second-Screening", "Balcony", "Matinee", "Opening-Night",
  "Reel-to-Reel", "Popcorn", "Anamorphic", "Widescreen", "Technicolor",
] as const;

const NOUNS = [
  "Projectionist", "Usher", "Cinephile", "Critic", "Moviegoer", "Screener",
  "Regular", "Balcony-Dweller", "Latecomer", "Reviewer", "Ticket-Stub",
  "Popcorn-Vendor", "Marquee", "Matinee-Idol", "Understudy", "Extra",
] as const;

/** FNV-1a — small, fast, deterministic, no dependency. Good enough for
 * picking two array indices from a string; not used for anything
 * security-sensitive. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The same `seed` (a log's own id) always produces the same name. */
export function anonName(seed: string): string {
  const h = hashString(seed);
  const adjective = ADJECTIVES[h % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length];
  return `${adjective} ${noun}`;
}
