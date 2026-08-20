/**
 * ProfileScreen — pixel-accurate match to design spec.
 *
 * Web layout (max-width:1000px):
 *   Hero: height:160px; background:linear-gradient(135deg, accent-900, surface)
 *   Avatar row: 96px/26px border-radius/4px border-bg, name/username, Edit Profile btn
 *   Stats row: 4 cards (Films, Following, Followers, ★ avg)
 *   Tabs: Logs/Favorites/Theatres (border-bottom:2px accent on active)
 *   Logs grid: 6-col (web), 3-col (mobile)
 *
 * Mobile:
 *   Hero 140px + avatar overlapping + stats row
 *   2-col logs grid
 *
 * Tabs redesigned from the original Logs/Reviews/Theatres: "Reviews" was
 * just "logs with notes in them" - a filtered subset of Logs, not a
 * distinct category, and "Theatres" was a permanent stub ("Venues you've
 * visited will appear here."). Favorites (favorite_position, a real
 * backend feature - PUT/DELETE /movie-logs/{id}/favorite, capped at 4)
 * had zero UI anywhere despite this file's own header comment describing
 * a "Favorites" section that was never actually built - that's the
 * natural replacement for Reviews. Theatres is now real: grouped
 * client-side from the same own-logs list already fetched here, no
 * extra request, one card per distinct theatre_id linking to its detail
 * page.
 */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { PencilSimple, GearSix, CaretRight } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useMyProfile } from "../hooks/useProfile";
import { useFollowers, useFollowing } from "../hooks/useSocial";
import { avatarUrl, bannerUrl } from "../lib/storage";
import { Avatar } from "../components/ui/Avatar";
import { PosterCard } from "../components/ui/PosterCard";
import { EditProfileModal } from "../components/profile/EditProfileModal";
import type { MovieLog } from "../types";

type Tab = "logs" | "favorites" | "theatres";

const TABS: { id: Tab; label: string }[] = [
  { id: "logs",      label: "Logs" },
  { id: "favorites", label: "Favorites" },
  { id: "theatres",  label: "Theatres" },
];

// One row per distinct theatre_id among the caller's own logs — the
// theatre's own real name isn't fetched here (no extra request); the
// most recent visit's own free-typed `theater` text stands in for
// display, same as every other place a log surfaces a venue name
// without a dedicated theatre fetch.
interface VisitedTheatre {
  theatreId: string;
  name: string;
  visitCount: number;
}

function groupTheatres(logs: MovieLog[]): VisitedTheatre[] {
  const byId = new Map<string, VisitedTheatre>();
  for (const log of logs) {
    if (!log.theatre_id) continue;
    const existing = byId.get(log.theatre_id);
    if (existing) {
      existing.visitCount += 1;
    } else {
      byId.set(log.theatre_id, { theatreId: log.theatre_id, name: log.theater || "Unnamed theatre", visitCount: 1 });
    }
  }
  return [...byId.values()].sort((a, b) => b.visitCount - a.visitCount);
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

// isLoading shows "…" instead of the real value — a stat that hasn't
// resolved yet used to render as a bare 0, indistinguishable from a
// real zero (a brand-new account genuinely has 0 followers, but "we
// don't know yet" and "the answer is zero" read identically without
// this, and the flash from placeholder-0 to a real number the moment
// each query resolves looked like the page silently reloaded itself).
function StatCard({ value, label, theme, isLoading }: { value: string | number; label: string; theme: any; isLoading?: boolean }) {
  const display = isLoading ? "…" : value;
  if (Platform.OS === "web") {
    return (
      <div className="card" style={{ textAlign: "center", flex: 1 } as React.CSSProperties}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-accent)", marginBottom: 2, opacity: isLoading ? 0.5 : 1 } as React.CSSProperties}>{display}</div>
        <div style={{ fontSize: 12, color: `${theme.text}66` } as React.CSSProperties}>{label}</div>
      </div>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 10, padding: 12, alignItems: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: theme.accent, opacity: isLoading ? 0.5 : 1 }}>{display}</Text>
      <Text style={{ fontSize: 11, color: `${theme.text}66`, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Theatre row ────────────────────────────────────────────────────────────

function TheatreRow({ t, theme, onPress }: { t: VisitedTheatre; theme: any; onPress: () => void }) {
  if (Platform.OS === "web") {
    return (
      <div className="tapc" onClick={onPress} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 0", borderBottom: `1px solid ${theme.divider}`, cursor: "pointer",
      } as React.CSSProperties}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.text } as React.CSSProperties}>{t.name}</div>
          <div style={{ fontSize: 12, color: `${theme.text}55`, marginTop: 2 } as React.CSSProperties}>
            {t.visitCount} {t.visitCount === 1 ? "visit" : "visits"}
          </div>
        </div>
        <CaretRight size={16} color={`${theme.text}44`} />
      </div>
    );
  }
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.divider }}>
      <View>
        <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{t.name}</Text>
        <Text style={{ fontSize: 12, color: `${theme.text}55`, marginTop: 2 }}>{t.visitCount} {t.visitCount === 1 ? "visit" : "visits"}</Text>
      </View>
      <CaretRight size={16} color={`${theme.text}44`} />
    </Pressable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("logs");
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data: profile, isLoading: isProfileLoading } = useMyProfile();
  const { data: followers, isFetching: isFollowersLoading } = useFollowers(profile?.username);
  const { data: following, isFetching: isFollowingLoading } = useFollowing(profile?.username);
  const { data: logs, isLoading, refetch } = useMovieLogs({ archived: false });
  const count    = logs?.length ?? 0;
  const avgRating = logs?.length
    ? (logs.filter((l) => l.rating != null).reduce((a, l) => a + (l.rating ?? 0), 0) /
       Math.max(1, logs.filter((l) => l.rating != null).length)).toFixed(1)
    : "—";

  const favorites = useMemo(
    () => (logs ?? []).filter((l) => l.favorite_position != null).sort((a, b) => (a.favorite_position ?? 0) - (b.favorite_position ?? 0)),
    [logs]
  );
  const theatres = useMemo(() => groupTheatres(logs ?? []), [logs]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  // profile is null until GET /public/me/profile responds (or forever, if
  // that endpoint isn't deployed yet — see hooks/useProfile.ts). Falls
  // back to the same session.user.user_metadata.full_name Sidebar.tsx
  // already uses (populated by Google OAuth at sign-in) before the raw
  // email-local-part, so this screen shows the same name as the sidebar
  // instead of a different, uglier fallback next to it.
  const metadataName = authUser?.user_metadata?.full_name as string | undefined;
  const emailHandle = authUser?.email?.split("@")[0];
  const displayName = profile?.display_name || metadataName || profile?.username || emailHandle || "You";
  const username = profile?.username || emailHandle || "—";
  const bio = profile?.bio;
  const avatar = avatarUrl(profile?.avatar_path);
  const banner = bannerUrl(profile?.banner_path);

  const openLog = (id: string) => router.push(`/(app)/log/${id}` as any);
  const openVenue = (id: string) => router.push(`/(app)/venue/${id}` as any);

  const logsForTab = activeTab === "favorites" ? favorites : logs ?? [];

  // ── Web layout ─────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      // width:"100%" alongside maxWidth — see LibraryScreen.tsx's root div;
      // same shrink-wrap-instead-of-filling bug as every other screen
      // below this maxWidth+margin:auto shape. "You"/"@you" name block and
      // the Settings/Edit profile buttons, meant to sit at opposite ends
      // of a wide space-between row, ended up crushed together on the
      // left with barely a gap without it.
      <div style={{ maxWidth: 1000, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        {/* Hero banner */}
        <div style={{
          height: 160,
          background: banner ? `url(${banner}) center/cover no-repeat` : `linear-gradient(135deg, ${theme.accent900}, ${theme.surface})`,
          position: "relative",
        } as React.CSSProperties} />

        <div style={{ padding: "0 32px 40px" } as React.CSSProperties}>
          {/* Avatar + name row — flexWrap so the button group drops to its
              own line rather than colliding with a long name at narrow
              widths; minWidth:0 + ellipsis on the name block so an
              oversized fallback name (the raw email-local-part, which can
              easily run 20-30+ characters) truncates instead of
              overflowing past the buttons or off the screen entirely. */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: -40, marginBottom: 12 } as React.CSSProperties}>
            <div className={isProfileLoading ? "pulse-loading" : undefined} style={{ display: "flex", alignItems: "flex-end", gap: 16, minWidth: 0, flex: "1 1 240px" } as React.CSSProperties}>
              <Avatar name={displayName} uri={avatar} size="xl" />
              <div style={{ marginBottom: 4, minWidth: 0, overflow: "hidden" } as React.CSSProperties}>
                {/* While the profile fetch is still in flight, show a
                    plain "Loading…" instead of the un-annotated
                    email-handle fallback — that fallback is only a
                    correct final answer once we actually know there's
                    no real display_name/username to show, not before. */}
                <h2 style={{ fontSize: 22, fontWeight: 700, color: theme.text, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties}>
                  {isProfileLoading ? "Loading…" : displayName}
                </h2>
                <span style={{ fontSize: 13, color: `${theme.text}55`, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties}>
                  {isProfileLoading ? "" : `@${username}`}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 4, flexShrink: 0 } as React.CSSProperties}>
              <button className="btn btn-secondary" onClick={() => router.push("/(app)/settings" as any)}>
                <GearSix size={14} />
                Settings
              </button>
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                <PencilSimple size={14} />
                Edit profile
              </button>
            </div>
          </div>

          {bio && <p style={{ fontSize: 14, color: `${theme.text}99`, lineHeight: 1.5, margin: "0 0 20px" } as React.CSSProperties}>{bio}</p>}

          {/* Stats row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 28 } as React.CSSProperties}>
            <StatCard value={count} label="Films" theme={theme} isLoading={isLoading} />
            <StatCard value={following?.length ?? 0} label="Following" theme={theme} isLoading={isProfileLoading || isFollowingLoading} />
            <StatCard value={followers?.length ?? 0} label="Followers" theme={theme} isLoading={isProfileLoading || isFollowersLoading} />
            <StatCard value={avgRating} label="★ avg rating" theme={theme} isLoading={isLoading} />
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
          {isLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: theme.accent } as React.CSSProperties}>
              <span className="spin" style={{ fontSize: 24 } as React.CSSProperties}>◌</span>
            </div>
          ) : activeTab === "theatres" ? (
            theatres.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60 } as React.CSSProperties}>
                <div style={{ fontSize: 40, marginBottom: 12 } as React.CSSProperties}>🎦</div>
                <p style={{ color: `${theme.text}44`, fontSize: 14 } as React.CSSProperties}>No theatres linked to your logs yet.</p>
              </div>
            ) : (
              <div>
                {theatres.map((t) => (
                  <TheatreRow key={t.theatreId} t={t} theme={theme} onPress={() => openVenue(t.theatreId)} />
                ))}
              </div>
            )
          ) : logsForTab.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60 } as React.CSSProperties}>
              <div style={{ fontSize: 40, marginBottom: 12 } as React.CSSProperties}>🎬</div>
              <p style={{ color: `${theme.text}44`, fontSize: 14 } as React.CSSProperties}>
                {activeTab === "favorites" ? "No favorites yet — star up to 4 logs from their detail page." : "No logs yet. Start by logging a film!"}
              </p>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 14,
            } as React.CSSProperties}>
              {logsForTab.map((log) => (
                <PosterCard key={log.id} log={log} onPress={() => openLog(log.id)} />
              ))}
            </div>
          )}
        </div>
        <EditProfileModal visible={editing} profile={profile ?? null} onClose={() => setEditing(false)} />
      </div>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "transparent" }}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
    >
      {/* Hero */}
      <View style={{
        height: 140,
        backgroundColor: theme.accent900,
        position: "relative",
      }}>
        {banner && <Image source={{ uri: banner }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />}
      </View>

      {/* Avatar overlapping hero */}
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: -40, marginBottom: 16 }}>
          <Avatar name={displayName} uri={avatar} size="xl" />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
            <Pressable
              onPress={() => setEditing(true)}
              style={{ padding: 8, backgroundColor: theme.surface, borderRadius: 8, borderWidth: 1, borderColor: theme.divider }}
            >
              <PencilSimple size={16} color={theme.text} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/(app)/settings" as any)}
              style={{ padding: 8, backgroundColor: theme.surface, borderRadius: 8, borderWidth: 1, borderColor: theme.divider }}
            >
              <GearSix size={16} color={theme.text} />
            </Pressable>
          </View>
        </View>

        {/* numberOfLines — an oversized fallback name (raw email-local-part,
            easily 20-30+ chars) had no truncation at all here and just
            ran past the screen edge at phone width. */}
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 18, fontWeight: "700", color: theme.text, opacity: isProfileLoading ? 0.5 : 1 }}>
          {isProfileLoading ? "Loading…" : displayName}
        </Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 13, color: `${theme.text}55`, marginTop: 2, marginBottom: bio ? 8 : 16 }}>
          {isProfileLoading ? "" : `@${username}`}
        </Text>
        {bio && <Text style={{ fontSize: 14, color: `${theme.text}99`, lineHeight: 20, marginBottom: 16 }}>{bio}</Text>}

        {/* Stats row */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
          <StatCard value={count} label="Films" theme={theme} isLoading={isLoading} />
          <StatCard value={following?.length ?? 0} label="Following" theme={theme} isLoading={isProfileLoading || isFollowingLoading} />
          <StatCard value={followers?.length ?? 0} label="Followers" theme={theme} isLoading={isProfileLoading || isFollowersLoading} />
          <StatCard value={avgRating} label="★ avg" theme={theme} isLoading={isLoading} />
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

        {/* Content */}
        {isLoading ? (
          <ActivityIndicator color={theme.accent} size="large" style={{ paddingTop: 40 }} />
        ) : activeTab === "theatres" ? (
          theatres.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
              <Text style={{ fontSize: 36 }}>🎦</Text>
              <Text style={{ color: `${theme.text}44`, fontSize: 14 }}>No theatres linked to your logs yet.</Text>
            </View>
          ) : (
            <View>
              {theatres.map((t) => (
                <TheatreRow key={t.theatreId} t={t} theme={theme} onPress={() => openVenue(t.theatreId)} />
              ))}
            </View>
          )
        ) : logsForTab.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
            <Text style={{ fontSize: 36 }}>🎬</Text>
            <Text style={{ color: `${theme.text}44`, fontSize: 14 }}>
              {activeTab === "favorites" ? "No favorites yet" : "No logs yet"}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {logsForTab.map((log) => (
              <View key={log.id} style={{ width: "30%" }}>
                <PosterCard log={log} width={100} onPress={() => openLog(log.id)} />
              </View>
            ))}
          </View>
        )}
      </View>
      <EditProfileModal visible={editing} profile={profile ?? null} onClose={() => setEditing(false)} />
    </ScrollView>
  );
}
