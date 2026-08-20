/**
 * MovieDetailScreen — poster/title/aggregate rating header, a private
 * note, "+ Log this movie", and the three-scope log pattern shared with
 * VenueDetailScreen/ScreenDetailScreen (see ScopedLogGrid): the caller's
 * own logs of this movie, logs from people they follow, and public
 * reviews from anyone.
 */
import React from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";
import { useMovie, useMovieStats, useMovieReviews, useMovieNote, useSetMovieNote } from "../hooks/useSearch";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useFeed } from "../hooks/useFeed";
import { Poster } from "../components/ui/Poster";
import { PrivateNoteCard } from "../components/ui/PrivateNoteCard";
import { ScopedLogGrid, type LogScope } from "../components/ui/ScopedLogGrid";
import { tmdbPosterUrl, releaseYear } from "../lib/tmdb";
import type { MovieLog } from "../types";

export function MovieDetailScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: movie, isLoading: movieLoading } = useMovie(id);
  const { data: stats, isLoading: statsLoading } = useMovieStats(id);
  const { data: mineLogs, isLoading: mineLoading } = useMovieLogs({ movieId: id });
  const { data: followingLogs, isLoading: followingLoading } = useFeed({ movieId: id, limit: 50 });
  const { data: publicLogs, isLoading: publicLoading } = useMovieReviews(id);
  const { data: note, isLoading: noteLoading } = useMovieNote(id);
  const setNote = useSetMovieNote(id);

  const openLog = (log: MovieLog) => router.push(`/(app)/log/${log.id}` as any);
  const logThisMovie = () => router.push(
    `/(app)/log/new?movieId=${encodeURIComponent(movie?.id ?? "")}&movieTitle=${encodeURIComponent(movie?.title ?? "")}&poster=${encodeURIComponent(movie?.poster_path ?? "")}` as any
  );

  const tabs = [
    { id: "mine" as LogScope, label: "Your logs", logs: mineLogs, loading: mineLoading, emptyText: "You haven't logged this yet." },
    { id: "following" as LogScope, label: "Following", logs: followingLogs, loading: followingLoading, emptyText: "No logs from people you follow yet.", signedOutText: "Sign in to see logs from people you follow." },
    { id: "public" as LogScope, label: "Public", logs: publicLogs, loading: publicLoading, emptyText: "No public reviews yet." },
  ];

  if (movieLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        {Platform.OS === "web"
          ? <span className="spin" style={{ fontSize: 28, color: theme.accent } as React.CSSProperties}>◌</span>
          : <Text style={{ color: theme.text }}>Loading…</Text>}
      </View>
    );
  }
  if (!movie) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 40 }}>
        <Text style={{ fontSize: 16, color: theme.text }}>Movie not found.</Text>
      </View>
    );
  }

  const posterUrl = tmdbPosterUrl(movie.poster_path, "w342");
  const year = releaseYear(movie.release_date);
  const ratingText = stats?.avg_rating != null ? `★ ${stats.avg_rating.toFixed(1)}` : null;

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ padding: "28px 32px 40px", maxWidth: 1000, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        <div style={{ display: "flex", gap: 28, marginBottom: 28 } as React.CSSProperties}>
          <Poster title={movie.title} imageUrl={posterUrl} style={{ width: 200, aspectRatio: "2/3", flexShrink: 0 } as React.CSSProperties} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end" } as React.CSSProperties}>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: theme.text, margin: "0 0 6px", letterSpacing: -0.5 } as React.CSSProperties}>
              {movie.title}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, fontSize: 14, color: `${theme.text}88` } as React.CSSProperties}>
              {year && <span>{year}</span>}
              {statsLoading ? (
                <span className="pulse-loading" style={{ color: `${theme.text}44` } as React.CSSProperties}>★ …</span>
              ) : ratingText ? (
                <span style={{ color: theme.accent, fontWeight: 600 } as React.CSSProperties}>
                  {ratingText} <span style={{ color: `${theme.text}66`, fontWeight: 400 } as React.CSSProperties}>({stats!.rating_count})</span>
                </span>
              ) : null}
            </div>
            <button className="btn btn-primary" style={{ width: "fit-content" } as React.CSSProperties} onClick={logThisMovie}>
              <Plus size={15} weight="bold" />
              Log this movie
            </button>
          </div>
        </div>

        <PrivateNoteCard note={note} loading={noteLoading} saving={setNote.isPending} onSave={(text) => setNote.mutate(text)} />

        <ScopedLogGrid tabs={tabs} onLogPress={openLog} isSignedIn={!!user} />
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
      <View style={{ flexDirection: "row", gap: 16, marginBottom: 20 }}>
        <Poster title={movie.title} imageUrl={posterUrl} style={{ width: 110, height: 165, flexShrink: 0 }} />
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: theme.text, marginBottom: 4 }}>{movie.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
            {year && <Text style={{ fontSize: 13, color: `${theme.text}88` }}>{year}</Text>}
            {statsLoading ? (
              <Text style={{ fontSize: 13, color: `${theme.text}44` }}>★ …</Text>
            ) : ratingText ? (
              <Text style={{ fontSize: 13, color: theme.accent, fontWeight: "600" }}>
                {ratingText} <Text style={{ color: `${theme.text}66`, fontWeight: "400" }}>({stats!.rating_count})</Text>
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={logThisMovie}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignSelf: "flex-start" }}
          >
            <Plus size={15} weight="bold" color="#fff" />
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Log this movie</Text>
          </Pressable>
        </View>
      </View>

      <PrivateNoteCard note={note} loading={noteLoading} saving={setNote.isPending} onSave={(text) => setNote.mutate(text)} />

      <ScopedLogGrid tabs={tabs} onLogPress={openLog} isSignedIn={!!user} />
    </ScrollView>
  );
}
