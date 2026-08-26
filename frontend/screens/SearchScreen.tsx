/**
 * SearchScreen — pixel-accurate match to design spec.
 *
 * Web layout (padding:28px 32px 40px; max-width:820px):
 *   h1 + scope chips + "In your logs" section + "Movies" + "Theatres" + "People"
 *
 * Mobile: search bar + tabs + results list
 *
 * Scope chips actually filter results now — previously `scope` only
 * styled the active chip; the native FlatList's merged `data` array was
 * built from all three sources unconditionally, and the web "Movies"
 * section was gated on `scope === "logs"` (nonsensical — catalog movie
 * results have nothing to do with "your logs"). Movies now has its own
 * scope, matching the other three categories' shape.
 */
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MagnifyingGlass, Lock } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useMovieSearch, useVenueSearch, useCreateMovie, useCreateTheatre, useSearchPlaces } from "../hooks/useSearch";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useSearchUsers } from "../hooks/useSocial";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { PosterCard } from "../components/ui/PosterCard";
import { Avatar } from "../components/ui/Avatar";
import { SectionLoader, Spinner } from "../components/ui/Spinner";
import { tmdbPosterUrl, releaseYear } from "../lib/tmdb";
import { venueDisplayName, placesFooterLabel, randomSessionToken } from "../lib/venue";
import { avatarUrl } from "../lib/storage";
import { useToast } from "../context/ToastContext";
import type { MovieLog, TheatreMatchCandidate, TheatrePlaceSuggestion, UserSearchResult } from "../types";
import { type as fontSizes } from "../constants/fonts";

type Scope = "all" | "logs" | "movies" | "theatres" | "people";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "logs",     label: "In your logs" },
  { id: "movies",   label: "Movies" },
  { id: "theatres", label: "Theatres" },
  { id: "people",   label: "People" },
];

export function SearchScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  const { showToast } = useToast();
  const [query, setQuery]   = useState("");
  const [scope, setScope]   = useState<Scope>("all");

  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: movieResults, isLoading: moviesLoading } = useMovieSearch(debouncedQuery);
  const { data: theatreResults, isLoading: theatresLoading } = useVenueSearch(debouncedQuery);
  const { data: peopleResults, isLoading: peopleLoading } = useSearchUsers(debouncedQuery);
  const { data: logs }                                    = useMovieLogs({ archived: false });
  const { mutateAsync: createMovie } = useCreateMovie();

  // Google Places fallback, same explicit-tap shape as LogFormScreen's
  // theatre field (billed API, so a deliberate tap, not auto-fired off
  // the debounce) — SearchScreen never had an escape hatch for a theatre
  // nobody's logged yet, unlike the log form's own theatre field.
  const [placesResults, setPlacesResults] = useState<TheatrePlaceSuggestion[]>([]);
  const [placesSearched, setPlacesSearched] = useState(false);
  const [placesToken, setPlacesToken] = useState<string | null>(null);
  const searchPlaces = useSearchPlaces();
  const createTheatre = useCreateTheatre();

  const handleSearchPlaces = useCallback(async () => {
    const q = debouncedQuery.trim();
    if (q.length < 3) return;
    const token = placesToken ?? randomSessionToken();
    if (!placesToken) setPlacesToken(token);
    try {
      const results = await searchPlaces.mutateAsync({ query: q, sessionToken: token });
      setPlacesResults(results);
    } catch {
      showToast("Couldn't reach Google Places — try again", "error");
      setPlacesResults([]);
    } finally {
      setPlacesSearched(true);
    }
  }, [debouncedQuery, placesToken, searchPlaces, showToast]);

  // A bare search hit only carries a tmdb_id, not our own catalog id —
  // the movie detail route needs a real one to fetch by. Dedupes-into-
  // catalog first, same call LogFormScreen's pickMovie already makes when
  // picking a search result there (returns the existing row if this
  // tmdb_id was already linked by anyone, never creates a duplicate).
  // Dedupe-into-catalog (createMovie, above) is a real network round-trip
  // (~1s when this tmdb_id isn't already in the local catalog) — with no
  // per-row feedback, clicking a result did nothing visible until the
  // navigation landed, which reads as the app freezing. openingTmdbId
  // tracks which row is mid-flight so it can swap in a Spinner in place
  // of its poster and ignore further taps until it resolves.
  const [openingTmdbId, setOpeningTmdbId] = useState<number | null>(null);
  const openMovie = async (m: { tmdb_id: number }) => {
    if (openingTmdbId !== null) return;
    setOpeningTmdbId(m.tmdb_id);
    try {
      const movie = await createMovie(m.tmdb_id);
      if (movie) router.push(`/(app)/movie/${movie.id}` as any);
    } finally {
      setOpeningTmdbId(null);
    }
  };
  const openTheatre = (t: TheatreMatchCandidate) => router.push(`/(app)/venue/${t.id}` as any);
  // Username-only route (PublicProfileScreen resolves by username, not
  // user_id — same as every other profile link in the app) — a result
  // with no username at all can't be navigated to (shouldn't happen in
  // practice; every real account gets one via onboarding, but the type
  // is Optional to match the backend schema honestly).
  const openPerson = (p: UserSearchResult) => {
    if (p.username) router.push(`/(app)/profile/${p.username}` as any);
  };
  const openPlace = async (p: TheatrePlaceSuggestion) => {
    try {
      const theatre = await createTheatre.mutateAsync(p);
      if (theatre) router.push(`/(app)/venue/${theatre.id}` as any);
    } catch {
      showToast("Couldn't add that theatre — try again", "error");
    }
  };

  // Filter own logs by title — debouncedQuery, matching every other
  // source here (used to filter on the raw, un-debounced query, so this
  // section re-filtered on every keystroke while the others waited).
  const logMatches: MovieLog[] = debouncedQuery
    ? (logs ?? []).filter((l) => (l.movie ?? "").toLowerCase().includes(debouncedQuery.toLowerCase()))
    : [];

  const showLogs     = scope === "all" || scope === "logs";
  const showMovies   = scope === "all" || scope === "movies";
  const showTheatres = scope === "all" || scope === "theatres";
  const showPeople   = scope === "all" || scope === "people";

  const venueQueryTooShort = debouncedQuery.trim().length > 0 && debouncedQuery.trim().length < 3;

  const hasAnyResults =
    (showLogs && logMatches.length > 0) ||
    (showMovies && (movieResults?.length ?? 0) > 0) ||
    (showTheatres && (theatreResults?.length ?? 0) > 0 || placesResults.length > 0) ||
    (showPeople && (peopleResults?.length ?? 0) > 0);
  const stillLoading = (showMovies && moviesLoading) || (showTheatres && theatresLoading) || (showPeople && peopleLoading);

  const placesFooter = (
    <div className="tapc" onClick={handleSearchPlaces} style={{
      padding: "10px 0",
      borderTop: `1px solid ${theme.divider}`,
      cursor: "pointer",
      fontSize: fontSizes.sm,
      fontWeight: 600,
      color: theme.accent,
    } as React.CSSProperties}>
      {placesFooterLabel(searchPlaces.isPending, placesSearched, placesResults.length)}
    </div>
  );

  // ── Web (desktop/tablet only — narrower falls through to native) ──────────
  if (Platform.OS === "web" && !isMobile) {
    return (
      /* width:"100%" alongside maxWidth — see LibraryScreen.tsx's root div;
         same shrink-wrap-instead-of-filling bug as every other screen
         below this maxWidth+margin:auto shape. */
      <div style={{ padding: "28px 32px 40px", maxWidth: 820, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        <h1 style={{ fontSize: fontSizes.h1, fontWeight: 700, color: theme.text, margin: "0 0 20px", letterSpacing: -0.5 } as React.CSSProperties}>
          Search
        </h1>

        {/* Search input */}
        <div style={{ position: "relative", marginBottom: 20 } as React.CSSProperties}>
          <div style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
          } as React.CSSProperties}>
            <MagnifyingGlass size={16} color={`${theme.text}66`} />
          </div>
          <input
            className="input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPlacesResults([]);
              setPlacesSearched(false);
            }}
            placeholder="Search movies, logs, or people…"
            style={{ paddingLeft: 36, width: "100%", boxSizing: "border-box" } as React.CSSProperties}
            autoFocus
          />
        </div>

        {/* Scope chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" } as React.CSSProperties}>
          {SCOPES.map((s) => (
            <button
              key={s.id}
              className={scope === s.id ? "tag tag-accent" : "tag tag-neutral"}
              onClick={() => setScope(s.id)}
              style={{ cursor: "pointer", border: "none" } as React.CSSProperties}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Results */}
        {!query ? (
          <div style={{ textAlign: "center", padding: 60 } as React.CSSProperties}>
            <div style={{ fontSize: 40, marginBottom: 12 } as React.CSSProperties}>🔍</div>
            <p style={{ color: `${theme.text}44`, fontSize: fontSizes.base } as React.CSSProperties}>Type to search movies, logs, or people</p>
          </div>
        ) : (
          <>
            {/* In your logs section */}
            {showLogs && logMatches.length > 0 && (
              <div style={{ marginBottom: 28 } as React.CSSProperties}>
                <h3 style={{ fontSize: fontSizes.base, fontWeight: 700, color: theme.text, margin: "0 0 14px" } as React.CSSProperties}>
                  In your logs
                </h3>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 1fr)",
                  gap: 14,
                } as React.CSSProperties}>
                  {logMatches.slice(0, 10).map((log) => (
                    <PosterCard
                      key={log.id}
                      log={log}
                      onPress={() => router.push(`/(app)/log/${log.id}` as any)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Movie search results */}
            {showMovies && (movieResults?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 28 } as React.CSSProperties}>
                <h3 style={{ fontSize: fontSizes.base, fontWeight: 700, color: theme.text, margin: "0 0 14px" } as React.CSSProperties}>
                  Movies
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 } as React.CSSProperties}>
                  {movieResults?.slice(0, 8).map((m) => {
                    const opening = openingTmdbId === m.tmdb_id;
                    return (
                    <div key={m.tmdb_id} className="tapc" onClick={() => openMovie(m)} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "10px 0",
                      borderBottom: `1px solid ${theme.divider}`,
                      cursor: openingTmdbId !== null ? "default" : "pointer",
                      opacity: openingTmdbId !== null && !opening ? 0.5 : 1,
                    } as React.CSSProperties}>
                      <div style={{
                        width: 40,
                        height: 60,
                        borderRadius: 5,
                        flexShrink: 0,
                        display: opening ? "flex" : undefined,
                        alignItems: opening ? "center" : undefined,
                        justifyContent: opening ? "center" : undefined,
                        background: opening
                          ? theme.neutral800
                          : tmdbPosterUrl(m.poster_path)
                            ? `url(${tmdbPosterUrl(m.poster_path)}) center/cover`
                            : theme.neutral800,
                      } as React.CSSProperties}>
                        {opening && <Spinner size="sm" />}
                      </div>
                      <div style={{ flex: 1 } as React.CSSProperties}>
                        <div style={{ fontSize: fontSizes.base, fontWeight: 600, color: theme.text } as React.CSSProperties}>{m.title}</div>
                        {releaseYear(m.release_date) && (
                          <div style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 } as React.CSSProperties}>
                            {releaseYear(m.release_date)}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Theatre search results */}
            {showTheatres && (
              <div style={{ marginBottom: 28 } as React.CSSProperties}>
                <h3 style={{ fontSize: fontSizes.base, fontWeight: 700, color: theme.text, margin: "0 0 14px" } as React.CSSProperties}>
                  Theatres
                </h3>
                {venueQueryTooShort && (theatreResults?.length ?? 0) === 0 && (
                  <p style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, margin: "0 0 10px" } as React.CSSProperties}>
                    Keep typing — 3+ characters to match your library…
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 1 } as React.CSSProperties}>
                  {theatreResults?.slice(0, 8).map((t) => (
                    <div key={t.id} className="tapc" onClick={() => openTheatre(t)} style={{
                      padding: "10px 0",
                      borderBottom: `1px solid ${theme.divider}`,
                      cursor: "pointer",
                    } as React.CSSProperties}>
                      <div style={{ fontSize: fontSizes.base, fontWeight: 600, color: theme.text } as React.CSSProperties}>{venueDisplayName(t)}</div>
                      {(t.formatted_address || t.city) && (
                        <div style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 } as React.CSSProperties}>{t.formatted_address || t.city}</div>
                      )}
                    </div>
                  ))}
                  {placesResults.map((p) => (
                    <div key={p.place_id} className="tapc" onClick={() => openPlace(p)} style={{
                      padding: "10px 0",
                      borderBottom: `1px solid ${theme.divider}`,
                      cursor: "pointer",
                    } as React.CSSProperties}>
                      <div style={{ fontSize: fontSizes.base, fontWeight: 600, color: theme.text } as React.CSSProperties}>{p.main_text ?? p.description}</div>
                      <div style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 } as React.CSSProperties}>{p.secondary_text ?? "via Google"}</div>
                    </div>
                  ))}
                  {placesFooter}
                </div>
              </div>
            )}

            {/* People section */}
            {showPeople && (peopleResults?.length ?? 0) > 0 && (
              <div style={{ marginTop: 28 } as React.CSSProperties}>
                <h3 style={{ fontSize: fontSizes.base, fontWeight: 700, color: theme.text, margin: "0 0 14px" } as React.CSSProperties}>People</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 } as React.CSSProperties}>
                  {peopleResults!.map((p) => (
                    <div
                      key={p.user_id}
                      className="tapc"
                      onClick={() => openPerson(p)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 0", borderBottom: `1px solid ${theme.divider}`, cursor: "pointer",
                      } as React.CSSProperties}
                    >
                      <Avatar name={p.display_name ?? p.username ?? "?"} uri={avatarUrl(p.avatar_path)} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 } as React.CSSProperties}>
                          <span style={{ fontSize: fontSizes.base, fontWeight: 600, color: theme.text } as React.CSSProperties}>
                            {p.display_name ?? p.username}
                          </span>
                          {p.account_visibility !== "public" && <Lock size={12} color={`${theme.text}66`} />}
                        </div>
                        {p.username && (
                          <div style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 } as React.CSSProperties}>
                            @{p.username}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {showPeople && peopleLoading && (
              <div style={{ marginTop: 28 } as React.CSSProperties}>
                <h3 style={{ fontSize: fontSizes.base, fontWeight: 700, color: theme.text, margin: "0 0 14px" } as React.CSSProperties}>People</h3>
                <SectionLoader size="lg" padding={0} />
              </div>
            )}

            {!hasAnyResults && !stillLoading && (
              <div style={{ textAlign: "center", padding: 40 } as React.CSSProperties}>
                <p style={{ color: `${theme.text}44`, fontSize: fontSizes.base } as React.CSSProperties}>No results for "{query}"</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Native ───────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      {/* Search bar */}
      <View style={{ padding: 16, paddingTop: 8 }}>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.surface,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.divider,
          paddingHorizontal: 12,
          gap: 8,
        }}>
          <MagnifyingGlass size={16} color={`${theme.text}66`} />
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setPlacesResults([]);
              setPlacesSearched(false);
            }}
            placeholder="Search movies, logs, or people…"
            placeholderTextColor={`${theme.text}44`}
            style={{ flex: 1, color: theme.text, fontSize: fontSizes.md, paddingVertical: 10 }}
            autoFocus
          />
        </View>

        {/* Scope chips */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {SCOPES.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setScope(s.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 6,
                backgroundColor: scope === s.id ? theme.accent800 : theme.neutral800,
                borderWidth: 1,
                borderColor: scope === s.id ? theme.accent : "transparent",
              }}
            >
              <Text style={{
                fontSize: fontSizes.sm, fontWeight: "600",
                color: scope === s.id ? theme.accent100 : theme.neutral100,
              }}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!query ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Text style={{ fontSize: 36 }}>🔍</Text>
          <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>Type to search</Text>
        </View>
      ) : stillLoading ? (
        <SectionLoader size="lg" />
      ) : (
        <FlatList
          // A discriminated union instead of the old `"movie" in item`
          // sniff test — that only ever told a MovieLog apart from a
          // MovieSearchResult, and silently broke the moment a third
          // shape (theatre results) joined the same merged list. Each
          // source is now filtered in only when its own scope (or "all")
          // is active — this used to build the full merged list
          // unconditionally, so the scope chips only ever restyled
          // themselves and never actually filtered anything.
          data={[
            ...(showLogs ? logMatches.slice(0, 5).map((log) => ({ kind: "log" as const, log })) : []),
            ...(showMovies ? (movieResults?.slice(0, 10) ?? []).map((movie) => ({ kind: "movie" as const, movie })) : []),
            ...(showTheatres ? (theatreResults?.slice(0, 6) ?? []).map((theatre) => ({ kind: "theatre" as const, theatre })) : []),
            ...(showTheatres ? placesResults.map((place) => ({ kind: "place" as const, place })) : []),
            ...(showPeople ? (peopleResults?.slice(0, 8) ?? []).map((person) => ({ kind: "person" as const, person })) : []),
          ]}
          keyExtractor={(item, i) => `${item.kind}-${i}`}
          contentContainerStyle={{ padding: 16 }}
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base, textAlign: "center", paddingTop: 40 }}>
              No results for "{query}"
            </Text>
          }
          ListFooterComponent={
            showTheatres ? (
              <Pressable onPress={handleSearchPlaces} style={{ paddingVertical: 12 }}>
                <Text style={{ color: theme.accent, fontSize: fontSizes.sm, fontWeight: "600" }}>
                  {placesFooterLabel(searchPlaces.isPending, placesSearched, placesResults.length)}
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.kind === "log") {
              const log = item.log;
              return (
                <Pressable
                  onPress={() => router.push(`/(app)/log/${log.id}` as any)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.divider,
                  }}
                >
                  <View style={{ width: 40, height: 60, borderRadius: 5, backgroundColor: theme.neutral800 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{log.movie}</Text>
                    <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>
                      {log.format} · Your log
                    </Text>
                  </View>
                </Pressable>
              );
            }
            if (item.kind === "theatre") {
              const t = item.theatre;
              return (
                <Pressable
                  onPress={() => openTheatre(t)}
                  style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.divider }}
                >
                  <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{venueDisplayName(t)}</Text>
                  {(t.formatted_address || t.city) && <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>{t.formatted_address || t.city}</Text>}
                </Pressable>
              );
            }
            if (item.kind === "place") {
              const p = item.place;
              return (
                <Pressable
                  onPress={() => openPlace(p)}
                  style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.divider }}
                >
                  <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{p.main_text ?? p.description}</Text>
                  <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>{p.secondary_text ?? "via Google"}</Text>
                </Pressable>
              );
            }
            if (item.kind === "person") {
              const p = item.person;
              return (
                <Pressable
                  onPress={() => openPerson(p)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 12,
                    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.divider,
                  }}
                >
                  <Avatar name={p.display_name ?? p.username ?? "?"} uri={avatarUrl(p.avatar_path)} size="sm" />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>
                        {p.display_name ?? p.username}
                      </Text>
                      {p.account_visibility !== "public" && <Lock size={12} color={`${theme.text}66`} />}
                    </View>
                    {p.username && (
                      <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>@{p.username}</Text>
                    )}
                  </View>
                </Pressable>
              );
            }
            const movie = item.movie;
            const year = releaseYear(movie.release_date);
            const opening = openingTmdbId === movie.tmdb_id;
            return (
              <Pressable
                onPress={() => openMovie(movie)}
                disabled={openingTmdbId !== null}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.divider,
                  opacity: openingTmdbId !== null && !opening ? 0.5 : 1,
                }}
              >
                <View style={{ width: 40, height: 60, borderRadius: 5, backgroundColor: theme.neutral800, alignItems: "center", justifyContent: "center" }}>
                  {opening && <Spinner size="sm" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{movie.title}</Text>
                  {year && <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>{year}</Text>}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
