/**
 * SearchScreen — one JSX tree, breakpoint-driven (see Part C of the
 * architecture-unification plan). Was a genuinely different information
 * architecture per platform: web grouped results into headed sections
 * ("In your logs" / "Movies" / "Theatres" / "People"), native flattened
 * everything into one merged FlatList with no section context at all —
 * and the two had drifted onto different per-section result caps
 * (10/8/8/unlimited on web vs 5/10/6/8 on native) as a direct symptom of
 * maintaining two copies. Adopted the sectioned IA for both (richer,
 * clearer for heterogeneous result kinds — a flat list loses which
 * section each row belongs to for no real benefit) and one shared set of
 * caps. The one deliberate remaining Platform.OS split is "In your
 * logs"'s poster grid, same reason as ProfileScreen/VenueDetailScreen's
 * own grids: PosterCard's web rendering depends on a real CSS Grid
 * ancestor for its width (see that file's own header comment).
 */
import React, { useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
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
import { Poster } from "../components/ui/Poster";
import { Avatar } from "../components/ui/Avatar";
import { Tag } from "../components/ui/Tag";
import { SectionLoader, Spinner } from "../components/ui/Spinner";
import { tmdbPosterUrl, releaseYear } from "../lib/tmdb";
import { venueDisplayName, placesFooterLabel, randomSessionToken } from "../lib/venue";
import { avatarUrl } from "../lib/storage";
import { useToast } from "../context/ToastContext";
import type { MovieLog, MovieSearchResult, TheatreMatchCandidate, TheatrePlaceSuggestion, UserSearchResult } from "../types";
import { type as fontSizes } from "../constants/fonts";

type Scope = "all" | "logs" | "movies" | "theatres" | "people";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "logs",     label: "In your logs" },
  { id: "movies",   label: "Movies" },
  { id: "theatres", label: "Theatres" },
  { id: "people",   label: "People" },
];

// One shared cap per section — was 10/8/8/unlimited on web, 5/10/6/8 on
// native, a real drift from maintaining two lists independently, not a
// deliberate design difference.
const CAPS = { logs: 10, movies: 8, theatres: 8, people: 8 };

function SectionHeading({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <Text style={{ fontSize: fontSizes.base, fontWeight: "700", color: theme.text, marginBottom: 14 }}>{children}</Text>;
}

function ResultRow({ title, subtitle, onPress, theme, leading, trailing }: {
  title: React.ReactNode; subtitle?: string; onPress: () => void; theme: any;
  leading?: React.ReactNode; trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.divider }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === "string" ? (
          <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{title}</Text>
        ) : title}
        {subtitle && <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {trailing}
    </Pressable>
  );
}

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

  function renderMovieRow(m: MovieSearchResult) {
    const opening = openingTmdbId === m.tmdb_id;
    return (
      <ResultRow
        key={m.tmdb_id}
        theme={theme}
        onPress={() => openMovie(m)}
        title={m.title}
        subtitle={releaseYear(m.release_date) ?? undefined}
        leading={
          <Poster title={m.title} imageUrl={opening ? undefined : tmdbPosterUrl(m.poster_path)} style={{ width: 40, height: 60, flexShrink: 0 }}>
            {opening && (
              <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" } as any}>
                <Spinner size="sm" />
              </View>
            )}
          </Poster>
        }
      />
    );
  }

  function renderTheatreRow(t: TheatreMatchCandidate) {
    return (
      <ResultRow
        key={t.id}
        theme={theme}
        onPress={() => openTheatre(t)}
        title={venueDisplayName(t)}
        subtitle={t.formatted_address || t.city || undefined}
      />
    );
  }

  function renderPlaceRow(p: TheatrePlaceSuggestion) {
    return (
      <ResultRow
        key={p.place_id}
        theme={theme}
        onPress={() => openPlace(p)}
        title={p.main_text ?? p.description}
        subtitle={p.secondary_text ?? "via Google"}
      />
    );
  }

  function renderPersonRow(p: UserSearchResult) {
    return (
      <ResultRow
        key={p.user_id}
        theme={theme}
        onPress={() => openPerson(p)}
        leading={<Avatar name={p.display_name ?? p.username ?? "?"} uri={avatarUrl(p.avatar_path)} size="sm" />}
        title={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{p.display_name ?? p.username}</Text>
            {p.account_visibility !== "public" && <Lock size={12} color={`${theme.text}66`} />}
          </View>
        }
        subtitle={p.username ? `@${p.username}` : undefined}
      />
    );
  }

  const placesFooter = (
    <Pressable onPress={handleSearchPlaces} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.divider }}>
      <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: theme.accent }}>
        {placesFooterLabel(searchPlaces.isPending, placesSearched, placesResults.length)}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingTop: isMobile ? 8 : 28, paddingHorizontal: isMobile ? 16 : 32, paddingBottom: isMobile ? 100 : 40 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={{ maxWidth: isMobile ? undefined : 820, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
        {!isMobile && (
          <Text style={{ fontSize: fontSizes.h1, fontWeight: "700", color: theme.text, marginBottom: 20, letterSpacing: -0.5 }}>
            Search
          </Text>
        )}

        {/* Search input */}
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 8,
          backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.divider,
          paddingHorizontal: 12, marginBottom: isMobile ? 12 : 20,
        }}>
          <MagnifyingGlass size={16} color={`${theme.text}66`} />
          <TextInput
            value={query}
            onChangeText={(t) => { setQuery(t); setPlacesResults([]); setPlacesSearched(false); }}
            placeholder="Search movies, logs, or people…"
            placeholderTextColor={`${theme.text}44`}
            style={{ flex: 1, color: theme.text, fontSize: fontSizes.md, paddingVertical: isMobile ? 10 : 9 }}
            autoFocus
          />
        </View>

        {/* Scope chips */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: isMobile ? 16 : 24 }}>
          {SCOPES.map((s) => (
            <Pressable key={s.id} onPress={() => setScope(s.id)}>
              <Tag variant={scope === s.id ? "accent" : "neutral"} label={s.label} />
            </Pressable>
          ))}
        </View>

        {!query ? (
          <View style={{ alignItems: "center", paddingVertical: isMobile ? 80 : 60 }}>
            <Text style={{ fontSize: isMobile ? 36 : 40, marginBottom: 12 }}>🔍</Text>
            <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>
              {isMobile ? "Type to search" : "Type to search movies, logs, or people"}
            </Text>
          </View>
        ) : (
          <>
            {/* In your logs — grid keeps its Platform.OS split (PosterCard's
                web rendering needs a real CSS Grid ancestor for its width;
                see ProfileScreen.tsx's identical note). */}
            {showLogs && logMatches.length > 0 && (
              <View style={{ marginBottom: 28 }}>
                <SectionHeading theme={theme}>In your logs</SectionHeading>
                {Platform.OS === "web" && !isMobile ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 } as React.CSSProperties}>
                    {logMatches.slice(0, CAPS.logs).map((log) => (
                      <PosterCard key={log.id} log={log} onPress={() => router.push(`/(app)/log/${log.id}` as any)} />
                    ))}
                  </div>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {logMatches.slice(0, CAPS.logs).map((log) => (
                      <View key={log.id} style={{ width: "30%" }}>
                        <PosterCard log={log} width={100} onPress={() => router.push(`/(app)/log/${log.id}` as any)} />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {showMovies && (movieResults?.length ?? 0) > 0 && (
              <View style={{ marginBottom: 28 }}>
                <SectionHeading theme={theme}>Movies</SectionHeading>
                {movieResults!.slice(0, CAPS.movies).map(renderMovieRow)}
              </View>
            )}

            {showTheatres && (
              <View style={{ marginBottom: 28 }}>
                <SectionHeading theme={theme}>Theatres</SectionHeading>
                {venueQueryTooShort && (theatreResults?.length ?? 0) === 0 && (
                  <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginBottom: 10 }}>
                    Keep typing — 3+ characters to match your library…
                  </Text>
                )}
                {theatreResults?.slice(0, CAPS.theatres).map(renderTheatreRow)}
                {placesResults.map(renderPlaceRow)}
                {placesFooter}
              </View>
            )}

            {showPeople && (peopleResults?.length ?? 0) > 0 && (
              <View style={{ marginTop: 28 }}>
                <SectionHeading theme={theme}>People</SectionHeading>
                {peopleResults!.slice(0, CAPS.people).map(renderPersonRow)}
              </View>
            )}
            {showPeople && peopleLoading && (
              <View style={{ marginTop: 28 }}>
                <SectionHeading theme={theme}>People</SectionHeading>
                <SectionLoader size="lg" padding={0} />
              </View>
            )}

            {!hasAnyResults && !stillLoading && (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>No results for "{query}"</Text>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
