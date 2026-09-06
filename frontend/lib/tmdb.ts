// TMDB search results (schemas/movies.py::MovieSearchResult) store only a
// poster PATH (e.g. "/abc123.jpg"), never a full URL — the client is
// expected to build the real image URL itself by prepending TMDB's CDN base
// plus a fixed size bucket. Same "we store the path, client builds the URL"
// shape as a user's avatar_path.
export type TmdbPosterSize = "w92" | "w154" | "w342" | "w500" | "w780" | "original";

export function tmdbPosterUrl(
  path?: string | null,
  size: TmdbPosterSize = "w154"
): string | undefined {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}

// release_date is "YYYY-MM-DD" or absent — this is the only place a "year"
// exists; MovieSearchResult has no separate year field.
export function releaseYear(releaseDate?: string | null): string | undefined {
  return releaseDate ? releaseDate.slice(0, 4) : undefined;
}
