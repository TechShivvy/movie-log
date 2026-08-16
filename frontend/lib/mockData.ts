import type { MovieLog, FeedEntry, User, Notification, Venue, MovieSearchResult, StatsData } from "../types";

export const MOCK_USER: User = {
  id: "u1",
  username: "cinemaphile",
  display_name: "Alex Chen",
  avatar_url: undefined,
  bio: "Watching films since the VHS era 🎬",
  created_at: "2024-01-01T00:00:00Z",
};

export const MOCK_LOGS: MovieLog[] = [
  { id: "l1", user_id: "u1", movie_title: "Dune: Part Two", movie_poster_url: undefined, format: "IMAX", rating: 5, visibility: "public", is_archived: false, is_fdfs: true, created_at: "2024-03-01T20:00:00Z", updated_at: "2024-03-01T20:00:00Z", like_count: 12, comment_count: 3, is_liked: false },
  { id: "l2", user_id: "u1", movie_title: "Poor Things", movie_poster_url: undefined, format: "Standard", rating: 4, visibility: "public", is_archived: false, created_at: "2024-02-14T19:30:00Z", updated_at: "2024-02-14T19:30:00Z", like_count: 8, comment_count: 1, is_liked: true },
  { id: "l3", user_id: "u1", movie_title: "Oppenheimer", movie_poster_url: undefined, format: "IMAX", rating: 5, visibility: "public", is_archived: false, created_at: "2023-07-21T18:00:00Z", updated_at: "2023-07-21T18:00:00Z", like_count: 24, comment_count: 7, is_liked: false },
  { id: "l4", user_id: "u1", movie_title: "Past Lives", movie_poster_url: undefined, format: "Standard", rating: 5, visibility: "public", is_archived: false, created_at: "2023-06-10T21:00:00Z", updated_at: "2023-06-10T21:00:00Z", like_count: 6, comment_count: 2, is_liked: false },
  { id: "l5", user_id: "u1", movie_title: "The Zone of Interest", movie_poster_url: undefined, format: "Dolby", rating: 4, visibility: "followers_only", is_archived: false, created_at: "2024-01-15T20:30:00Z", updated_at: "2024-01-15T20:30:00Z", like_count: 3, comment_count: 0, is_liked: false },
  { id: "l6", user_id: "u1", movie_title: "Saltburn", movie_poster_url: undefined, format: "Standard", rating: 3, visibility: "public", is_archived: false, created_at: "2023-12-05T19:00:00Z", updated_at: "2023-12-05T19:00:00Z", like_count: 5, comment_count: 1, is_liked: false },
  { id: "l7", user_id: "u1", movie_title: "Killers of the Flower Moon", movie_poster_url: undefined, format: "IMAX", rating: 5, visibility: "public", is_archived: false, created_at: "2023-10-20T17:00:00Z", updated_at: "2023-10-20T17:00:00Z", like_count: 15, comment_count: 5, is_liked: true },
  { id: "l8", user_id: "u1", movie_title: "Spider-Man: Across the Spider-Verse", movie_poster_url: undefined, format: "4DX", rating: 5, visibility: "public", is_archived: false, created_at: "2023-06-02T16:00:00Z", updated_at: "2023-06-02T16:00:00Z", like_count: 31, comment_count: 9, is_liked: false },
];

const USER2: User = { id: "u2", username: "reelwatcher", display_name: "Jordan Kim", created_at: "2024-02-01T00:00:00Z" };

export const MOCK_FEED: FeedEntry[] = [
  { id: "f1", type: "new_log", actor: USER2, log: MOCK_LOGS[0], created_at: "2024-03-02T10:00:00Z" },
  { id: "f2", type: "log_like", actor: USER2, log: MOCK_LOGS[2], created_at: "2024-03-01T22:00:00Z" },
  { id: "f3", type: "new_comment", actor: USER2, log: MOCK_LOGS[1], comment_preview: "Loved the aesthetic — very Yorgos.", created_at: "2024-02-15T09:00:00Z" },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: "n1", user_id: "u1", type: "log_like", actor_username: "reelwatcher", movie: "Oppenheimer", is_read: false, created_at: "2024-03-01T22:00:00Z" },
  { id: "n2", user_id: "u1", type: "new_comment", actor_username: "reelwatcher", movie: "Poor Things", comment_preview: "Loved the aesthetic!", is_read: false, created_at: "2024-02-15T09:00:00Z" },
  { id: "n3", user_id: "u1", type: "follow", actor_username: "filmfanatic99", is_read: true, created_at: "2024-02-10T14:00:00Z" },
];

export const MOCK_VENUES: Venue[] = [
  { id: "v1", name: "Odeon Luxe Leicester Square", address: "22-24 Leicester Square, London", status: "open", log_count: 12 },
  { id: "v2", name: "BFI IMAX", address: "1 Charlie Chaplin Walk, London", status: "open", log_count: 7 },
];

export const MOCK_MOVIES: MovieSearchResult[] = [
  { id: "m1", title: "Dune: Part Two", year: 2024, genres: ["Sci-Fi", "Adventure"] },
  { id: "m2", title: "Poor Things", year: 2023, genres: ["Drama", "Fantasy"] },
  { id: "m3", title: "Oppenheimer", year: 2023, genres: ["Drama", "History"] },
];

export const MOCK_STATS: StatsData = {
  total_logs: 8,
  this_year: 3,
  avg_rating: 4.5,
  venues_visited: 3,
  monthly_counts: { "2024-03": 1, "2024-02": 1, "2024-01": 1, "2023-12": 1, "2023-10": 1, "2023-07": 1, "2023-06": 2 },
  rating_distribution: { "5": 5, "4": 2, "3": 1, "2": 0, "1": 0 },
  genre_distribution: { "Sci-Fi": 2, "Drama": 3, "Action": 1, "Animation": 1, "History": 1 },
  format_distribution: { "IMAX": 4, "Standard": 3, "4DX": 1, "Dolby": 1 },
  punctuality: { early: 3, on_time: 4, late: 1 },
  fdfs_count: 1,
  time_of_day: { morning: 0, afternoon: 2, evening: 5, night: 1 },
};
