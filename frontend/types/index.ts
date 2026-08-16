// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  created_at: string;
}

export interface UserProfile extends User {
  followers_count: number;
  following_count: number;
  log_count: number;
  is_following: boolean;
  is_blocked: boolean;
  logs: MovieLog[];
}

// ─── Movie Logs ───────────────────────────────────────────────────────────────

export type Visibility = "public" | "followers_only" | "private";
export type Format = "IMAX" | "4DX" | "Dolby" | "ScreenX" | "Standard" | "IMAX 3D" | "Laser" | "PLF" | string;
export type ArrivalStatus = "early" | "on_time" | "late";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export interface MovieLog {
  id: string;
  user_id: string;
  user?: User;
  movie_title: string;
  movie_poster_url?: string;
  movie_id?: string;
  venue_id?: string;
  venue?: Venue;
  screen_number?: string;
  seat?: string;
  format?: Format;
  rating?: number; // 0–5
  notes?: string;
  visibility: Visibility;
  arrived_at?: string;       // ISO datetime
  screening_started_at?: string; // ISO datetime
  arrival_status?: ArrivalStatus;
  is_fdfs?: boolean;         // First Day First Show
  ticket_url?: string;
  used_provider?: string;    // e.g. "openrouter", "openai", "gemini"
  used_model?: string;       // e.g. "google/gemini-flash-1.5"
  is_archived: boolean;
  edited_at?: string;        // ISO datetime if log was edited
  created_at: string;
  updated_at: string;
  like_count: number;
  comment_count: number;
  is_liked: boolean;
}

export interface CreateMovieLogPayload {
  movie_title: string;
  movie_poster_url?: string;
  movie_id?: string;
  venue_id?: string;
  screen_number?: string;
  seat?: string;
  format?: Format;
  rating?: number;
  notes?: string;
  visibility: Visibility;
  arrived_at?: string;
  screening_started_at?: string;
  is_fdfs?: boolean;
  ticket_url?: string;
}

// ─── Venues ───────────────────────────────────────────────────────────────────

export type VenueStatus = "open" | "closed" | "unknown";

export interface Venue {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  status: VenueStatus;
  last_verified?: string;
  log_count?: number;
}

// ─── Comments & Likes ────────────────────────────────────────────────────────

export interface Comment {
  id: string;
  log_id: string;
  user_id: string;
  user: User;
  content: string;
  parent_comment_id?: string;
  replies: Comment[];
  like_count: number;
  is_liked: boolean;
  created_at: string;
  edited_at?: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | "follow"
  | "unfollow"
  | "new_comment"
  | "comment_reply"
  | "log_like"
  | "comment_like"
  | "report_resolved"
  | "system";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id?: string;
  actor_username?: string;
  movie?: string;           // movie title
  comment_preview?: string; // first 50 chars
  log_id?: string;
  comment_id?: string;
  is_read: boolean;
  created_at: string;
}

// ─── Social Feed ─────────────────────────────────────────────────────────────

export type FeedEntryType = "new_log" | "log_like" | "new_comment" | "follow";

export interface FeedEntry {
  id: string;
  type: FeedEntryType;
  actor: User;
  log?: MovieLog;
  comment_preview?: string;
  target_user?: User;
  created_at: string;
}

// ─── LLM Keys ────────────────────────────────────────────────────────────────

export type LLMProvider = "openrouter" | "openai" | "gemini";

export interface LLMKey {
  provider: LLMProvider;
  masked_key: string;   // e.g. "sk-...xxxx"
  created_at: string;
  is_active: boolean;
}

export type LLMKeyStoragePreference = "server" | "local";

// ─── Ticket Extraction ────────────────────────────────────────────────────────

export interface ExtractionResult {
  movie_title?: string;
  venue_name?: string;
  date?: string;
  format?: Format;
  seat?: string;
  screen?: string;
  is_ticket: boolean;
  rejection_reason?: string;
  used_provider?: string;
  used_model?: string;
}

export type BatchItemStatus = "queued" | "processing" | "done" | "error";

export interface BatchExtractionItem {
  image_index: number;
  status: BatchItemStatus;
  result?: ExtractionResult;
  error?: string;
}

export type BatchJobStatus = "pending" | "processing" | "done" | "stalled";

export interface BatchExtractionJob {
  job_id: string;
  status: BatchJobStatus;
  total: number;
  done_count: number;
  items: BatchExtractionItem[];
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface MovieSearchResult {
  id: string;
  title: string;
  year?: number;
  poster_url?: string;
  genres?: string[];
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface StatsData {
  total_logs: number;
  this_year: number;
  avg_rating: number;
  venues_visited: number;
  monthly_counts: Record<string, number>; // "2024-01" → count
  rating_distribution: Record<string, number>; // "5" → count
  genre_distribution: Record<string, number>;
  format_distribution: Record<string, number>;
  punctuality: {
    early: number;
    on_time: number;
    late: number;
  };
  fdfs_count: number;
  time_of_day: Record<TimeOfDay, number>;
}
