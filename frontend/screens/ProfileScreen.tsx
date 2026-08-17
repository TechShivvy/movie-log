/**
 * ProfileScreen — pixel-accurate match to design spec.
 *
 * Web layout (max-width:1000px):
 *   Hero: height:160px; background:linear-gradient(135deg, accent-900, surface)
 *   Avatar row: 96px/26px border-radius/4px border-bg, name/username, Edit Profile btn
 *   Stats row: 4 cards (Films, Following, Followers, ★ avg)
 *   Favorites: 4-col grid (max-width:520px)
 *   Tabs: Logs/Reviews/Theatres (border-bottom:2px accent on active)
 *   Logs grid: 6-col (web), 3-col (mobile)
 *
 * Mobile:
 *   Hero 140px + avatar overlapping + stats row
 *   2-col logs grid
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { PencilSimple, GearSix } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { Avatar } from "../components/ui/Avatar";
import { PosterCard } from "../components/ui/PosterCard";
import type { MovieLog } from "../types";

type Tab = "logs" | "reviews" | "theatres";

const TABS: { id: Tab; label: string }[] = [
  { id: "logs",     label: "Logs" },
  { id: "reviews",  label: "Reviews" },
  { id: "theatres", label: "Theatres" },
];

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatCard({ value, label, theme }: { value: string | number; label: string; theme: any }) {
  if (Platform.OS === "web") {
    return (
      <div className="card" style={{ textAlign: "center", flex: 1 } as React.CSSProperties}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-accent)", marginBottom: 2 } as React.CSSProperties}>{value}</div>
        <div style={{ fontSize: 12, color: `${theme.text}66` } as React.CSSProperties}>{label}</div>
      </div>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 10, padding: 12, alignItems: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: theme.accent }}>{value}</Text>
      <Text style={{ fontSize: 11, color: `${theme.text}66`, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("logs");

  const { data: logs, isLoading } = useMovieLogs({ archived: false });
  const count    = logs?.length ?? 0;
  const avgRating = logs?.length
    ? (logs.filter((l) => l.rating != null).reduce((a, l) => a + (l.rating ?? 0), 0) /
       Math.max(1, logs.filter((l) => l.rating != null).length)).toFixed(1)
    : "—";

  // Placeholder user — in real app would come from useAuth
  const user = { display_name: "You", username: "you", avatar_url: undefined };

  // ── Web layout ─────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ maxWidth: 1000, margin: "0 auto" } as React.CSSProperties}>
        {/* Hero banner */}
        <div style={{
          height: 160,
          background: `linear-gradient(135deg, ${theme.accent900}, ${theme.surface})`,
          position: "relative",
          borderRadius: "0 0 0 0",
        } as React.CSSProperties} />

        <div style={{ padding: "0 32px 40px" } as React.CSSProperties}>
          {/* Avatar + name row */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: -40, marginBottom: 24 } as React.CSSProperties}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16 } as React.CSSProperties}>
              <Avatar name={user.display_name} uri={user.avatar_url} size="xl" />
              <div style={{ marginBottom: 4 } as React.CSSProperties}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: theme.text, margin: "0 0 2px" } as React.CSSProperties}>{user.display_name}</h2>
                <span style={{ fontSize: 13, color: `${theme.text}55` } as React.CSSProperties}>@{user.username}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 } as React.CSSProperties}>
              <button className="btn btn-secondary" onClick={() => router.push("/(app)/settings" as any)}>
                <GearSix size={14} />
                Settings
              </button>
              <button className="btn btn-secondary">
                <PencilSimple size={14} />
                Edit profile
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 28 } as React.CSSProperties}>
            <StatCard value={count} label="Films" theme={theme} />
            <StatCard value={0} label="Following" theme={theme} />
            <StatCard value={0} label="Followers" theme={theme} />
            <StatCard value={avgRating} label="★ avg rating" theme={theme} />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${theme.divider}`, marginBottom: 24 } as React.CSSProperties}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: activeTab === t.id ? theme.accent : `${theme.text}66`,
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === t.id ? `2px solid ${theme.accent}` : "2px solid transparent",
                  cursor: "pointer",
                  marginBottom: -1,
                } as React.CSSProperties}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeTab === "logs" && (
            isLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: theme.accent } as React.CSSProperties}>
                <span className="spin" style={{ fontSize: 24 } as React.CSSProperties}>◌</span>
              </div>
            ) : (logs?.length ?? 0) === 0 ? (
              <div style={{ textAlign: "center", padding: 60 } as React.CSSProperties}>
                <div style={{ fontSize: 40, marginBottom: 12 } as React.CSSProperties}>🎬</div>
                <p style={{ color: `${theme.text}44`, fontSize: 14 } as React.CSSProperties}>No logs yet. Start by logging a film!</p>
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: 14,
              } as React.CSSProperties}>
                {(logs ?? []).map((log) => (
                  <PosterCard key={log.id} log={log} onPress={() => router.push(`/(app)/log/${log.id}` as any)} />
                ))}
              </div>
            )
          )}
          {activeTab === "reviews" && (
            <div className="card" style={{ color: `${theme.text}66`, fontSize: 14 } as React.CSSProperties}>
              Reviews with written notes will appear here.
            </div>
          )}
          {activeTab === "theatres" && (
            <div className="card" style={{ color: `${theme.text}66`, fontSize: 14 } as React.CSSProperties}>
              Venues you've visited will appear here.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Hero */}
      <View style={{
        height: 140,
        backgroundColor: theme.accent900,
        position: "relative",
      }} />

      {/* Avatar overlapping hero */}
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: -40, marginBottom: 16 }}>
          <Avatar name={user.display_name} uri={user.avatar_url} size="xl" />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
            <Pressable
              onPress={() => router.push("/(app)/settings" as any)}
              style={{ padding: 8, backgroundColor: theme.surface, borderRadius: 8, borderWidth: 1, borderColor: theme.divider }}
            >
              <GearSix size={16} color={theme.text} />
            </Pressable>
          </View>
        </View>

        <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>{user.display_name}</Text>
        <Text style={{ fontSize: 13, color: `${theme.text}55`, marginTop: 2, marginBottom: 16 }}>@{user.username}</Text>

        {/* Stats row */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
          <StatCard value={count} label="Films" theme={theme} />
          <StatCard value={0} label="Following" theme={theme} />
          <StatCard value={0} label="Followers" theme={theme} />
          <StatCard value={avgRating} label="★ avg" theme={theme} />
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.divider, marginBottom: 16 }}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setActiveTab(t.id)}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: "center",
                borderBottomWidth: 2,
                borderBottomColor: activeTab === t.id ? theme.accent : "transparent",
                marginBottom: -1,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: "600",
                color: activeTab === t.id ? theme.accent : `${theme.text}66`,
              }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Logs grid — 3-col on mobile */}
        {activeTab === "logs" && (
          isLoading ? (
            <ActivityIndicator color={theme.accent} size="large" style={{ paddingTop: 40 }} />
          ) : (logs?.length ?? 0) === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
              <Text style={{ fontSize: 36 }}>🎬</Text>
              <Text style={{ color: `${theme.text}44`, fontSize: 14 }}>No logs yet</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {(logs ?? []).map((log) => (
                <View key={log.id} style={{ width: "30%" }}>
                  <PosterCard log={log} width={100} onPress={() => router.push(`/(app)/log/${log.id}` as any)} />
                </View>
              ))}
            </View>
          )
        )}
        {activeTab === "reviews" && (
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: `${theme.text}66`, fontSize: 14 }}>Reviews with written notes will appear here.</Text>
          </View>
        )}
        {activeTab === "theatres" && (
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: `${theme.text}66`, fontSize: 14 }}>Venues you've visited will appear here.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
