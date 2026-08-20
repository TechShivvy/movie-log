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
import { UserPlus, UserCheck } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";
import { usePublicProfile, useFollowers, useFollowUser } from "../hooks/useSocial";
import { Avatar } from "../components/ui/Avatar";
import { PosterCard } from "../components/ui/PosterCard";
import { avatarUrl, bannerUrl } from "../lib/storage";
import type { MovieLog } from "../types";

export function PublicProfileScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { username } = useLocalSearchParams<{ username: string }>();

  const { data, isLoading, refetch } = usePublicProfile(username);
  const { data: followers } = useFollowers(username);
  const followUser = useFollowUser();
  const [refreshing, setRefreshing] = useState(false);

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
        <Text style={{ fontSize: 16, color: theme.text }}>User not found.</Text>
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
          stops dead against the page background below it. */}
      <div style={{
        height: 160,
        background: banner ? `url(${banner}) center/cover no-repeat` : `linear-gradient(135deg, ${theme.accent900}, ${theme.surface})`,
        position: "relative",
      } as React.CSSProperties}>
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: 70,
          background: `linear-gradient(to bottom, transparent, ${theme.bg})`,
        } as React.CSSProperties} />
      </div>
      {/* position:relative — same fix as ProfileScreen.tsx's hero: without
          it, this row (including the avatar overlapping up via
          marginTop:-40) painted BEHIND the hero's absolute-positioned
          fade overlay despite coming later in the markup, since CSS
          stacks positioned elements above static ones regardless of DOM
          order. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: -40, marginBottom: 16, padding: "0 32px", position: "relative" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16 } as React.CSSProperties}>
          <Avatar name={displayName} uri={avatar} size="xl" />
          <div style={{ marginBottom: 4 } as React.CSSProperties}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: theme.text, margin: "0 0 2px" } as React.CSSProperties}>{displayName}</h2>
            <span style={{ fontSize: 13, color: `${theme.text}55` } as React.CSSProperties}>@{profile.username}</span>
          </div>
        </div>
        {!isOwnProfile && (
          <button className={isFollowing ? "btn btn-secondary" : "btn btn-primary"} onClick={toggleFollow} style={{ marginBottom: 4 } as React.CSSProperties}>
            {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
            {isFollowing ? "Following" : "Follow"}
          </button>
        )}
      </div>
      {profile.bio && (
        <p style={{ padding: "0 32px", margin: "0 0 20px", fontSize: 14, color: `${theme.text}99`, lineHeight: 1.5 } as React.CSSProperties}>{profile.bio}</p>
      )}
    </>
  );

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ maxWidth: 1000, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        {header}
        <div style={{ padding: "0 32px 40px" } as React.CSSProperties}>
          {!profile.can_view_content ? (
            <div style={{ textAlign: "center", padding: 60 } as React.CSSProperties}>
              <div style={{ fontSize: 40, marginBottom: 12 } as React.CSSProperties}>🔒</div>
              <p style={{ color: `${theme.text}44`, fontSize: 14 } as React.CSSProperties}>This account is private.</p>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60 } as React.CSSProperties}>
              <div style={{ fontSize: 40, marginBottom: 12 } as React.CSSProperties}>🎬</div>
              <p style={{ color: `${theme.text}44`, fontSize: 14 } as React.CSSProperties}>No public logs yet.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 } as React.CSSProperties}>
              {logs.map((log) => (
                <PosterCard key={log.id} log={log} onPress={() => openLog(log)} />
              ))}
            </div>
          )}
        </div>
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
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
    >
      <View style={{ height: 140, backgroundColor: theme.accent900, position: "relative" }}>
        {banner && <Image source={{ uri: banner }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />}
        <LinearGradient
          colors={["transparent", theme.bg]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 60 }}
        />
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: -40, marginBottom: 16 }}>
          <Avatar name={displayName} uri={avatar} size="xl" />
          {!isOwnProfile && (
            <Pressable
              onPress={toggleFollow}
              style={{
                flexDirection: "row", alignItems: "center", gap: 6,
                backgroundColor: isFollowing ? theme.surface : theme.accent,
                borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14,
                borderWidth: isFollowing ? 1 : 0, borderColor: theme.divider,
              }}
            >
              {isFollowing ? <UserCheck size={14} color={theme.text} /> : <UserPlus size={14} color="#fff" />}
              <Text style={{ color: isFollowing ? theme.text : "#fff", fontSize: 13, fontWeight: "700" }}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </Pressable>
          )}
        </View>
        <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>{displayName}</Text>
        <Text style={{ fontSize: 13, color: `${theme.text}55`, marginTop: 2, marginBottom: 12 }}>@{profile.username}</Text>
        {profile.bio && <Text style={{ fontSize: 14, color: `${theme.text}99`, lineHeight: 20, marginBottom: 16 }}>{profile.bio}</Text>}

        {!profile.can_view_content ? (
          <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
            <Text style={{ fontSize: 36 }}>🔒</Text>
            <Text style={{ color: `${theme.text}44`, fontSize: 14 }}>This account is private.</Text>
          </View>
        ) : logs.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
            <Text style={{ fontSize: 36 }}>🎬</Text>
            <Text style={{ color: `${theme.text}44`, fontSize: 14 }}>No public logs yet.</Text>
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
  );
}
