/**
 * FeedScreen — one JSX tree, breakpoint-driven (see Part C of the
 * architecture-unification plan). The old web branch's two-column
 * main+sidebar layout is gone — "Who to follow"/"Trending this week" were
 * 100% hardcoded mock content with zero backend wiring, not a real
 * feature to carry forward (per the plan's own decision on this screen).
 * FeedCard's web/native forks had drifted apart in real content, not just
 * markup: web showed the "logged" suffix and a date, native didn't;
 * kept the richer (web's) version for both. Both platforms now render
 * through one FlatList (virtualization is genuinely useful here and
 * already proven to render correctly on web via react-native-web
 * elsewhere in this app — e.g. SearchScreen's people-results list — so
 * there was no reason to also keep a separate `.map()` render path for
 * web on top of it).
 */
import React from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Heart, ChatCircle } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useFeed } from "../hooks/useFeed";
import { useLikeLog } from "../hooks/useSocial";
import { useMovie } from "../hooks/useSearch";
import { Avatar } from "../components/ui/Avatar";
import { StarRating } from "../components/ui/StarRating";
import { Poster } from "../components/ui/Poster";
import { Tag } from "../components/ui/Tag";
import { SectionLoader } from "../components/ui/Spinner";
import { tmdbPosterUrl } from "../lib/tmdb";
import type { MovieLog } from "../types";
import { type as fontSizes } from "../constants/fonts";

// ─── Feed card ────────────────────────────────────────────────────────────────

function FeedCard({ log }: { log: MovieLog }) {
  const { theme } = useTheme();
  const router = useRouter();
  const likeLog = useLikeLog();
  // Same fix as PosterCard.tsx — this card had its own separate copy of
  // the same "always gradient, never a real poster" stub (a log's
  // movie_id catalog row isn't embedded in the response, so it needs its
  // own lookup) — duplicated here rather than actually reusing
  // PosterCard, so PosterCard's own fix didn't cover this screen too.
  const { data: movie, isLoading: posterLoading } = useMovie(log.movie_id);
  const posterUrl = tmdbPosterUrl(movie?.poster_path, "w342");
  const open = () => router.push(`/(app)/log/${log.id}` as any);

  return (
    <Pressable
      onPress={open}
      style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: "row", gap: 12 }}
    >
      <Poster title={log.movie ?? "Untitled"} imageUrl={posterUrl} loading={posterLoading} style={{ width: 78, height: 117, flexShrink: 0 }} />

      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        {/* User row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Avatar name={log.display_name ?? log.username ?? "?"} uri={log.avatar_path} size="sm" />
          <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: theme.text }} numberOfLines={1}>
            {log.display_name ?? log.username ?? "User"}
          </Text>
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55` }}>logged</Text>
          {log.created_at && (
            <Text style={{ fontSize: fontSizes.xs, color: `${theme.text}44`, marginLeft: "auto" }}>
              {new Date(log.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          )}
        </View>

        {/* Title */}
        <Text style={{ fontSize: fontSizes.md, fontWeight: "700", color: theme.text, lineHeight: 18 }} numberOfLines={2}>
          {log.movie}
        </Text>

        {/* Rating + format */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {log.rating != null && <StarRating value={log.rating} onChange={() => {}} readonly size="small" />}
          {log.format && <Tag variant="neutral" label={log.format} />}
        </View>

        {/* Notes preview */}
        {log.notes && (
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}88`, lineHeight: 18 }} numberOfLines={2}>
            {log.notes}
          </Text>
        )}

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: 14, marginTop: 2 }}>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); likeLog.mutate({ logId: log.id, liked: !!log.liked_by_caller }); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Heart size={13} weight={log.liked_by_caller ? "fill" : "regular"} color={log.liked_by_caller ? theme.accent : `${theme.text}66`} />
            <Text style={{ fontSize: fontSizes.sm, color: log.liked_by_caller ? theme.accent : `${theme.text}66` }}>{log.like_count}</Text>
          </Pressable>
          {/* No per-log comment count on the backend — icon-only affordance;
              the whole card already opens the log (comments live there), so
              this is decorative, not a second tap target. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <ChatCircle size={13} color={`${theme.text}66`} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function FeedScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  // Was useMovieLogs({archived:false}).slice(0,20) — the caller's OWN
  // logs, capped at 20. That's not a feed, it's a fake: GET /public/feed
  // (real public logs from people the caller follows, never their own)
  // was never called anywhere in the app. useFeed with no filters is the
  // real, unscoped global feed.
  const { data: logs, isLoading } = useFeed({ limit: 20 });
  const feedLogs = logs ?? [];

  return (
    <FlatList
      data={feedLogs}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: isMobile ? 16 : 28,
        paddingHorizontal: isMobile ? 16 : 32,
        paddingBottom: isMobile ? 100 : 40,
        maxWidth: isMobile ? undefined : 600,
        width: "100%",
        alignSelf: isMobile ? "stretch" : "center",
      }}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        <Text style={{
          fontSize: isMobile ? fontSizes.xxl : fontSizes.h1,
          fontWeight: isMobile ? "800" : "700",
          color: theme.text,
          marginBottom: isMobile ? 16 : 24,
          letterSpacing: isMobile ? undefined : -0.5,
        }}>
          Feed
        </Text>
      }
      ListEmptyComponent={
        isLoading ? (
          <SectionLoader size="lg" padding={60} />
        ) : (
          <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
            <Text style={{ fontSize: 40 }}>🎬</Text>
            <Text style={{ color: `${theme.text}55`, fontSize: fontSizes.md, textAlign: "center" }}>
              No activity yet — log a film to get started!
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => <FeedCard log={item} />}
    />
  );
}
