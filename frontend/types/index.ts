// ─── Auth / Public Profile ──────────────────────────────────────────────────
//
// GET /public/users/{username} returns { profile, logs, favorites } — not a
// flat user-with-stats object. The backend does NOT expose follower/
// following/log counts as fields anywhere (confirmed against
// schemas/public_profile.py + services/supabase_rest.py's
// get_public_profile_by_username) — a count has to be derived client-side
// from GET /public/users/{username}/followers|following's list length,
// which is a page size, not a true total. Treated as best-effort below,
// not a real total — flagging rather than silently pretending otherwise.

export type AccountVisibility = "public" | "followers_only" | "private";

export interface ProfileLink {
  label: string;
  url: string;
}

export interface PublicProfile {
  user_id: string;
  username: string;
  display_name?: string;
  bio?: string;
  account_visibility: AccountVisibility;
  avatar_path?: string;
  banner_path?: string;
  profile_links: ProfileLink[];
  // Caller-directional (true only when *the caller* placed the block) —
  // safe to read and branch UI on. Always false for the blocked party,
  // who never placed it, so this can never be used to detect being
  // blocked — that's deliberate, see PublicProfileScreen.tsx.
  is_blocking: boolean;
  can_view_content: boolean;
  // NOT YET returned by GET /public/users/{username} as of this writing —
  // the profile RPC (get_public_profile_by_username) has no equivalent of
  // is_blocking for follow state, so there's no backend signal for "I have
  // a pending request to this private account" on a fresh page load today.
  // useFollowUser already tracks this client-side (from the POST/DELETE
  // response's own `status`, cached per-session) as a stopgap — this field
  // is typed now so PublicProfileScreen picks it up for real the moment
  // the backend adds it, with the client-side value as fallback until
  // then. See the backend handoff note in useFollowUser (hooks/useSocial.ts).
  caller_follow_status?: "none" | "pending" | "accepted";
}

// GET /public/blocks — the caller's own blocked accounts. Only the
// blocker can ever see this list; there's no "who blocked me" endpoint.
export interface BlockedUser {
  user_id: string;
  username?: string;
  display_name?: string;
  avatar_path?: string;
  blocked_at: string;
}

export interface PublicProfileResponse {
  profile: PublicProfile;
  logs: MovieLog[];
  favorites: MovieLog[];
}

// GET /public/users/search's own response_model — a narrower shape than
// PublicProfile above (no is_blocked/can_view_content; those come from
// the single-profile RPC, not the search one, and FastAPI's response_model
// strips anything the search endpoint's Pydantic schema doesn't declare).
export interface UserSearchResult {
  user_id: string;
  username?: string;
  display_name?: string;
  bio?: string;
  account_visibility: AccountVisibility;
  avatar_path?: string;
  banner_path?: string;
  profile_links: ProfileLink[];
}

// A short user reference as embedded in comments/followers lists/etc. —
// the backend never returns a nested "User" object with an `id` field;
// it resolves usernames/avatars inline on whichever row needs them
// (comments.username, notifications.actor_username, followers.username).
export interface UserRef {
  user_id: string;
  username?: string;
  display_name?: string;
  avatar_path?: string;
}

// ─── Movie Logs ─────────────────────────────────────────────────────────────
//
// Field names match movie_logs table columns 1:1 (backend/app/schemas/
// movie_logs.py's own docstring) — this type mirrors that exactly, not a
// separate frontend vocabulary layered on top.

// Per-LOG visibility (movie_logs.visibility) — distinct from the
// ACCOUNT-level AccountVisibility above. Only three tiers, and
// "followers_only" is NOT one of them; "anonymous" is.
export type LogVisibility = "private" | "anonymous" | "public";
export type Format = string; // free-typed on tickets — "IMAX"/"4DX"/"2D"/... but never a closed enum server-side
export type ArrivalStatus = "early" | "on_time" | "late";
export type ScreeningStartStatus = "early" | "on_time" | "delayed" | "cancelled";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";
export type ExtractionProvider = "openrouter" | "openai" | "gemini";

export interface MovieLog {
  id: string;
  // Optional — an anonymous log's user_id is legitimately null (the
  // real author is deliberately unreadable there, same reasoning as
  // username/display_name/avatar_path below). Was wrongly required
  // until the backend fixed this alongside making GET /movie-logs/{id}
  // visibility- rather than ownership-scoped.
  user_id?: string;
  movie?: string;
  watched_date?: string; // YYYY-MM-DD
  watched_time?: string; // HH:MM 24h
  timezone_abbrv?: string;
  theater?: string; // free-typed venue name (as printed on the ticket)
  theatre_id?: string; // FK into the resolved venues.theatres directory, if linked
  screen_id?: string;
  screen?: string; // free-typed auditorium label
  seats: string[];
  language?: string;
  format?: Format;
  price?: number;
  currency?: string; // ISO 4217, e.g. "INR"
  booking_ref?: string;
  certificate?: string;
  notes?: string;
  rating?: number; // 0.5–5 in half-star steps
  ticket_image_path?: string; // Supabase Storage path, not a public URL
  movie_id?: string; // FK into the optional TMDB-backed catalog (see Movie below)
  visibility: LogVisibility;
  arrival_status?: ArrivalStatus;
  arrival_delta_minutes?: number;
  screening_start_status?: ScreeningStartStatus;
  screening_start_delta_minutes?: number;
  is_fdfs: boolean; // First Day First Show
  is_first_day: boolean;
  is_archived: boolean;
  extraction_provider?: ExtractionProvider;
  extraction_model?: string;
  extraction_edited?: boolean;
  // Backend-only markers (never sent by the client) — see supabase/
  // migrations/20260817000002_auto_insert.sql. Present on GET responses.
  auto_inserted?: boolean;
  extraction_batch_id?: string;
  // Read-only, server-computed:
  created_at: string;
  updated_at: string;
  edited_at?: string; // non-null = "edited" indicator; set on first real content change after creation
  favorite_position?: number; // 1–4 if one of the caller's Top-4 favorites, else absent
  time_of_day?: TimeOfDay; // derived from watched_time, never stored
  like_count: number;
  liked_by_caller?: boolean;
  // Only present on public/feed views (public_movie_log_entries,
  // feed_entries) — flat columns there (us.username/display_name/
  // avatar_path joined in), never a nested `user` object. All three are
  // null on an anonymous entry, since the real author is deliberately
  // unreadable there.
  username?: string;
  display_name?: string;
  avatar_path?: string;
}

// Per-visit venue quality rating (screen/speaker/AC/seat, half-star
// 0.5-5.0 each) — a separate table (visit_venue_ratings), one row per log
// at most. Read via GET and saved via PUT /movie-logs/{id}/venue-rating
// (schemas/venues.py's VenueRatingInput on the backend) — see
// hooks/useVenueRating.ts.
export interface VenueRating {
  screen_rating?: number;
  speaker_rating?: number;
  ac_rating?: number;
  seat_rating?: number;
}

// Only WRITABLE_FIELDS (backend/app/schemas/movie_logs.py) may be sent —
// id/user_id/created_at/updated_at/like_count/favorite_position/time_of_day/
// auto_inserted/extraction_batch_id are all server-managed and rejected
// silently (ignored) if sent, per Pydantic's extra='ignore' on this input.
export type MovieLogInput = Partial<
  Pick<
    MovieLog,
    | "movie"
    | "watched_date"
    | "watched_time"
    | "timezone_abbrv"
    | "theater"
    | "seats"
    | "language"
    | "screen"
    | "format"
    | "price"
    | "currency"
    | "booking_ref"
    | "certificate"
    | "notes"
    | "rating"
    | "ticket_image_path"
    | "theatre_id"
    | "screen_id"
    | "movie_id"
    | "visibility"
    | "arrival_status"
    | "arrival_delta_minutes"
    | "screening_start_status"
    | "screening_start_delta_minutes"
    | "is_fdfs"
    | "is_first_day"
    | "is_archived"
    | "extraction_provider"
    | "extraction_model"
    | "extraction_edited"
  >
> & {
  // Write-only — never echoed back on a MovieLog response (not a real
  // column, resolved server-side into theatre_id before the row is
  // written). Only meaningful when theatre_id itself is absent — an
  // explicit theatre_id always wins if both are somehow sent.
  theatre_place?: TheatrePlaceInput;
};

// ─── Venues (Theatres/Screens) ──────────────────────────────────────────────
//
// Discovery is via POST /venues/theatres/match (free, trigram search over
// our own DB — now also matching against `nickname`, not just `name`) or
// POST /venues/theatres/search-places (Google Places autocomplete, billed
// server-side, optional). A single theatre is GET /venues/theatres/{id}
// (public, no auth) — its stats/reviews/note are separate fetches by id.

export type VenueStatus = "open" | "closed" | "renovation";

export interface Theatre {
  id: string;
  name: string;
  chain?: string;
  city: string;
  state?: string;
  country: string; // ISO-2, e.g. "IN"
  lat?: number;
  lng?: number;
  place_id?: string;
  formatted_address?: string;
  source: "google_places" | "user_submitted";
  status: VenueStatus;
  // Admin-set alternate label — NOT a correction to name/formatted_address
  // (those stay Google-sourced/untouched). null unless an admin has set
  // one. The backend never coalesces this into `name` — see
  // lib/venue.ts's venueDisplayName() for the one place that decision is
  // made on the frontend.
  nickname?: string;
  nickname_address?: string;
}

export interface TheatreMatchCandidate {
  id: string;
  name: string;
  chain?: string;
  city?: string;
  formatted_address?: string;
  nickname?: string;
  similarity: number;
}

export interface TheatrePlaceSuggestion {
  place_id: string;
  description?: string;
  main_text?: string;
  secondary_text?: string;
}

// Sent instead of a resolved theatre_id when the picked venue is a Google
// Places suggestion, not yet a row in our own directory — the backend
// resolves-or-creates it server-side (POST/PATCH /movie-logs), same
// place_id-dedup logic POST /venues/theatres itself uses. No `city`: the
// backend already derives it from place_id via a server-side Places
// lookup, same as theatre creation proper.
export interface TheatrePlaceInput {
  place_id: string;
  name?: string;
  formatted_address?: string;
}

export interface Screen {
  id: string;
  theatre_id: string;
  name: string;
  screen_type?: string;
  status: VenueStatus;
}

export interface ScreenMatchCandidate {
  id: string;
  name: string;
  screen_type?: string;
  similarity: number;
}

// Half-star category averages, as returned by GET /venues/theatres/{id}/stats
// and GET /venues/screens/{id}/stats — a category key is simply absent
// (not present with a null value) when nobody's rated it yet.
export interface VenueRatingCategoryStats {
  avg: number;
  count: number;
}
export type VenueRatingCategories = Partial<Record<"screen_rating" | "speaker_rating" | "ac_rating" | "seat_rating", VenueRatingCategoryStats>>;

export interface PunctualityStats {
  on_time_count: number;
  early_count: number;
  delayed_count: number;
  cancelled_count: number;
  avg_delay_minutes?: number;
  total_count: number;
}

export interface TheatreStats {
  theatre_id: string;
  overall: VenueRatingCategories;
  overall_avg?: number; // visit-weighted mean across categories
  screens_avg?: number; // mean of this theatre's own screens' overall_avg, one vote per screen
  computed_at?: string;
  punctuality: PunctualityStats;
}

export interface ScreenStats {
  screen_id: string;
  categories: VenueRatingCategories;
  overall_avg?: number;
  computed_at?: string;
  punctuality: PunctualityStats;
}

export interface MovieStats {
  movie_id: string;
  avg_rating?: number;
  rating_count: number;
}

// A private, standing note about a theatre/screen/movie — independent of
// any specific log. One per (user, entity); saving again overwrites the
// previous text. Exactly one of theatre_id/screen_id/movie_id is ever set,
// matching which GET/PUT/DELETE .../note endpoint it came from.
export interface VenueNote {
  id: string;
  user_id: string;
  theatre_id?: string;
  screen_id?: string;
  movie_id?: string;
  note: string;
  created_at: string;
  updated_at: string;
}

// ─── Comments & Likes ───────────────────────────────────────────────────────
//
// Comments are a FLAT resource at /api/v1/comments, filtered by
// ?movie_log_id=, never nested under /movie-logs/{id}/comments. The create/
// update body field is `text`, not `content`.

export interface Comment {
  id: string;
  movie_log_id: string;
  user_id?: string; // null once the author's account is deleted (anonymized, not removed)
  username?: string;
  display_name?: string;
  avatar_path?: string;
  parent_comment_id?: string;
  text?: string; // null once soft-deleted (see deleted_at) — the row stays so replies don't orphan
  like_count: number;
  liked_by_caller?: boolean;
  edited_at?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  replies: Comment[]; // one level only — a reply's own replies is always empty
}

// ─── Notifications ──────────────────────────────────────────────────────────
//
// No GET /notifications/unread-count endpoint exists — derive an unread
// count from GET /notifications?unread_only=true's result length (or just
// keep a running badge count client-side as items get marked read).

export type NotificationType =
  | "follow_request"
  | "follow_accepted"
  | "new_follower"
  | "new_comment"
  | "comment_reply"
  | "log_like"
  | "comment_like"
  | "report_resolved"
  | "auto_insert_complete"
  | "batch_extraction_complete";

export interface Notification {
  id: string;
  recipient_id: string;
  actor_id?: string; // null for report_resolved/auto_insert_complete/batch_extraction_complete (no human actor), or if the actor's account was since deleted
  actor_username?: string;
  actor_avatar_path?: string;
  type: NotificationType;
  movie_log_id?: string;
  movie?: string; // the log's title, resolved server-side
  comment_id?: string;
  comment_preview?: string; // the comment's current text verbatim, null if since soft-deleted
  report_id?: string;
  report_status?: string;
  extraction_batch_id?: string;
  batch_total_items?: number;
  batch_completed_items?: number;
  batch_failed_items?: number;
  read: boolean;
  created_at: string;
}

// ─── Follows / Feed ─────────────────────────────────────────────────────────

export type FollowStatus = "pending" | "accepted";

export interface Follow {
  follower_id: string;
  followee_id: string;
  status: FollowStatus;
  created_at: string;
}

// GET /public/users/{username}/followers|following row shape.
export interface FollowerEntry {
  user_id: string;
  username?: string;
  display_name?: string;
  avatar_path?: string;
  followed_at: string;
}

// GET /public/feed — same row shape as MovieLog (public_movie_log_entries/
// feed_entries views), not a separate "feed entry" wrapper type. There is
// no "log_like"/"new_comment"/"follow" activity-feed event type on the
// backend — the feed is purely "public logs from people you follow",
// reverse-chronological by watched_date.
export type FeedEntry = MovieLog;

// ─── LLM Keys ───────────────────────────────────────────────────────────────

export type LLMProvider = "openrouter" | "openai" | "gemini";

export interface LLMKey {
  provider: LLMProvider;
  key_prefix: string; // e.g. "AIzaSyBx" — never the full key, never echoed back
  created_at?: string;
  updated_at?: string;
}

// ─── Ticket Extraction ──────────────────────────────────────────────────────
//
// POST /movie-metadata/extract and /extract-batch are BOTH multipart/
// form-data (a real file upload, e.g. `ticket_image`/`ticket_images`), never
// a JSON body with a base64 string. See lib/api.ts's buildTicketFormData.

export interface ExtractionResult {
  is_ticket: boolean;
  rejection_reason?: string; // set only when is_ticket is false
  movie?: string;
  watched_date?: string;
  watched_time?: string;
  timezone_abbrv?: string;
  theater?: string;
  seats: string[];
  language?: string;
  screen?: string;
  format?: string;
  price?: number;
  currency?: string;
  booking_ref?: string;
  certificate?: string;
  used_provider: string;
  used_model: string;
  requested_model: string;
  fallback_occurred: boolean;
  // Set only when auto_insert resolved true for this call (an explicit
  // param, or the caller's stored profile default) — the backend performs
  // the insert itself during extraction; the client never separately
  // POSTs /movie-logs for an auto-inserted result.
  auto_insert_status?: "inserted" | "skipped_no_title" | "failed";
  movie_log_id?: string;
}

export type BatchItemStatus = "queued" | "completed" | "failed";

export interface BatchExtractionItem {
  id: string;
  position: number;
  filename?: string;
  status: BatchItemStatus;
  result?: ExtractionResult;
  error_code?: string;
  error_message?: string;
  auto_insert_status?: "inserted" | "skipped_no_title" | "failed";
  movie_log_id?: string;
}

export type BatchJobStatus = "processing" | "completed" | "failed";

export interface BatchExtractionJob {
  id: string;
  status: BatchJobStatus; // "completed" means finished processing, not that every item succeeded
  provider: string;
  model: string;
  auto_fallback: boolean;
  auto_insert: boolean;
  total_items: number;
  completed_items: number;
  failed_items: number;
  error_code?: string; // set only if the whole batch failed outright (e.g. "STALLED")
  error_message?: string;
  created_at: string;
  finished_at?: string;
  items: BatchExtractionItem[];
}

// ─── Movies (optional TMDB-backed catalog link) ────────────────────────────

export interface MovieSearchResult {
  tmdb_id: number;
  title: string;
  original_language?: string;
  release_date?: string; // YYYY-MM-DD
  poster_path?: string; // prepend https://image.tmdb.org/t/p/{size} client-side; no separate width fields
}

export interface Movie extends MovieSearchResult {
  id: string; // our own catalog row id, distinct from tmdb_id — use this as movie_id on a log
}

// ─── Stats ──────────────────────────────────────────────────────────────────
//
// No dedicated GET /stats endpoint exists on the backend today — this
// shape is computed client-side from the caller's own GET /movie-logs
// (StatsScreen's own concern), not fetched pre-aggregated.

export interface StatsData {
  total_logs: number;
  this_year: number;
  avg_rating: number;
  venues_visited: number;
  monthly_counts: Record<string, number>; // "2026-01" → count
  rating_distribution: Record<string, number>; // "5" → count
  format_distribution: Record<string, number>;
  punctuality: {
    early: number;
    on_time: number;
    late: number;
  };
  fdfs_count: number;
  time_of_day: Record<TimeOfDay, number>;
}
