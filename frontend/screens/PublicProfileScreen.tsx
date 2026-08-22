/**
 * PublicProfileScreen — someone ELSE's profile (own profile is
 * ProfileScreen.tsx, a different screen with edit/settings affordances
 * this one deliberately doesn't have). Header (banner/avatar/bio), a
 * Follow button, and their visible logs — scoped to view + follow for
 * this pass, not full parity with the own-profile screen.
 */
import React, { useState } from "react";
import { Image, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useAuth } from "../hooks/useAuth";
import { usePublicProfile, useFollowers, useFollowUser } from "../hooks/useSocial";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { PosterCard } from "../components/ui/PosterCard";
import { ImageLightbox } from "../components/ui/ImageLightbox";
import { avatarUrl, bannerUrl } from "../lib/storage";
import type { MovieLog } from "../types";
import { type as fontSizes } from "../constants/fonts";

export function PublicProfileScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  const { user } = useAuth();
  const { username } = useLocalSearchParams<{ username: string }>();

  const { data, isLoading, refetch } = usePublicProfile(username);
  const { data: followers } = useFollowers(username);
  const followUser = useFollowUser();
  const [refreshing, setRefreshing] = useState(false);
  const [lightbox, setLightbox] = useState<string | undefined>(undefined);

  const profile = data?.profile;
  const logs = data?.logs ?? [];
  const isFollowing = !!followers?.some((f) => f.user_id === user?.id);
  const isOwnProfile = !!profile && profile.user_id === user?.id;

  const openLog = (log: MovieLog) => router.push(`/(app)/log/${log.id}` as any);
  const toggleFollow = () => {
    if (!username) return;
    followUser.mutate({ username, following: isFollowing });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        {Platform.OS === "web"
          ? <span className="spin" style={{ fontSize: 28, color: theme.accent } as React.CSSProperties}>◌</span>
          : <Text style={{ color: theme.text }}>Loading…</Text>}
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 40 }}>
        <Text style={{ fontSize: fontSizes.lg, color: theme.text }}>User not found.</Text>
      </View>
    );
  }

  const banner = bannerUrl(profile.banner_path);
  const avatar = avatarUrl(profile.avatar_path);
  const displayName = profile.display_name || profile.username;

  const header = (
    <>
      {/* Bottom fade into theme.bg — same fix as ProfileScreen.tsx's own
          hero, same reasoning: a flat banner rectangle otherwise just
          stops dead against the page background below it. More stops
          than a plain 2-stop fade, same reasoning as ProfileScreen.tsx:
          a straight-line ramp against real image detail still reads as
          an abrupt cut; easing in gradually looks like a genuine soft
          fade instead. */}
      <div
        onClick={banner ? () => setLightbox(banner) : undefined}
        style={{
          height: 160,
          background: banner ? `url(${banner}) center/cover no-repeat` : `linear-gradient(135deg, ${theme.accent900}, ${theme.surface})`,
          position: "relative",
          cursor: banner ? "pointer" : undefined,
        } as React.CSSProperties}>
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: 110, pointerEvents: "none",
          background: `linear-gradient(to bottom, ${theme.bg}00 0%, ${theme.bg}00 15%, ${theme.bg}40 45%, ${theme.bg}cc 75%, ${theme.bg} 100%)`,
        } as React.CSSProperties} />
      </div>
      {/* position:relative — same fix as ProfileScreen.tsx's hero: without
          it, this row (including the avatar overlapping up via
          marginTop:-40) painted BEHIND the hero's absolute-positioned
          fade overlay despite coming later in the markup, since CSS
          stacks positioned elements above static ones regardless of DOM
          order. */}
      {/* flexWrap + ellipsis — same fix as ProfileScreen.tsx's own hero:
          an unbounded long name ran into (or past) the Follow button at
          narrow widths, with no way to shrink or wrap. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: -40, marginBottom: 16, padding: "0 32px", position: "relative" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, minWidth: 0, flex: "1 1 240px" } as React.CSSProperties}>
          <div onClick={avatar ? () => setLightbox(avatar) : undefined} style={{ cursor: avatar ? "pointer" : undefined } as React.CSSProperties}>
            <Avatar name={displayName} uri={avatar} size="xl" />
          </div>
          <div style={{ marginBottom: 4, minWidth: 0, overflow: "hidden" } as React.CSSProperties}>
            <h2 style={{ fontSize: fontSizes.xxl, fontWeight: 700, color: theme.text, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties}>{displayName}</h2>
            <span style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties}>@{profile.username}</span>
          </div>
        </div>
        {!isOwnProfile && (
          <Button
            variant={isFollowing ? "secondary" : "primary"}
            icon={isFollowing ? "user-check" : "user-plus"}
            label={isFollowing ? "Following" : "Follow"}
            onPress={toggleFollow}
            style={{ marginBottom: 4, flexShrink: 0 } as React.CSSProperties}
          />
        )}
      </div>
      {profile.bio && (
        <p style={{ padding: "0 32px", margin: "0 0 20px", fontSize: fontSizes.base, color: `${theme.text}99`, lineHeight: 1.5 } as React.CSSProperties}>{profile.bio}</p>
      )}
    </>
  );

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web" && !isMobile) {
    return (
      <div style={{ maxWidth: 1000, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        {header}
        <div style={{ padding: "0 32px 40px" } as React.CSSProperties}>
          {!profile.can_view_content ? (
            <div style={{ textAlign: "center", padding: 60 } as React.CSSProperties}>
              <div style={{ fontSize: 40, marginBottom: 12 } as React.CSSProperties}>🔒</div>
              <p style={{ color: `${theme.text}44`, fontSize: fontSizes.base } as React.CSSProperties}>This account is private.</p>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60 } as React.CSSProperties}>
              <div style={{ fontSize: 40, marginBottom: 12 } as React.CSSProperties}>🎬</div>
              <p style={{ color: `${theme.text}44`, fontSize: fontSizes.base } as React.CSSProperties}>No public logs yet.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 } as React.CSSProperties}>
              {logs.map((log) => (
                <PosterCard key={log.id} log={log} onPress={() => openLog(log)} />
              ))}
            </div>
          )}
        </div>
        <ImageLightbox uri={lightbox} onClose={() => setLightbox(undefined)} />
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 100 }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
    >
      {/* Same multi-stop fade as ProfileScreen.tsx's own hero — a plain
          2-stop fade still reads as an abrupt cut against real banner
          image detail. */}
      <Pressable onPress={banner ? () => setLightbox(banner) : undefined} disabled={!banner} style={{ height: 140, backgroundColor: theme.accent900, position: "relative" }}>
        {banner && <Image source={{ uri: banner }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />}
        <LinearGradient
          colors={[`${theme.bg}00`, `${theme.bg}00`, `${theme.bg}40`, `${theme.bg}cc`, theme.bg]}
          locations={[0, 0.15, 0.45, 0.75, 1]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 100 }}
        />
      </Pressable>
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: -40, marginBottom: 16 }}>
          <Pressable onPress={avatar ? () => setLightbox(avatar) : undefined} disabled={!avatar}>
            <Avatar name={displayName} uri={avatar} size="xl" />
          </Pressable>
          {!isOwnProfile && (
            <Button
              variant={isFollowing ? "secondary" : "primary"}
              icon={isFollowing ? "user-check" : "user-plus"}
              label={isFollowing ? "Following" : "Follow"}
              onPress={toggleFollow}
            />
          )}
        </View>
        {/* numberOfLines — same fix as ProfileScreen.tsx's own hero: an
            unbounded name wrapped to multiple lines and grew tall enough
            to visually collide with the Follow button sitting right
            above it. */}
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: fontSizes.xl, fontWeight: "700", color: theme.text }}>{displayName}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2, marginBottom: 12 }}>@{profile.username}</Text>
        {profile.bio && <Text style={{ fontSize: fontSizes.base, color: `${theme.text}99`, lineHeight: 20, marginBottom: 16 }}>{profile.bio}</Text>}

        {!profile.can_view_content ? (
          <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
            <Text style={{ fontSize: 36 }}>🔒</Text>
            <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>This account is private.</Text>
          </View>
        ) : logs.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
            <Text style={{ fontSize: 36 }}>🎬</Text>
            <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>No public logs yet.</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {logs.map((log) => (
              <View key={log.id} style={{ width: "30%" }}>
                <PosterCard log={log} width={100} onPress={() => openLog(log)} />
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
    <ImageLightbox uri={lightbox} onClose={() => setLightbox(undefined)} />
    </>
  );
}
