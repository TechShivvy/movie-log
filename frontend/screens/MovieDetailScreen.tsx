/**
 * MovieDetailScreen — poster/title/aggregate rating header, a private
 * note, "+ Log this movie", and the three-scope log pattern shared with
 * VenueDetailScreen/ScreenDetailScreen (see ScopedLogGrid): the caller's
 * own logs of this movie, logs from people they follow, and public
 * reviews from anyone.
 *
 * One JSX tree, breakpoint-driven (see Part C of the architecture-
 * unification plan) — this screen was already "mechanical" (every visual
 * element already a shared component: Button, Poster, PrivateNoteCard,
 * ScopedLogGrid), so the old web/native fork only ever differed in
 * numeric presentational values (poster size, gaps, font-size step,
 * outer padding/max-width), now computed from `isMobile` instead of
 * `Platform.OS`. The web branch's CSS `.pulse-loading` skeleton pulse on
 * the loading-rating placeholder is dropped in favor of the plain dimmed
 * text native already used — a decorative-only difference, not worth a
 * second render path.
 */
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useNavigateOnce } from "../hooks/useNavigateOnce";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useAuth } from "../hooks/useAuth";
import { useMovie, useMovieStats, useMovieReviews, useMovieNote, useSetMovieNote } from "../hooks/useSearch";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useFeed } from "../hooks/useFeed";
import { Button } from "../components/ui/Button";
import { Poster } from "../components/ui/Poster";
import { PrivateNoteCard } from "../components/ui/PrivateNoteCard";
import { ScopedLogGrid, type LogScope } from "../components/ui/ScopedLogGrid";
import { ScreenLoader } from "../components/ui/Spinner";
import { tmdbPosterUrl, releaseYear } from "../lib/tmdb";
import type { MovieLog } from "../types";
import { type as fontSizes } from "../constants/fonts";

export function MovieDetailScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
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

  const navigateOnce = useNavigateOnce();
  const openLog = (log: MovieLog) => router.push(`/(app)/log/${log.id}` as any);
  const logThisMovie = () => navigateOnce(
    `/(app)/log/new?movieId=${encodeURIComponent(movie?.id ?? "")}&movieTitle=${encodeURIComponent(movie?.title ?? "")}&poster=${encodeURIComponent(movie?.poster_path ?? "")}` as any
  );

  const tabs = [
    { id: "mine" as LogScope, label: "Your logs", logs: mineLogs, loading: mineLoading, emptyText: "You haven't logged this yet." },
    { id: "following" as LogScope, label: "Following", logs: followingLogs, loading: followingLoading, emptyText: "No logs from people you follow yet.", signedOutText: "Sign in to see logs from people you follow." },
    { id: "public" as LogScope, label: "Public", logs: publicLogs, loading: publicLoading, emptyText: "No public reviews yet." },
  ];

  if (movieLoading) return <ScreenLoader />;
  if (!movie) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 40 }}>
        <Text style={{ fontSize: fontSizes.lg, color: theme.text }}>Movie not found.</Text>
      </View>
    );
  }

  const posterUrl = tmdbPosterUrl(movie.poster_path, "w342");
  const year = releaseYear(movie.release_date);
  const ratingText = stats?.avg_rating != null ? `★ ${stats.avg_rating.toFixed(1)}` : null;
  const posterSize = isMobile ? { width: 110, height: 165 } : { width: 200, height: 300 };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any}
      contentContainerStyle={{
        paddingTop: isMobile ? 16 : 28,
        paddingHorizontal: isMobile ? 16 : 32,
        paddingBottom: isMobile ? 100 : 40,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={{ maxWidth: isMobile ? undefined : 1000, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
        <View style={{ flexDirection: "row", gap: isMobile ? 16 : 28, marginBottom: isMobile ? 20 : 28 }}>
          <Poster title={movie.title} imageUrl={posterUrl} style={{ ...posterSize, flexShrink: 0 }} />
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Text style={{
              fontSize: isMobile ? fontSizes.xxl : fontSizes.h1,
              fontWeight: "700",
              color: theme.text,
              marginBottom: isMobile ? 4 : 6,
              letterSpacing: isMobile ? undefined : -0.5,
            }}>
              {movie.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: isMobile ? 10 : 12, marginBottom: isMobile ? 14 : 20 }}>
              {year && <Text style={{ fontSize: isMobile ? fontSizes.sm : fontSizes.base, color: `${theme.text}88` }}>{year}</Text>}
              {statsLoading ? (
                <Text style={{ fontSize: isMobile ? fontSizes.sm : fontSizes.base, color: `${theme.text}44` }}>★ …</Text>
              ) : ratingText ? (
                <Text style={{ fontSize: isMobile ? fontSizes.sm : fontSizes.base, color: theme.accent, fontWeight: "600" }}>
                  {ratingText} <Text style={{ color: `${theme.text}66`, fontWeight: "400" }}>({stats!.rating_count})</Text>
                </Text>
              ) : null}
            </View>
            <Button label="Log this movie" icon="plus" onPress={logThisMovie} style={{ alignSelf: "flex-start" }} />
          </View>
        </View>

        <PrivateNoteCard note={note} loading={noteLoading} saving={setNote.isPending} onSave={(text) => setNote.mutate(text)} />

        <ScopedLogGrid tabs={tabs} onLogPress={openLog} isSignedIn={!!user} />
      </View>
    </ScrollView>
  );
}
