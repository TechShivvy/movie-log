import type {
  MovieLog,
  FeedEntry,
  PublicProfile,
  Notification,
  Theatre,
  MovieSearchResult,
  StatsData,
} from "../types";

export const MOCK_USER: PublicProfile = {
  user_id: "u1",
  username: "cinemaphile",
  display_name: "Alex Chen",
  bio: "Watching films since the VHS era.",
  account_visibility: "public",
  profile_links: [],
  is_blocking: false,
  can_view_content: true,
};

export const MOCK_LOGS: MovieLog[] = [
  { id: "l1", user_id: "u1", movie: "Dune: Part Two", format: "IMAX", rating: 5, visibility: "public", is_archived: false, is_fdfs: true, is_first_day: true, seats: [], created_at: "2026-03-01T20:00:00Z", updated_at: "2026-03-01T20:00:00Z", watched_date: "2026-03-01", like_count: 12 },
  { id: "l2", user_id: "u1", movie: "Poor Things", format: "Standard", rating: 4, visibility: "public", is_archived: false, is_fdfs: false, is_first_day: false, seats: [], created_at: "2026-02-14T19:30:00Z", updated_at: "2026-02-14T19:30:00Z", watched_date: "2026-02-14", like_count: 8, liked_by_caller: true },
  { id: "l3", user_id: "u1", movie: "Oppenheimer", format: "IMAX", rating: 5, visibility: "public", is_archived: false, is_fdfs: false, is_first_day: false, seats: [], created_at: "2025-07-21T18:00:00Z", updated_at: "2025-07-21T18:00:00Z", watched_date: "2025-07-21", like_count: 24 },
  { id: "l4", user_id: "u1", movie: "Past Lives", format: "Standard", rating: 5, visibility: "public", is_archived: false, is_fdfs: false, is_first_day: false, seats: [], created_at: "2025-06-10T21:00:00Z", updated_at: "2025-06-10T21:00:00Z", watched_date: "2025-06-10", like_count: 6 },
  { id: "l5", user_id: "u1", movie: "The Zone of Interest", format: "Dolby", rating: 4, visibility: "private", is_archived: false, is_fdfs: false, is_first_day: false, seats: [], created_at: "2026-01-15T20:30:00Z", updated_at: "2026-01-15T20:30:00Z", watched_date: "2026-01-15", like_count: 3 },
  { id: "l6", user_id: "u1", movie: "Saltburn", format: "Standard", rating: 3, visibility: "public", is_archived: false, is_fdfs: false, is_first_day: false, seats: [], created_at: "2025-12-05T19:00:00Z", updated_at: "2025-12-05T19:00:00Z", watched_date: "2025-12-05", like_count: 5 },
  { id: "l7", user_id: "u1", movie: "Killers of the Flower Moon", format: "IMAX", rating: 5, visibility: "public", is_archived: false, is_fdfs: false, is_first_day: false, seats: [], created_at: "2025-10-20T17:00:00Z", updated_at: "2025-10-20T17:00:00Z", watched_date: "2025-10-20", like_count: 15, liked_by_caller: true },
  { id: "l8", user_id: "u1", movie: "Spider-Man: Across the Spider-Verse", format: "4DX", rating: 5, visibility: "public", is_archived: false, is_fdfs: false, is_first_day: false, seats: [], created_at: "2025-06-02T16:00:00Z", updated_at: "2025-06-02T16:00:00Z", watched_date: "2025-06-02", like_count: 31 },
];

// GET /public/feed's rows are shaped exactly like MovieLog (see
// FeedEntry = MovieLog in types/index.ts) — username/display_name/
// avatar_path flat on each entry, not a nested actor/log wrapper.
export const MOCK_FEED: FeedEntry[] = [
  { ...MOCK_LOGS[0], user_id: "u2", username: "reelwatcher", display_name: "Jordan Kim" },
  { ...MOCK_LOGS[2], user_id: "u2", username: "reelwatcher", display_name: "Jordan Kim" },
  { ...MOCK_LOGS[1], user_id: "u2", username: "reelwatcher", display_name: "Jordan Kim" },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: "n1", recipient_id: "u1", type: "log_like", actor_username: "reelwatcher", movie_log_id: "l3", movie: "Oppenheimer", read: false, created_at: "2026-03-01T22:00:00Z" },
  { id: "n2", recipient_id: "u1", type: "new_comment", actor_username: "reelwatcher", movie_log_id: "l2", movie: "Poor Things", comment_preview: "Loved the aesthetic!", read: false, created_at: "2026-02-15T09:00:00Z" },
  { id: "n3", recipient_id: "u1", type: "new_follower", actor_username: "filmfanatic99", read: true, created_at: "2026-02-10T14:00:00Z" },
];

export const MOCK_VENUES: Theatre[] = [
  { id: "v1", name: "Odeon Luxe Leicester Square", city: "London", country: "GB", source: "user_submitted", status: "open" },
  { id: "v2", name: "BFI IMAX", city: "London", country: "GB", source: "user_submitted", status: "open" },
];

export const MOCK_MOVIES: MovieSearchResult[] = [
  { tmdb_id: 693134, title: "Dune: Part Two", release_date: "2024-02-27" },
  { tmdb_id: 792307, title: "Poor Things", release_date: "2023-12-07" },
  { tmdb_id: 872585, title: "Oppenheimer", release_date: "2023-07-19" },
];

export const MOCK_STATS: StatsData = {
  total_logs: 8,
  this_year: 3,
  avg_rating: 4.5,
  venues_visited: 3,
  monthly_counts: { "2026-03": 1, "2026-02": 1, "2026-01": 1, "2025-12": 1, "2025-10": 1, "2025-07": 1, "2025-06": 2 },
  rating_distribution: { "5": 5, "4": 2, "3": 1, "2": 0, "1": 0 },
  format_distribution: { "IMAX": 4, "Standard": 3, "4DX": 1, "Dolby": 1 },
  punctuality: { early: 3, on_time: 4, late: 1 },
  fdfs_count: 1,
  time_of_day: { morning: 0, afternoon: 2, evening: 5, night: 1 },
};
