/**
 * VenueDetailScreen — theatre home page: name (nickname-aware), address,
 * map, status badge, aggregate ratings, a private note, browsable screens,
 * admin nickname editing, and the same three-scope log pattern as
 * MovieDetailScreen (see ScopedLogGrid).
 */
import React, { useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MapPin, PencilSimple, Star } from "phosphor-react-native";
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
  return Platform.OS === "web" ? (
    <span className="tag" style={{ background: `${color}22`, color, fontWeight: 600 } as React.CSSProperties}>{label}</span>
  ) : (
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

  const header = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" } as React.CSSProperties}>
        <h1 style={{ fontSize: fontSizes.h2, fontWeight: 700, color: theme.text, margin: 0, letterSpacing: -0.5 } as React.CSSProperties}>
          {displayName}
        </h1>
        <StatusBadge status={theatre.status} theme={theme} />
        {me?.is_admin && (
          <button className="btn btn-secondary" style={{ marginLeft: "auto", fontSize: fontSizes.sm } as React.CSSProperties} onClick={startEditNickname}>
            <PencilSimple size={13} />
            Edit nickname
          </button>
        )}
      </div>
      {theatre.chain && <div style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginBottom: 4 } as React.CSSProperties}>{theatre.chain}</div>}
      {displayAddress && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: fontSizes.sm, color: `${theme.text}88`, marginBottom: 16 } as React.CSSProperties}>
          <MapPin size={14} color={`${theme.text}66`} style={{ marginTop: 2, flexShrink: 0 } as any} />
          {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" } as React.CSSProperties}>{displayAddress}</a> : displayAddress}
        </div>
      )}
      {statsLoading ? (
        <div className="pulse-loading" style={{ marginBottom: 16, fontSize: fontSizes.sm, color: `${theme.text}44` } as React.CSSProperties}>★ overall rating …</div>
      ) : ratingText ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: fontSizes.md, color: theme.accent, fontWeight: 600 } as React.CSSProperties}>
          ★ {ratingText}
          <span style={{ color: `${theme.text}66`, fontWeight: 400, fontSize: fontSizes.sm } as React.CSSProperties}>overall rating</span>
        </div>
      ) : null}
      {editingNickname && (
        <div className="card" style={{ marginBottom: 16 } as React.CSSProperties}>
          <div style={{ fontSize: fontSizes.sm, color: `${theme.text}88`, marginBottom: 8 } as React.CSSProperties}>
            Nickname is an alternate label shown instead of "{theatre.name}" — not a correction, only visible when set.
          </div>
          <input className="input" value={nicknameDraft} onChange={(e) => setNicknameDraft(e.target.value)} placeholder="Nickname" style={{ marginBottom: 8 } as React.CSSProperties} />
          <input className="input" value={addressDraft} onChange={(e) => setAddressDraft(e.target.value)} placeholder="Alternate address" style={{ marginBottom: 10 } as React.CSSProperties} />
          <div style={{ display: "flex", gap: 8 } as React.CSSProperties}>
            <button className="btn btn-primary" onClick={saveNickname} disabled={setNickname.isPending}>Save</button>
            <button className="btn btn-secondary" onClick={() => setEditingNickname(false)}>Cancel</button>
          </div>
        </div>
      )}
      {embedUrl && (
        <iframe
          src={embedUrl}
          style={{ width: "100%", height: 220, border: "none", borderRadius: 12, marginBottom: 20 } as React.CSSProperties}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
        />
      )}
    </>
  );

  const screensSection = (
    <div style={{ marginBottom: 28 } as React.CSSProperties}>
      <h3 style={{ fontSize: fontSizes.base, fontWeight: 700, color: theme.text, margin: "0 0 12px" } as React.CSSProperties}>Screens</h3>
      {screensLoading ? null : (screens?.length ?? 0) === 0 ? (
        <div style={{ color: `${theme.text}55`, fontSize: fontSizes.sm } as React.CSSProperties}>No screens recorded yet.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 } as React.CSSProperties}>
          {screens!.map((s) => (
            <div key={s.id} className="tag tag-neutral tapc" onClick={() => openScreen(s)} style={{ cursor: "pointer" } as React.CSSProperties}>
              {s.name}{s.screen_type ? ` · ${s.screen_type}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Web (desktop/tablet only — narrower falls through to native) ──────────
  if (Platform.OS === "web" && !isMobile) {
    return (
      <div style={{ padding: "28px 32px 40px", maxWidth: 1000, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        {header}
        <PrivateNoteCard note={note} loading={noteLoading} saving={setNote.isPending} onSave={(text) => setNote.mutate(text)} />
        {screensSection}
        <ScopedLogGrid tabs={tabs} onLogPress={openLog} isSignedIn={!!user} />
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <Text style={{ fontSize: fontSizes.xxl, fontWeight: "700", color: theme.text, flexShrink: 1 }}>{displayName}</Text>
        <StatusBadge status={theatre.status} theme={theme} />
      </View>
      {theatre.chain && <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginBottom: 4 }}>{theatre.chain}</Text>}
      {displayAddress && (
        <Pressable onPress={() => mapsUrl && Linking.openURL(mapsUrl)} style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
          <MapPin size={14} color={`${theme.text}66`} style={{ marginTop: 2 }} />
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}88`, flex: 1 }}>{displayAddress}</Text>
        </Pressable>
      )}
      {statsLoading ? (
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}44`, marginBottom: 16 }}>★ overall rating …</Text>
      ) : ratingText ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <Star size={16} color={theme.accent} weight="fill" />
          <Text style={{ fontSize: fontSizes.md, color: theme.accent, fontWeight: "700" }}>{ratingText}</Text>
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66` }}>overall rating</Text>
        </View>
      ) : null}
      {me?.is_admin && !editingNickname && (
        <Pressable onPress={startEditNickname} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <PencilSimple size={13} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: fontSizes.sm, fontWeight: "600" }}>Edit nickname</Text>
        </Pressable>
      )}
      {editingNickname && (
        <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, marginBottom: 16 }}>
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

      <PrivateNoteCard note={note} loading={noteLoading} saving={setNote.isPending} onSave={(text) => setNote.mutate(text)} />

      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: fontSizes.base, fontWeight: "700", color: theme.text, marginBottom: 10 }}>Screens</Text>
        {screensLoading ? null : (screens?.length ?? 0) === 0 ? (
          <Text style={{ color: `${theme.text}55`, fontSize: fontSizes.sm }}>No screens recorded yet.</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {screens!.map((s) => (
              <Pressable key={s.id} onPress={() => openScreen(s)} style={{ backgroundColor: theme.surfaceHigh, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 }}>
                <Text style={{ color: theme.text, fontSize: fontSizes.sm }}>{s.name}{s.screen_type ? ` · ${s.screen_type}` : ""}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <ScopedLogGrid tabs={tabs} onLogPress={openLog} isSignedIn={!!user} />
    </ScrollView>
  );
}

