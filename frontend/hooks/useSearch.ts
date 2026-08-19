import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { MOCK_MOVIES, MOCK_VENUES } from "../lib/mockData";
import type {
  Movie,
  MovieLog,
  MovieSearchResult,
  MovieStats,
  Screen,
  ScreenStats,
  Theatre,
  TheatreMatchCandidate,
  TheatrePlaceSuggestion,
  TheatreStats,
  VenueNote,
} from "../types";

/**
 * TMDB movie catalog search.
 * Backend: POST /api/v1/movies/search  body: { query: string }
 * Returns an empty array while the query is blank.
 */
export function useMovieSearch(q: string) {
  return useQuery({
    queryKey: ["search", "movies", q],
    queryFn: async () => {
      if (DEMO_MODE || !q) {
        return q
          ? MOCK_MOVIES.filter((m) =>
              m.title.toLowerCase().includes(q.toLowerCase())
            )
          : MOCK_MOVIES;
      }
      const { data } = await api.post<MovieSearchResult[]>("/movies/search", {
        query: q,
      });
      return data;
    },
    enabled: true,
  });
}

/**
 * Dedupes-by-tmdb_id into our own movies catalog (POST /movies) so a log
 * can carry a real movie_id — without this there was no way to get from
 * "picked a TMDB search hit" to a linkable catalog row at all, so
 * LogFormScreen only ever filled the title text, never movie_id, and the
 * poster preview shown while picking never survived past the create form.
 * Safe to call again for a title the caller already has a catalog row for
 * (or another caller entirely has) — the backend returns the existing row
 * instead of creating a duplicate.
 */
export function useCreateMovie() {
  return useMutation({
    mutationFn: async (tmdbId: number): Promise<Movie | undefined> => {
      if (DEMO_MODE) return undefined;
      const { data } = await api.post<Movie>("/movies", { tmdb_id: tmdbId });
      return data;
    },
  });
}

/**
 * A catalog entry by id — title/language/release date/poster_path. Public,
 * no auth needed (matches the backend route). This is how a saved log's
 * real poster gets rendered instead of the hue-gradient placeholder:
 * MovieLog only ever carries movie_id, never the poster itself, so
 * anywhere a poster shows for a log with movie_id set needs this lookup.
 * React Query dedupes/caches by id, so five logs for the same film cost
 * one fetch, not five.
 */
export function useMovie(movieId: string | undefined) {
  return useQuery({
    queryKey: ["movies", movieId],
    queryFn: async () => {
      const { data } = await api.get<Movie>(`/movies/${movieId}`);
      return data;
    },
    enabled: !DEMO_MODE && !!movieId,
    staleTime: 10 * 60_000, // a catalog entry's poster/title never changes underneath it
  });
}

/** Aggregate rating for a movie (GET /movies/{id}/stats, public) — the
 * "Public" section's headline number on MovieDetailScreen. */
export function useMovieStats(movieId: string | undefined) {
  return useQuery({
    queryKey: ["movies", movieId, "stats"],
    queryFn: async () => {
      const { data } = await api.get<MovieStats>(`/movies/${movieId}/stats`);
      return data;
    },
    enabled: !DEMO_MODE && !!movieId,
  });
}

/** Public + anonymous reviews for a movie, from anyone — GET
 * /movies/{id}/reviews, public+optional-auth, paginated. Never includes
 * `private` logs, which is exactly the "Public" scope on
 * MovieDetailScreen wants (as opposed to the caller's own logs via
 * useMovieLogs({movieId}), or followed-users' via useFeed({movieId})). */
export function useMovieReviews(movieId: string | undefined, params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["movies", movieId, "reviews", params],
    queryFn: async () => {
      const { data } = await api.get<MovieLog[]>(`/movies/${movieId}/reviews`, { params });
      return data;
    },
    enabled: !DEMO_MODE && !!movieId,
  });
}

/** The caller's own private standing note about a movie — independent of
 * any specific log's own `notes` field. 404 (via the mutationFn-less GET
 * below) means "no note yet", not an error — surfaced as `undefined`
 * data, same pattern as useVenueRating. */
export function useMovieNote(movieId: string | undefined) {
  return useQuery({
    queryKey: ["movies", movieId, "note"],
    queryFn: async (): Promise<VenueNote | null> => {
      if (DEMO_MODE) return null;
      try {
        const { data } = await api.get<VenueNote>(`/movies/${movieId}/note`);
        return data;
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!movieId,
  });
}

export function useSetMovieNote(movieId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) => {
      const trimmed = note.trim();
      if (!trimmed) {
        await api.delete(`/movies/${movieId}/note`);
        return null;
      }
      const { data } = await api.put<VenueNote>(`/movies/${movieId}/note`, { note: trimmed });
      return data;
    },
    onSuccess: (data) => qc.setQueryData(["movies", movieId, "note"], data),
  });
}

/**
 * Venue search — trigram "did you mean" match over our own theatres
 * directory, free (no Google Places call). There is no GET /venues
 * list/search endpoint at all; discovery is only via this match RPC or
 * POST /venues/theatres/search-places (Google Places autocomplete,
 * billed server-side, for picking a brand-new theatre to create).
 * Backend: POST /api/v1/venues/theatres/match  body: { query }
 */
export function useVenueSearch(q?: string) {
  return useQuery({
    queryKey: ["search", "venues", q],
    queryFn: async (): Promise<TheatreMatchCandidate[]> => {
      if (DEMO_MODE) {
        const matches = q
          ? MOCK_VENUES.filter((v) => v.name.toLowerCase().includes((q ?? "").toLowerCase()))
          : MOCK_VENUES;
        return matches.map((v) => ({ id: v.id, name: v.name, city: v.city, similarity: 1 }));
      }
      if (!q || q.trim().length < 3) return [];
      const { data } = await api.post<TheatreMatchCandidate[]>("/venues/theatres/match", {
        query: q,
      });
      return data;
    },
  });
}

/**
 * Google Places autocomplete, for when useVenueSearch's free trigram match
 * comes up empty — our own theatres directory only ever grows from
 * someone actually creating a row via useCreateTheatre below, so an empty
 * table (or just a theatre nobody's logged yet) means /theatres/match can
 * only ever return [], with no way to break that loop from the UI. This
 * is the fallback: real Google results to pick from instead.
 *
 * A mutation, not a query — deliberately NOT wired to fire on every
 * keystroke like useVenueSearch. Unlike /theatres/match, this one calls
 * the real Google Places API (billed server-side past its monthly
 * credit), so it only ever runs on an explicit "search Google" tap, never
 * an idle debounce that could bill for a query someone's still typing.
 * Backend: POST /api/v1/venues/theatres/search-places  body: {query, session_token}
 */
export function useSearchPlaces() {
  return useMutation({
    mutationFn: async ({ query, sessionToken }: { query: string; sessionToken: string }): Promise<TheatrePlaceSuggestion[]> => {
      if (DEMO_MODE) return [];
      const { data } = await api.post<TheatrePlaceSuggestion[]>("/venues/theatres/search-places", {
        query,
        session_token: sessionToken,
      });
      return data;
    },
  });
}

/**
 * Creates (or, if this place_id already exists, returns the existing)
 * theatre from a picked Google Places suggestion — the other half of the
 * useSearchPlaces fallback above. place_id is the real dedup key the
 * backend matches on; name/city here are best-effort from the
 * autocomplete result's own text (Google's autocomplete response is only
 * ever a free-text description, never structured address components) —
 * the backend re-fetches the place server-side from place_id and
 * overwrites these with the real name/address/lat-lng whenever that
 * lookup succeeds, so they only ever end up as the final stored value in
 * the (rare) case that lookup fails.
 */
export function useCreateTheatre() {
  return useMutation({
    mutationFn: async (place: TheatrePlaceSuggestion): Promise<Theatre | undefined> => {
      if (DEMO_MODE) return undefined;
      const { data } = await api.post<Theatre>("/venues/theatres", {
        name: place.main_text ?? place.description ?? "Unknown theatre",
        city: place.secondary_text?.split(",")[0]?.trim() || "Unknown",
        place_id: place.place_id,
        formatted_address: place.description,
      });
      return data;
    },
  });
}

/** A single theatre by id — GET /venues/theatres/{id}, public, no auth.
 * The full directory row, including nickname/nickname_address if an
 * admin has set one — VenueDetailScreen's header data source. */
export function useTheatre(theatreId: string | undefined) {
  return useQuery({
    queryKey: ["venues", "theatres", theatreId],
    queryFn: async () => {
      const { data } = await api.get<Theatre>(`/venues/theatres/${theatreId}`);
      return data;
    },
    enabled: !DEMO_MODE && !!theatreId,
  });
}

/** Aggregate ratings + punctuality for a theatre — GET
 * /venues/theatres/{id}/stats, public. 404s only when there's truly
 * nothing yet (neither ratings nor punctuality data) — surfaced as
 * `undefined` data via React Query's own 404-is-an-error-but-we-treat-
 * it-as-empty handling isn't automatic, so this catches it explicitly. */
export function useTheatreStats(theatreId: string | undefined) {
  return useQuery({
    queryKey: ["venues", "theatres", theatreId, "stats"],
    queryFn: async (): Promise<TheatreStats | null> => {
      try {
        const { data } = await api.get<TheatreStats>(`/venues/theatres/${theatreId}/stats`);
        return data;
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !DEMO_MODE && !!theatreId,
  });
}

/** Public + anonymous reviews at a theatre, newest first — GET
 * /venues/theatres/{id}/reviews, public+optional-auth, paginated. */
export function useTheatreReviews(theatreId: string | undefined, params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["venues", "theatres", theatreId, "reviews", params],
    queryFn: async () => {
      const { data } = await api.get<MovieLog[]>(`/venues/theatres/${theatreId}/reviews`, { params });
      return data;
    },
    enabled: !DEMO_MODE && !!theatreId,
  });
}

/** Every screen (auditorium) recorded for a theatre — GET
 * /venues/theatres/{id}/screens. VenueDetailScreen's "Browse screens"
 * section. */
export function useTheatreScreens(theatreId: string | undefined) {
  return useQuery({
    queryKey: ["venues", "theatres", theatreId, "screens"],
    queryFn: async () => {
      const { data } = await api.get<Screen[]>(`/venues/theatres/${theatreId}/screens`);
      return data;
    },
    enabled: !DEMO_MODE && !!theatreId,
  });
}

/** Admin-only: set/clear a theatre's nickname and/or nickname_address —
 * PATCH /venues/theatres/{id}/nickname. Not a general theatre-edit
 * endpoint (the real name/address stay Google-sourced, never editable
 * here) — see lib/venue.ts's venueDisplayName() for how the two combine
 * on read. */
export function useSetTheatreNickname(theatreId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { nickname?: string; nickname_address?: string }) => {
      const { data } = await api.patch<Theatre>(`/venues/theatres/${theatreId}/nickname`, patch);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["venues", "theatres", theatreId], data);
      qc.invalidateQueries({ queryKey: ["venues", "theatres", "match"] });
    },
  });
}

/** Aggregate ratings + punctuality for one screen — GET
 * /venues/screens/{id}/stats, public. Same shape/reasoning as
 * useTheatreStats, one level down. */
export function useScreenStats(screenId: string | undefined) {
  return useQuery({
    queryKey: ["venues", "screens", screenId, "stats"],
    queryFn: async (): Promise<ScreenStats | null> => {
      try {
        const { data } = await api.get<ScreenStats>(`/venues/screens/${screenId}/stats`);
        return data;
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !DEMO_MODE && !!screenId,
  });
}

/** Public + anonymous reviews at one screen, newest first — GET
 * /venues/screens/{id}/reviews, public+optional-auth, paginated. */
export function useScreenReviews(screenId: string | undefined, params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["venues", "screens", screenId, "reviews", params],
    queryFn: async () => {
      const { data } = await api.get<MovieLog[]>(`/venues/screens/${screenId}/reviews`, { params });
      return data;
    },
    enabled: !DEMO_MODE && !!screenId,
  });
}

// ─── Private notes (theatre/screen) ────────────────────────────────────────
//
// A standing, private-to-the-caller note about a venue — independent of
// any specific visit/log (unlike a log's own `notes` field). One per
// (user, entity); PUT again overwrites, empty text deletes it outright
// rather than PUTting an empty string (matches the movie-note hooks
// above and the backend's own DELETE endpoint for "no note").

export function useTheatreNote(theatreId: string | undefined) {
  return useQuery({
    queryKey: ["venues", "theatres", theatreId, "note"],
    queryFn: async (): Promise<VenueNote | null> => {
      if (DEMO_MODE) return null;
      try {
        const { data } = await api.get<VenueNote>(`/venues/theatres/${theatreId}/note`);
        return data;
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!theatreId,
  });
}

export function useSetTheatreNote(theatreId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) => {
      const trimmed = note.trim();
      if (!trimmed) {
        await api.delete(`/venues/theatres/${theatreId}/note`);
        return null;
      }
      const { data } = await api.put<VenueNote>(`/venues/theatres/${theatreId}/note`, { note: trimmed });
      return data;
    },
    onSuccess: (data) => qc.setQueryData(["venues", "theatres", theatreId, "note"], data),
  });
}

export function useScreenNote(screenId: string | undefined) {
  return useQuery({
    queryKey: ["venues", "screens", screenId, "note"],
    queryFn: async (): Promise<VenueNote | null> => {
      if (DEMO_MODE) return null;
      try {
        const { data } = await api.get<VenueNote>(`/venues/screens/${screenId}/note`);
        return data;
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!screenId,
  });
}

export function useSetScreenNote(screenId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) => {
      const trimmed = note.trim();
      if (!trimmed) {
        await api.delete(`/venues/screens/${screenId}/note`);
        return null;
      }
      const { data } = await api.put<VenueNote>(`/venues/screens/${screenId}/note`, { note: trimmed });
      return data;
    },
    onSuccess: (data) => qc.setQueryData(["venues", "screens", screenId, "note"], data),
  });
}
