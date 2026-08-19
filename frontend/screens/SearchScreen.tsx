/**
 * SearchScreen — pixel-accurate match to design spec.
 *
 * Web layout (padding:28px 32px 40px; max-width:820px):
 *   h1 + scope chips + "In your logs" section + "People" section
 *
 * Mobile: search bar + tabs + results list
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MagnifyingGlass } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useMovieSearch } from "../hooks/useSearch";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { PosterCard } from "../components/ui/PosterCard";
import { tmdbPosterUrl, releaseYear } from "../lib/tmdb";
import type { MovieLog } from "../types";

type Scope = "all" | "logs" | "people";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all",    label: "All" },
  { id: "logs",   label: "In your logs" },
  { id: "people", label: "People" },
];

export function SearchScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [query, setQuery]   = useState("");
  const [scope, setScope]   = useState<Scope>("all");

  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: movieResults, isLoading: moviesLoading } = useMovieSearch(debouncedQuery);
  const { data: logs }                                    = useMovieLogs({ archived: false });

  // Filter own logs by title
  const logMatches: MovieLog[] = query
    ? (logs ?? []).filter((l) => (l.movie ?? "").toLowerCase().includes(query.toLowerCase()))
    : [];

  // ── Web ─────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      /* width:"100%" alongside maxWidth — see LibraryScreen.tsx's root div;
         same shrink-wrap-instead-of-filling bug as every other screen
         below this maxWidth+margin:auto shape. */
      <div style={{ padding: "28px 32px 40px", maxWidth: 820, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: theme.text, margin: "0 0 20px", letterSpacing: -0.5 } as React.CSSProperties}>
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, logs, or people…"
            style={{ paddingLeft: 36, width: "100%", boxSizing: "border-box" } as React.CSSProperties}
            autoFocus
          />
        </div>

        {/* Scope chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 } as React.CSSProperties}>
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
            <p style={{ color: `${theme.text}44`, fontSize: 14 } as React.CSSProperties}>Type to search movies, logs, or people</p>
          </div>
        ) : (
          <>
            {/* In your logs section */}
            {(scope === "all" || scope === "logs") && logMatches.length > 0 && (
              <div style={{ marginBottom: 28 } as React.CSSProperties}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: "0 0 14px" } as React.CSSProperties}>
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
            {(scope === "all" || scope === "logs") && (movieResults?.length ?? 0) > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: "0 0 14px" } as React.CSSProperties}>
                  Movies
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 } as React.CSSProperties}>
                  {movieResults?.slice(0, 8).map((m) => (
                    <div key={m.tmdb_id} className="tapc" style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "10px 0",
                      borderBottom: `1px solid ${theme.divider}`,
                      cursor: "pointer",
                    } as React.CSSProperties}>
                      <div style={{
                        width: 40,
                        height: 60,
                        borderRadius: 5,
                        flexShrink: 0,
                        background: tmdbPosterUrl(m.poster_path)
                          ? `url(${tmdbPosterUrl(m.poster_path)}) center/cover`
                          : theme.neutral800,
                      } as React.CSSProperties} />
                      <div style={{ flex: 1 } as React.CSSProperties}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text } as React.CSSProperties}>{m.title}</div>
                        {releaseYear(m.release_date) && (
                          <div style={{ fontSize: 12, color: `${theme.text}55`, marginTop: 2 } as React.CSSProperties}>
                            {releaseYear(m.release_date)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* People section */}
            {(scope === "all" || scope === "people") && (
              <div style={{ marginTop: 28 } as React.CSSProperties}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: "0 0 14px" } as React.CSSProperties}>People</h3>
                <div className="card" style={{ color: `${theme.text}55`, fontSize: 13 } as React.CSSProperties}>
                  People search — coming soon.
                </div>
              </div>
            )}

            {logMatches.length === 0 && (movieResults?.length ?? 0) === 0 && !moviesLoading && (
              <div style={{ textAlign: "center", padding: 40 } as React.CSSProperties}>
                <p style={{ color: `${theme.text}44`, fontSize: 14 } as React.CSSProperties}>No results for "{query}"</p>
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
            onChangeText={setQuery}
            placeholder="Search movies, logs…"
            placeholderTextColor={`${theme.text}44`}
            style={{ flex: 1, color: theme.text, fontSize: 15, paddingVertical: 10 }}
            autoFocus
          />
        </View>

        {/* Scope chips */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
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
                fontSize: 12, fontWeight: "600",
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
          <Text style={{ color: `${theme.text}44`, fontSize: 14 }}>Type to search</Text>
        </View>
      ) : moviesLoading ? (
        <View style={{ flex: 1, alignItems: "center", paddingTop: 40 }}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={[...logMatches.slice(0, 5), ...(movieResults?.slice(0, 10) ?? [])]}
          keyExtractor={(item, i) => `${i}`}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <Text style={{ color: `${theme.text}44`, fontSize: 14, textAlign: "center", paddingTop: 40 }}>
              No results for "{query}"
            </Text>
          }
          renderItem={({ item }) => {
            // Check if it's a MovieLog or MovieSearchResult
            if ("movie" in item) {
              const log = item as MovieLog;
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
                    <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{log.movie}</Text>
                    <Text style={{ fontSize: 12, color: `${theme.text}55`, marginTop: 2 }}>
                      {log.format} · Your log
                    </Text>
                  </View>
                </Pressable>
              );
            }
            const movie = item as any;
            const year = releaseYear(movie.release_date);
            return (
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: theme.divider,
              }}>
                <View style={{ width: 40, height: 60, borderRadius: 5, backgroundColor: theme.neutral800 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{movie.title}</Text>
                  {year && <Text style={{ fontSize: 12, color: `${theme.text}55`, marginTop: 2 }}>{year}</Text>}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
