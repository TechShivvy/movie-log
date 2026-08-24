/**
 * ScreenDetailScreen — one auditorium within a theatre. Same pattern as
 * VenueDetailScreen one level down: name/type/status, aggregate ratings,
 * a private note, and the three-scope log pattern (see ScopedLogGrid) —
 * no nickname editing (nicknames are theatre-only) and no nested browse
 * (a screen doesn't contain further screens).
 */
import React from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useAuth } from "../hooks/useAuth";
import { useTheatre, useScreenStats, useScreenReviews, useTheatreScreens, useScreenNote, useSetScreenNote } from "../hooks/useSearch";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useFeed } from "../hooks/useFeed";
import { PrivateNoteCard } from "../components/ui/PrivateNoteCard";
import { ScopedLogGrid, type LogScope } from "../components/ui/ScopedLogGrid";
import { ScreenLoader } from "../components/ui/Spinner";
import { venueDisplayName } from "../lib/venue";
import type { MovieLog } from "../types";
import { type as fontSizes } from "../constants/fonts";

export function ScreenDetailScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  const { user } = useAuth();
  const { id, screenId } = useLocalSearchParams<{ id: string; screenId: string }>();

  // No GET /venues/screens/{id} exists (only a list-by-theatre) — the
  // theatre's own screens list is the source for this screen's name/type/
  // status, same data useTheatreScreens already fetches for
  // VenueDetailScreen's "Browse screens" section.
  const { data: theatre } = useTheatre(id);
  const { data: screens, isLoading: screenLoading } = useTheatreScreens(id);
  const screen = screens?.find((s) => s.id === screenId);

  const { data: stats, isLoading: statsLoading } = useScreenStats(screenId);
  const { data: mineLogs, isLoading: mineLoading } = useMovieLogs({ screenId });
  const { data: followingLogs, isLoading: followingLoading } = useFeed({ screenId, limit: 50 });
  const { data: publicLogs, isLoading: publicLoading } = useScreenReviews(screenId);
  const { data: note, isLoading: noteLoading } = useScreenNote(screenId);
  const setNote = useSetScreenNote(screenId);

  const openLog = (log: MovieLog) => router.push(`/(app)/log/${log.id}` as any);

  const tabs = [
    { id: "mine" as LogScope, label: "Your logs", logs: mineLogs, loading: mineLoading, emptyText: "You haven't logged a visit here yet." },
    { id: "following" as LogScope, label: "Following", logs: followingLogs, loading: followingLoading, emptyText: "No logs from people you follow yet.", signedOutText: "Sign in to see logs from people you follow." },
    { id: "public" as LogScope, label: "Public", logs: publicLogs, loading: publicLoading, emptyText: "No public reviews yet." },
  ];

  if (screenLoading) return <ScreenLoader />;
  if (!screen) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 40 }}>
        <Text style={{ fontSize: fontSizes.lg, color: theme.text }}>Screen not found.</Text>
      </View>
    );
  }

  const ratingText = stats?.overall_avg != null ? stats.overall_avg.toFixed(1) : null;
  const theatreName = theatre ? venueDisplayName(theatre) : undefined;

  // ── Web (desktop/tablet only — narrower falls through to native) ──────────
  if (Platform.OS === "web" && !isMobile) {
    return (
      <div style={{ padding: "28px 32px 40px", maxWidth: 1000, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        {theatreName && (
          <a href={`/venue/${id}`} style={{ fontSize: fontSizes.sm, color: theme.accent, textDecoration: "none" } as React.CSSProperties}>
            ← {theatreName}
          </a>
        )}
        <h1 style={{ fontSize: fontSizes.h2, fontWeight: 700, color: theme.text, margin: "6px 0 4px", letterSpacing: -0.5 } as React.CSSProperties}>
          {screen.name}
        </h1>
        {screen.screen_type && <div style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginBottom: 12 } as React.CSSProperties}>{screen.screen_type}</div>}
        {statsLoading ? (
          <div className="pulse-loading" style={{ marginBottom: 20, fontSize: fontSizes.sm, color: `${theme.text}44` } as React.CSSProperties}>★ overall rating …</div>
        ) : ratingText ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: fontSizes.md, color: theme.accent, fontWeight: 600 } as React.CSSProperties}>
            ★ {ratingText}
            <span style={{ color: `${theme.text}66`, fontWeight: 400, fontSize: fontSizes.sm } as React.CSSProperties}>overall rating</span>
          </div>
        ) : null}

        <PrivateNoteCard note={note} loading={noteLoading} saving={setNote.isPending} onSave={(text) => setNote.mutate(text)} />

        <ScopedLogGrid tabs={tabs} onLogPress={openLog} isSignedIn={!!user} />
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} contentInsetAdjustmentBehavior="automatic">
      {theatreName && (
        <Text
          onPress={() => router.push(`/(app)/venue/${id}` as any)}
          style={{ fontSize: fontSizes.sm, color: theme.accent, marginBottom: 4 }}
        >
          ← {theatreName}
        </Text>
      )}
      <Text style={{ fontSize: fontSizes.xxl, fontWeight: "700", color: theme.text, marginBottom: 4 }}>{screen.name}</Text>
      {screen.screen_type && <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginBottom: 10 }}>{screen.screen_type}</Text>}
      {statsLoading ? (
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}44`, marginBottom: 16 }}>★ overall rating …</Text>
      ) : ratingText ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <Text style={{ fontSize: fontSizes.md, color: theme.accent, fontWeight: "700" }}>★ {ratingText}</Text>
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66` }}>overall rating</Text>
        </View>
      ) : null}

      <PrivateNoteCard note={note} loading={noteLoading} saving={setNote.isPending} onSave={(text) => setNote.mutate(text)} />

      <ScopedLogGrid tabs={tabs} onLogPress={openLog} isSignedIn={!!user} />
    </ScrollView>
  );
}
