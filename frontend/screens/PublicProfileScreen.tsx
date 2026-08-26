/**
 * PublicProfileScreen — someone ELSE's profile (own profile is
 * ProfileScreen.tsx, a different screen with edit/settings affordances
 * this one deliberately doesn't have). Header (banner/avatar/bio), a
 * Follow button, and their visible logs — scoped to view + follow for
 * this pass, not full parity with the own-profile screen.
 *
 * One JSX tree, breakpoint-driven (see Part C of the architecture-
 * unification plan). The old web branch's `header` constant looked
 * shared but wasn't — it was only ever rendered by the web return, and
 * native quietly reimplemented the same ~60 lines a second time
 * (including the same bugs-already-fixed-once-here: the ellipsis/
 * flexWrap name handling, the multi-stop banner fade). Follows
 * ProfileScreen.tsx's own unification: Image+LinearGradient hero on both
 * platforms (already proven cross-platform — see Poster.tsx), one poster
 * grid technique split kept (PosterCard's web branch needs a real CSS
 * Grid ancestor for its width — see that file), everything else shared.
 */
import React, { useState } from "react";
import { Image, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useAuth } from "../hooks/useAuth";
import { usePublicProfile, useFollowers, useFollowUser, useBlockUser } from "../hooks/useSocial";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Icon } from "../components/ui/Icon";
import { PosterCard } from "../components/ui/PosterCard";
import { ImageLightbox } from "../components/ui/ImageLightbox";
import { ScreenLoader } from "../components/ui/Spinner";
import { avatarUrl, bannerUrl } from "../lib/storage";
import type { MovieLog } from "../types";
import { type as fontSizes } from "../constants/fonts";

export function PublicProfileScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  const { user } = useAuth();
  // `preview` is the deliberate, explicit escape hatch — Slack calls this
  // "View as" on your own profile. Without it, landing here on your own
  // username (typed directly, an old link, or a People search hit on
  // yourself) redirects straight to the real /profile screen below —
  // nobody should see themselves rendered as a stranger with a Follow
  // button by accident. See ProfileScreen.tsx's own "Preview as others
  // see it" link for the one deliberate way in.
  const { username, preview } = useLocalSearchParams<{ username: string; preview?: string }>();

  const { data, isLoading, refetch } = usePublicProfile(username);
  const { data: followers } = useFollowers(username);
  const followUser = useFollowUser();
  const blockUser = useBlockUser();
  const [refreshing, setRefreshing] = useState(false);
  const [lightbox, setLightbox] = useState<string | undefined>(undefined);
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const profile = data?.profile;
  const logs = data?.logs ?? [];
  const isFollowing = !!followers?.some((f) => f.user_id === user?.id);
  const isOwnProfile = !!profile && profile.user_id === user?.id;
  const isPreviewingSelf = isOwnProfile && !!preview;
  // is_blocking is caller-directional (see types/index.ts) — this is only
  // ever true when *we* placed the block, so it's safe to drive the
  // Block/Unblock button's own state from it.
  const isBlocking = !!profile?.is_blocking;

  const openLog = (log: MovieLog) => router.push(`/(app)/log/${log.id}` as any);
  const toggleFollow = () => {
    if (!username) return;
    followUser.mutate({ username, following: isFollowing });
  };
  const toggleBlock = () => {
    if (!username) return;
    if (isBlocking) {
      // Unblocking doesn't need confirmation — it's the safe direction.
      blockUser.mutate({ username, blocked: true });
    } else {
      setConfirmingBlock(true);
    }
  };
  const confirmBlock = () => {
    setConfirmingBlock(false);
    if (!username) return;
    blockUser.mutate({ username, blocked: false });
  };

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  if (isLoading) return <ScreenLoader />;
  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 40 }}>
        <Text style={{ fontSize: fontSizes.lg, color: theme.text }}>User not found.</Text>
      </View>
    );
  }
  if (isOwnProfile && !preview) {
    return <Redirect href="/(app)/profile" />;
  }

  const banner = bannerUrl(profile.banner_path);
  const avatar = avatarUrl(profile.avatar_path);
  const displayName = profile.display_name || profile.username;

  const heroHeight = isMobile ? 140 : 160;
  const heroFade = isMobile ? 100 : 110;
  const gridCols = isMobile ? 3 : 6;
  const pad = isMobile ? 16 : 32;

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any}
      contentContainerStyle={isMobile ? { paddingBottom: 100 } : { alignItems: "center", paddingBottom: 40 }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
    >
      <View style={{ maxWidth: isMobile ? undefined : 1000, width: "100%" }}>
        {isPreviewingSelf && (
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap",
            paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.accent900,
          }}>
            <Text style={{ color: theme.text, fontSize: fontSizes.sm, textAlign: "center" }}>
              You're viewing your own profile as others see it.
            </Text>
            <Pressable onPress={() => router.replace("/(app)/profile")}>
              <Text style={{ color: theme.accent, fontSize: fontSizes.sm, fontWeight: "700" }}>Exit preview</Text>
            </Pressable>
          </View>
        )}

        {/* Hero — same technique as ProfileScreen.tsx's own hero: a real
            banner image (or an accent900→surface gradient fallback) with a
            multi-stop fade into theme.bg so it doesn't stop dead against
            the page background below it. */}
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

        <View style={{ paddingHorizontal: pad }}>
          {/* Avatar + name row — flexWrap so the button group drops to its
              own line rather than colliding with a long name at narrow
              widths; numberOfLines so an oversized display name truncates
              instead of overflowing past the Follow/Block buttons. */}
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: -40, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 16, minWidth: 0, flex: 1 }}>
              <Pressable onPress={avatar ? () => setLightbox(avatar) : undefined} disabled={!avatar}>
                <Avatar name={displayName} uri={avatar} size="xl" />
              </Pressable>
              <View style={{ marginBottom: 4, minWidth: 0, flexShrink: 1 }}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: isMobile ? fontSizes.xl : fontSizes.xxl, fontWeight: "700", color: theme.text }}>
                  {displayName}
                </Text>
                <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>
                  @{profile.username}
                </Text>
              </View>
            </View>
            {!isOwnProfile && (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 4, flexShrink: 0 }}>
                <Button
                  variant={isFollowing ? "secondary" : "primary"}
                  icon={isFollowing ? "user-check" : "user-plus"}
                  label={isFollowing ? "Following" : "Follow"}
                  onPress={toggleFollow}
                />
                <Button
                  variant="icon"
                  icon="prohibit"
                  color={isBlocking ? theme.error : undefined}
                  accessibilityLabel={isBlocking ? `Unblock @${profile.username}` : `Block @${profile.username}`}
                  onPress={toggleBlock}
                />
              </View>
            )}
          </View>

          {profile.bio && <Text style={{ fontSize: fontSizes.base, color: `${theme.text}99`, lineHeight: 20, marginBottom: isMobile ? 16 : 20 }}>{profile.bio}</Text>}

          {!profile.can_view_content ? (
            <View style={{ alignItems: "center", paddingVertical: 60, gap: 8 }}>
              <Icon name="lock" size={36} color={`${theme.text}33`} />
              <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>This account is private.</Text>
            </View>
          ) : logs.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 60, gap: 8 }}>
              <Icon name="film-slate" size={36} color={`${theme.text}33`} />
              <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>No public logs yet.</Text>
            </View>
          ) : Platform.OS === "web" && !isMobile ? (
            // PosterCard's own web branch sizes itself off a real CSS Grid
            // track — see ProfileScreen.tsx's identical note.
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 14 } as React.CSSProperties}>
              {logs.map((log) => (
                <PosterCard key={log.id} log={log} onPress={() => openLog(log)} />
              ))}
            </div>
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
      </View>
    </ScrollView>
    <ImageLightbox uri={lightbox} onClose={() => setLightbox(undefined)} />
    <ConfirmDialog
      visible={confirmingBlock}
      title={`Block @${profile.username}`}
      message="They won't be able to follow you or see your content, and you won't see theirs. They won't be notified."
      confirmLabel="Block"
      destructive
      onConfirm={confirmBlock}
      onCancel={() => setConfirmingBlock(false)}
    />
    </>
  );
}
