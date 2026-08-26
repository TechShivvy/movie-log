/**
 * VenueDetailScreen — theatre home page: name (nickname-aware), address,
 * map, status badge, aggregate ratings, a private note, browsable screens,
 * admin nickname editing, and the same three-scope log pattern as
 * MovieDetailScreen (see ScopedLogGrid).
 *
 * One JSX tree, breakpoint-driven (see Part C of the architecture-
 * unification plan). Two deliberate, minimal Platform.OS branches remain,
 * both genuine capability differences, not accidental drift:
 *   - the address: a real `<a target="_blank">` on web (opens Maps in a
 *     new tab, Cmd/Ctrl-click works) vs Pressable + Linking.openURL on
 *     native — same pattern as ScreenDetailScreen's back-link
 *   - the map: a plain `<iframe>` on web vs `react-native-webview`'s
 *     WebView on native (that package has no web implementation at all —
 *     confirmed via its own source, which renders a plain "does not
 *     support this platform" fallback there — so this was never
 *     something to unify away, exactly the case the plan calls out:
 *     "a native WebView vs a web <iframe> for the same embedded map")
 * The nickname-edit form used to be a second, hand-rolled implementation
 * on web (raw <input>/<button> + a .card div) instead of the shared
 * Input/Button the native branch already used correctly — unified onto
 * that. The "Screens" chips used to be a CSS-class `<div>` on web and a
 * hand-styled Pressable+View pill on native for the same visual job the
 * shared Tag component already does — now both platforms wrap Tag in a
 * Pressable. StatusBadge's per-status colors don't fit any of Tag's
 * fixed variants (accent/outline/neutral), so it stays its own small
 * component — collapsed to one render path like everything else here.
 */
import React, { useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MapPin, PencilSimple } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import {
  useTheatre, useTheatreStats, useTheatreReviews, useTheatreScreens,
  useTheatreNote, useSetTheatreNote, useSetTheatreNickname,
} from "../hooks/useSearch";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useFeed } from "../hooks/useFeed";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Tag } from "../components/ui/Tag";
import { PrivateNoteCard } from "../components/ui/PrivateNoteCard";
import { ScopedLogGrid, type LogScope } from "../components/ui/ScopedLogGrid";
import { ScreenLoader } from "../components/ui/Spinner";
import { venueDisplayName, venueMapsUrl, venueMapsEmbedUrl } from "../lib/venue";
import type { MovieLog, Screen } from "../types";
import { type as fontSizes } from "../constants/fonts";

const STATUS_LABEL: Record<string, string> = { open: "Open", closed: "Closed", renovation: "Renovation" };

function StatusBadge({ status, theme }: { status: string; theme: any }) {
  const color = status === "open" ? "#4CAF50" : status === "closed" ? theme.error : theme.accent;
  const label = STATUS_LABEL[status] ?? status;
  return (
    <View style={{ backgroundColor: `${color}22`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: fontSizes.xs, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export function VenueDetailScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  const { user } = useAuth();
  const { data: me } = useMe();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: theatre, isLoading: theatreLoading } = useTheatre(id);
  const { data: stats, isLoading: statsLoading } = useTheatreStats(id);
  const { data: screens, isLoading: screensLoading } = useTheatreScreens(id);
  const { data: mineLogs, isLoading: mineLoading } = useMovieLogs({ theatreId: id });
  const { data: followingLogs, isLoading: followingLoading } = useFeed({ theatreId: id, limit: 50 });
  const { data: publicLogs, isLoading: publicLoading } = useTheatreReviews(id);
  const { data: note, isLoading: noteLoading } = useTheatreNote(id);
  const setNote = useSetTheatreNote(id);
  const setNickname = useSetTheatreNickname(id);

  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [addressDraft, setAddressDraft] = useState("");

  const openLog = (log: MovieLog) => router.push(`/(app)/log/${log.id}` as any);
  const openScreen = (screen: Screen) => router.push(`/(app)/venue/${id}/screen/${screen.id}` as any);

  const tabs = [
    { id: "mine" as LogScope, label: "Your logs", logs: mineLogs, loading: mineLoading, emptyText: "You haven't logged a visit here yet." },
    { id: "following" as LogScope, label: "Following", logs: followingLogs, loading: followingLoading, emptyText: "No logs from people you follow yet.", signedOutText: "Sign in to see logs from people you follow." },
    { id: "public" as LogScope, label: "Public", logs: publicLogs, loading: publicLoading, emptyText: "No public reviews yet." },
  ];

  if (theatreLoading) return <ScreenLoader />;
  if (!theatre) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 40 }}>
        <Text style={{ fontSize: fontSizes.lg, color: theme.text }}>Theatre not found.</Text>
      </View>
    );
  }

  const displayName = venueDisplayName(theatre);
  const displayAddress = theatre.nickname_address || theatre.formatted_address;
  const mapsUrl = venueMapsUrl(theatre);
  const embedUrl = venueMapsEmbedUrl(theatre);
  const ratingText = stats?.overall_avg != null ? stats.overall_avg.toFixed(1) : null;
  const pad = isMobile ? 16 : 32;
  const mapHeight = isMobile ? 180 : 220;

  const startEditNickname = () => {
    setNicknameDraft(theatre.nickname ?? "");
    setAddressDraft(theatre.nickname_address ?? "");
    setEditingNickname(true);
  };
  const saveNickname = () => {
    setNickname.mutate(
      { nickname: nicknameDraft.trim(), nickname_address: addressDraft.trim() },
      { onSuccess: () => setEditingNickname(false) }
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingTop: isMobile ? 16 : 28, paddingHorizontal: pad, paddingBottom: isMobile ? 100 : 40 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={{ maxWidth: isMobile ? undefined : 1000, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <Text style={{ fontSize: isMobile ? fontSizes.xxl : fontSizes.h2, fontWeight: "700", color: theme.text, letterSpacing: isMobile ? undefined : -0.5, flexShrink: 1 }}>
            {displayName}
          </Text>
          <StatusBadge status={theatre.status} theme={theme} />
          {me?.is_admin && !isMobile && (
            <Button
              variant="secondary"
              icon="pencil-simple"
              label="Edit nickname"
              onPress={startEditNickname}
              style={{ marginLeft: "auto" }}
            />
          )}
        </View>
        {theatre.chain && <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginBottom: 4 }}>{theatre.chain}</Text>}

        {displayAddress && (
          Platform.OS === "web" ? (
            <a
              href={mapsUrl ?? undefined}
              target={mapsUrl ? "_blank" : undefined}
              rel={mapsUrl ? "noreferrer" : undefined}
              style={{
                display: "flex", alignItems: "flex-start", gap: 6, marginBottom: isMobile ? 14 : 16,
                fontSize: fontSizes.sm, color: `${theme.text}88`, textDecoration: "none", cursor: mapsUrl ? "pointer" : "default",
              } as React.CSSProperties}
            >
              <MapPin size={14} color={`${theme.text}66`} style={{ marginTop: 2, flexShrink: 0 } as any} />
              {displayAddress}
            </a>
          ) : (
            <Pressable onPress={() => mapsUrl && Linking.openURL(mapsUrl)} style={{ flexDirection: "row", gap: 6, marginBottom: isMobile ? 14 : 16 }}>
              <MapPin size={14} color={`${theme.text}66`} style={{ marginTop: 2 }} />
              <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}88`, flex: 1 }}>{displayAddress}</Text>
            </Pressable>
          )
        )}

        {statsLoading ? (
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}44`, marginBottom: isMobile ? 14 : 16 }}>★ overall rating …</Text>
        ) : ratingText ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: isMobile ? 14 : 16 }}>
            <Text style={{ fontSize: fontSizes.md, color: theme.accent, fontWeight: "700" }}>★ {ratingText}</Text>
            <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66` }}>overall rating</Text>
          </View>
        ) : null}

        {me?.is_admin && isMobile && !editingNickname && (
          <Pressable onPress={startEditNickname} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
            <PencilSimple size={13} color={theme.accent} />
            <Text style={{ color: theme.accent, fontSize: fontSizes.sm, fontWeight: "600" }}>Edit nickname</Text>
          </Pressable>
        )}

        {editingNickname && (
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: isMobile ? 14 : 16, marginBottom: 16 }}>
            <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}88`, marginBottom: 8 }}>
              Nickname is an alternate label shown instead of "{theatre.name}" — not a correction, only visible when set.
            </Text>
            <View style={{ gap: 8 }}>
              <Input value={nicknameDraft} onChangeText={setNicknameDraft} placeholder="Nickname" />
              <Input value={addressDraft} onChangeText={setAddressDraft} placeholder="Alternate address" />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Button label="Save" onPress={saveNickname} loading={setNickname.isPending} />
              <Button label="Cancel" variant="secondary" onPress={() => setEditingNickname(false)} />
            </View>
          </View>
        )}

        {embedUrl && (
          Platform.OS === "web" ? (
            <iframe
              src={embedUrl}
              style={{ width: "100%", height: mapHeight, border: "none", borderRadius: 12, marginBottom: 20 } as React.CSSProperties}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
            />
          ) : (
            <View style={{ height: mapHeight, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
              <WebView source={{ uri: embedUrl }} style={{ flex: 1 }} />
            </View>
          )
        )}

        <PrivateNoteCard note={note} loading={noteLoading} saving={setNote.isPending} onSave={(text) => setNote.mutate(text)} />

        <View style={{ marginBottom: isMobile ? 20 : 28 }}>
          <Text style={{ fontSize: fontSizes.base, fontWeight: "700", color: theme.text, marginBottom: isMobile ? 10 : 12 }}>Screens</Text>
          {screensLoading ? null : (screens?.length ?? 0) === 0 ? (
            <Text style={{ color: `${theme.text}55`, fontSize: fontSizes.sm }}>No screens recorded yet.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {screens!.map((s) => (
                <Pressable key={s.id} onPress={() => openScreen(s)}>
                  <Tag variant="neutral" label={`${s.name}${s.screen_type ? ` · ${s.screen_type}` : ""}`} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <ScopedLogGrid tabs={tabs} onLogPress={openLog} isSignedIn={!!user} />
      </View>
    </ScrollView>
  );
}
