/**
 * FollowListScreen — a username's followers or following, with a
 * Followers/Following toggle. Reached by tapping either stat card on
 * ProfileScreen (own profile) or PublicProfileScreen (someone else's) —
 * neither previously did anything, despite both already fetching the
 * exact counts shown via useFollowers/useFollowing.
 */
import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useFollowers, useFollowing } from "../hooks/useSocial";
import { Avatar } from "../components/ui/Avatar";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { ScreenLoader } from "../components/ui/Spinner";
import { Icon } from "../components/ui/Icon";
import { avatarUrl } from "../lib/storage";
import type { FollowerEntry } from "../types";
import { type as fontSizes } from "../constants/fonts";

// The full page a row can render, not just the count-list this is built
// from — 100 is the route's own le=100 cap (see routers/follows.py), a
// deliberate step up from the stat card's own default 20 (which only
// ever needs a count, not the list).
const LIST_LIMIT = 100;

function FollowRow({ entry, theme, onPress }: { entry: FollowerEntry; theme: any; onPress: () => void }) {
  const name = entry.display_name || entry.username || "Unknown";
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.divider }}
    >
      <Avatar name={name} uri={avatarUrl(entry.avatar_path)} size="sm" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{name}</Text>
        {!!entry.username && (
          <Text numberOfLines={1} style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginTop: 1 }}>@{entry.username}</Text>
        )}
      </View>
    </Pressable>
  );
}

export function FollowListScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  const { username, tab: initialTab } = useLocalSearchParams<{ username: string; tab?: string }>();
  const [tab, setTab] = useState<"followers" | "following">(initialTab === "following" ? "following" : "followers");
  const [refreshing, setRefreshing] = useState(false);

  const followers = useFollowers(username, LIST_LIMIT);
  const following = useFollowing(username, LIST_LIMIT);
  const active = tab === "followers" ? followers : following;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await active.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  function openProfile(entry: FollowerEntry) {
    if (!entry.username) return;
    router.push(`/(app)/profile/${entry.username}` as any);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any}
      contentContainerStyle={{
        paddingTop: isMobile ? 16 : 28,
        paddingHorizontal: isMobile ? 16 : 32,
        paddingBottom: isMobile ? 100 : 40,
      }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
    >
      <View style={{ maxWidth: isMobile ? undefined : 560, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
        <Text style={{
          fontSize: isMobile ? fontSizes.xl : fontSizes.h1,
          fontWeight: isMobile ? "800" : "700",
          color: theme.text,
          marginBottom: 4,
        }}>
          @{username}
        </Text>
        <SegmentedControl
          style={{ marginBottom: 16, marginTop: 8, alignSelf: "flex-start" }}
          options={[
            { label: "Followers", value: "followers" },
            { label: "Following", value: "following" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as "followers" | "following")}
        />

        {active.isLoading ? (
          <ScreenLoader />
        ) : !active.data || active.data.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 8 }}>
            <Icon name="users" size={36} color={`${theme.text}33`} />
            <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>
              {tab === "followers" ? "No followers yet." : "Not following anyone yet."}
            </Text>
          </View>
        ) : (
          active.data.map((entry) => (
            <FollowRow key={entry.user_id} entry={entry} theme={theme} onPress={() => openProfile(entry)} />
          ))
        )}
      </View>
    </ScrollView>
  );
}
