/**
 * ProfileScreen — one JSX tree, breakpoint-driven (see Part C of the
 * architecture-unification plan). Was a near-complete web/native fork;
 * StatCard/TheatreRow were duplicated per platform for visually identical
 * output, and the hero banner hand-built a CSS background+gradient on
 * web instead of the Image+LinearGradient technique the native branch
 * already used (expo-linear-gradient is genuinely cross-platform — see
 * Poster.tsx, which already renders it inside its own web branch — so
 * there was never a technical reason for the two implementations).
 *
 * The one deliberate remaining Platform.OS branch is the poster grid
 * itself: PosterCard's own web rendering relies on being inside a real
 * CSS Grid track for its width (see that file's own header comment —
 * it has its own legitimate hover-vs-touch overlay split, out of scope
 * here), so this screen still hands it a CSS grid on web vs a
 * percentage-width flexWrap on native. Everything else — hero, avatar/
 * name row, action buttons (now the same icon-only pair on both
 * platforms, per the plan's call), bio, stats row, tabs, empty states —
 * is one shared render path with breakpoint-driven sizing.
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
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { PencilSimple, GearSix, CaretRight } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useAuth } from "../hooks/useAuth";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useMyProfile } from "../hooks/useProfile";
import { useFollowers, useFollowing } from "../hooks/useSocial";
import { avatarUrl, bannerUrl } from "../lib/storage";
import { Avatar } from "../components/ui/Avatar";
import { PosterCard } from "../components/ui/PosterCard";
import { EditProfileModal } from "../components/profile/EditProfileModal";
import { ImageLightbox } from "../components/ui/ImageLightbox";
import { SectionLoader } from "../components/ui/Spinner";
import type { MovieLog } from "../types";
import { type as fontSizes } from "../constants/fonts";

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
  return (
    <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 10, padding: 12, alignItems: "center" }}>
      <Text style={{ fontSize: fontSizes.xxl, fontWeight: "700", color: theme.accent, opacity: isLoading ? 0.5 : 1 }}>{display}</Text>
      <Text style={{ fontSize: fontSizes.xs, color: `${theme.text}66`, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Theatre row ────────────────────────────────────────────────────────────

function TheatreRow({ t, theme, onPress }: { t: VisitedTheatre; theme: any; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.divider }}>
      <View>
        <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{t.name}</Text>
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>{t.visitCount} {t.visitCount === 1 ? "visit" : "visits"}</Text>
      </View>
      <CaretRight size={16} color={`${theme.text}44`} />
    </Pressable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("logs");
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lightbox, setLightbox] = useState<string | undefined>(undefined);

  const { data: profile, isLoading: isProfileLoading } = useMyProfile();
  // isLoading (only true on the genuine first fetch — react-query v5's
  // isPending && isFetching), not isFetching — isFetching also flips
  // true on every background revalidation (staleTime expiring, window
  // refocus, the default refetchOnWindowFocus), which repeatedly
  // re-triggered the loading pulse on data that was already sitting
  // there and valid to show as-is while it silently refreshed.
  const { data: followers, isLoading: isFollowersLoading } = useFollowers(profile?.username);
  const { data: following, isLoading: isFollowingLoading } = useFollowing(profile?.username);
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

  const heroHeight = isMobile ? 140 : 160;
  const heroFade = isMobile ? 100 : 110;
  const gridCols = isMobile ? 3 : 6;

  const content = (
    <View style={{ paddingHorizontal: isMobile ? 16 : 32, paddingBottom: isMobile ? 100 : 40 }}>
      {/* Avatar + name row — flexWrap so the button group drops to its own
          line rather than colliding with a long name at narrow widths;
          minWidth:0 + numberOfLines on the name so an oversized fallback
          name (the raw email-local-part, easily 20-30+ chars) truncates
          instead of overflowing past the buttons or off the screen. */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: -40, marginBottom: 12, opacity: isProfileLoading ? 0.6 : 1 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 16, minWidth: 0, flex: 1 }}>
          <Pressable onPress={avatar ? () => setLightbox(avatar) : undefined} disabled={!avatar}>
            <Avatar name={displayName} uri={avatar} size="xl" />
          </Pressable>
          <View style={{ marginBottom: 4, minWidth: 0, flexShrink: 1 }}>
            {/* While the profile fetch is still in flight, show a plain
                "Loading…" instead of the un-annotated email-handle
                fallback — that fallback is only a correct final answer
                once we actually know there's no real display_name/
                username to show, not before. */}
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: isMobile ? fontSizes.xl : fontSizes.xxl, fontWeight: "700", color: theme.text }}>
              {isProfileLoading ? "Loading…" : displayName}
            </Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>
              {isProfileLoading ? "" : `@${username}`}
            </Text>
            {/* Deliberate "View as" escape hatch (same idea as Slack's) —
                landing on your own /profile/{username} any other way (a
                typed URL, an old link, finding yourself in People
                search) redirects straight back here instead, so this
                link is the one intentional door into seeing your own
                profile the way a stranger/follower would. */}
            {!isProfileLoading && profile?.username && (
              <Pressable onPress={() => router.push(`/(app)/profile/${profile.username}?preview=1` as any)} style={{ marginTop: 2, alignSelf: "flex-start" }}>
                <Text style={{ fontSize: fontSizes.xs, color: theme.accent }}>Preview as others see it</Text>
              </Pressable>
            )}
          </View>
        </View>
        {/* Icon-only action pair on both platforms — was a text-labeled
            .btn-secondary duo on web and this same icon-only square pair
            on native; adopted native's version everywhere (a wide desktop
            tooltip could label them later, but two matching icons is
            already unambiguous next to a profile header). */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4, flexShrink: 0 }}>
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

      {bio && <Text style={{ fontSize: fontSizes.base, color: `${theme.text}99`, lineHeight: 20, marginBottom: isMobile ? 16 : 20 }}>{bio}</Text>}

      {/* Stats row */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: isMobile ? 24 : 28 }}>
        <StatCard value={count} label="Films" theme={theme} isLoading={isLoading} />
        <StatCard value={following?.length ?? 0} label="Following" theme={theme} isLoading={isProfileLoading || isFollowingLoading} />
        <StatCard value={followers?.length ?? 0} label="Followers" theme={theme} isLoading={isProfileLoading || isFollowersLoading} />
        <StatCard value={avgRating} label={isMobile ? "★ avg" : "★ avg rating"} theme={theme} isLoading={isLoading} />
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.divider, marginBottom: isMobile ? 16 : 24 }}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setActiveTab(t.id)}
            style={{
              flex: isMobile ? 1 : undefined,
              paddingHorizontal: isMobile ? undefined : 16,
              paddingVertical: 10,
              alignItems: "center",
              borderBottomWidth: 2,
              borderBottomColor: activeTab === t.id ? theme.accent : "transparent",
              marginBottom: -1,
            }}
          >
            <Text style={{ fontSize: isMobile ? fontSizes.sm : fontSizes.base, fontWeight: "600", color: activeTab === t.id ? theme.accent : `${theme.text}66` }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <SectionLoader />
      ) : activeTab === "theatres" ? (
        theatres.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 8 }}>
            <Text style={{ fontSize: 40 }}>🎦</Text>
            <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>No theatres linked to your logs yet.</Text>
          </View>
        ) : (
          <View>
            {theatres.map((t) => (
              <TheatreRow key={t.theatreId} t={t} theme={theme} onPress={() => openVenue(t.theatreId)} />
            ))}
          </View>
        )
      ) : logsForTab.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 60, gap: 8 }}>
          <Text style={{ fontSize: 40 }}>🎬</Text>
          <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base, textAlign: "center" }}>
            {activeTab === "favorites" ? "No favorites yet — star up to 4 logs from their detail page." : "No logs yet. Start by logging a film!"}
          </Text>
        </View>
      ) : Platform.OS === "web" && !isMobile ? (
        // PosterCard's own web branch sizes itself off a real CSS Grid
        // track (see its header comment) — the one deliberate technique
        // split left in this screen, everything around it is shared.
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 14 } as React.CSSProperties}>
          {logsForTab.map((log) => (
            <PosterCard key={log.id} log={log} onPress={() => openLog(log.id)} />
          ))}
        </div>
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
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={isMobile ? undefined : { alignItems: "center" }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
    >
      <View style={{ maxWidth: isMobile ? undefined : 1000, width: "100%" }}>
        {/* Hero — bottom fade into theme.bg so the flat banner rectangle
            (real image, or the accent900→surface gradient fallback) doesn't
            just stop dead against the page background below it. Multiple
            color/location stops instead of a plain 2-stop fade — a
            straight-line ramp against real image detail (as opposed to a
            flat color) still reads as an abrupt cut; easing in gradually
            across more stops looks like a genuine soft fade instead. */}
        <View style={{ height: heroHeight, position: "relative", overflow: "hidden" }}>
          {banner ? (
            <Pressable onPress={() => setLightbox(banner)} style={{ width: "100%", height: "100%" }}>
              <Image source={{ uri: banner }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            </Pressable>
          ) : (
            <LinearGradient colors={[theme.accent900, theme.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: "100%", height: "100%" }} />
          )}
          <LinearGradient
            colors={[`${theme.bg}00`, `${theme.bg}00`, `${theme.bg}40`, `${theme.bg}cc`, theme.bg]}
            locations={[0, 0.15, 0.45, 0.75, 1]}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: heroFade }}
            pointerEvents="none"
          />
        </View>

        {content}
      </View>

      <EditProfileModal visible={editing} profile={profile ?? null} onClose={() => setEditing(false)} />
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(undefined)} />
    </ScrollView>
  );
}
