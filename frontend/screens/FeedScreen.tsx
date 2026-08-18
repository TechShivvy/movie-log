/**
 * FeedScreen — pixel-accurate match to design spec.
 *
 * Web layout (padding:28px 32px 40px; max-width:1080px):
 *   Two-column: main (flex:1, max-width:600px) + sidebar (width:260px)
 *   Feed cards: .card with avatar + user + rating + poster (78×117px) + film info + actions
 *   Sidebar: "Who to follow" card + "Trending this week" card
 *
 * Mobile: single-column feed cards
 */
import React from "react";
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
import { Heart, ChatCircle, UserPlus } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useLikeLog } from "../hooks/useSocial";
import { Avatar } from "../components/ui/Avatar";
import { StarRating } from "../components/ui/StarRating";
import { hueFromTitle } from "../components/ui/Poster";
import type { MovieLog } from "../types";

// ─── Feed card ────────────────────────────────────────────────────────────────

function FeedCard({ log }: { log: MovieLog }) {
  const { theme } = useTheme();
  const router = useRouter();
  const likeLog = useLikeLog();
  // `movie` can be null/undefined — hueFromTitle guards that (see LogDetailScreen)
  const hue = hueFromTitle(log.movie);
  // No poster image support yet — see PosterCard.tsx's own note on why
  // (a log's movie_id catalog row isn't embedded in the response).
  const posterUrl: string | undefined = undefined;

  if (Platform.OS === "web") {
    return (
      <div className="card" style={{ display: "flex", gap: 14, marginBottom: 12 } as React.CSSProperties}>
        {/* Poster — 78×117px */}
        <div
          onClick={() => router.push(`/(app)/log/${log.id}` as any)}
          style={{
            width: 78,
            height: 117,
            borderRadius: 6,
            flexShrink: 0,
            overflow: "hidden",
            cursor: "pointer",
            background: posterUrl
              ? `url(${posterUrl}) center/cover`
              : `linear-gradient(155deg, hsl(${hue} 42% 20%), hsl(${(hue + 30) % 360} 38% 8%))`,
          } as React.CSSProperties}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties}>
          {/* User row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties}>
            <Avatar name={log.display_name ?? log.username ?? "?"} uri={log.avatar_path} size="sm" />
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: theme.text } as React.CSSProperties}>
                {log.display_name ?? log.username ?? "User"}
              </span>
              <span style={{ fontSize: 12, color: `${theme.text}55`, marginLeft: 6 } as React.CSSProperties}>logged</span>
            </div>
            {log.created_at && (
              <span style={{ fontSize: 11, color: `${theme.text}44`, marginLeft: "auto" } as React.CSSProperties}>
                {new Date(log.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>

          {/* Title */}
          <div
            onClick={() => router.push(`/(app)/log/${log.id}` as any)}
            style={{ fontSize: 15, fontWeight: 700, color: theme.text, cursor: "pointer", lineHeight: 1.3 } as React.CSSProperties}
            className="tapc"
          >
            {log.movie}
          </div>

          {/* Rating + format */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties}>
            {log.rating != null && <StarRating value={log.rating} onChange={() => {}} readonly size="small" />}
            {log.format && <span className="tag tag-neutral">{log.format}</span>}
          </div>

          {/* Notes preview */}
          {log.notes && (
            <p style={{
              fontSize: 13,
              color: `${theme.text}88`,
              lineHeight: 1.5,
              margin: 0,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            } as React.CSSProperties}>
              {log.notes}
            </p>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, marginTop: "auto" } as React.CSSProperties}>
            <button
              className={`btn btn-ghost`}
              onClick={() => likeLog.mutate({ logId: log.id, liked: !!log.liked_by_caller })}
              style={{ fontSize: 12, padding: "4px 0", color: log.liked_by_caller ? theme.accent : `${theme.text}66` } as React.CSSProperties}
            >
              <Heart size={13} weight={log.liked_by_caller ? "fill" : "regular"} color={log.liked_by_caller ? theme.accent : `${theme.text}66`} />
              {log.like_count}
            </button>
            {/* No per-log comment count exists on the backend (only like_count
                is denormalized onto movie_logs) — this is just a "view
                comments" affordance, not a real counter. */}
            <button
              className="btn btn-ghost"
              onClick={() => router.push(`/(app)/log/${log.id}` as any)}
              style={{ fontSize: 12, padding: "4px 0", color: `${theme.text}66` } as React.CSSProperties}
            >
              <ChatCircle size={13} color={`${theme.text}66`} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Native feed card
  return (
    <Pressable
      onPress={() => router.push(`/(app)/log/${log.id}` as any)}
      style={{
        backgroundColor: theme.surface,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        flexDirection: "row",
        gap: 12,
      }}
    >
      {/* Poster */}
      <View style={{
        width: 64,
        height: 96,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: theme.neutral800,
        flexShrink: 0,
      }}>
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={{ width: 64, height: 96 }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: 20, textAlign: "center", lineHeight: 96 }}>🎬</Text>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, gap: 4 }}>
        {/* User row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Avatar name={log.display_name ?? log.username ?? "?"} uri={log.avatar_path} size="sm" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }} numberOfLines={1}>
            {log.display_name ?? log.username ?? "User"}
          </Text>
        </View>

        {/* Title */}
        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text }} numberOfLines={2}>
          {log.movie}
        </Text>

        {/* Rating + format */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {log.rating != null && <StarRating value={log.rating} onChange={() => {}} readonly size="small" />}
          {log.format && (
            <View style={{ backgroundColor: theme.neutral800, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10, color: theme.neutral100, fontWeight: "700" }}>{log.format}</Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {log.notes && (
          <Text style={{ fontSize: 12, color: `${theme.text}88`, lineHeight: 16 }} numberOfLines={2}>
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
            <Text style={{ fontSize: 12, color: log.liked_by_caller ? theme.accent : `${theme.text}66` }}>{log.like_count}</Text>
          </Pressable>
          {/* No per-log comment count on the backend — icon-only affordance. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <ChatCircle size={13} color={`${theme.text}66`} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Sidebar cards (web only) ─────────────────────────────────────────────────

function WebSidebar({ theme }: { theme: any }) {
  return (
    <div style={{ width: 260, flexShrink: 0 } as React.CSSProperties}>
      {/* Who to follow */}
      <div className="card" style={{ marginBottom: 14 } as React.CSSProperties}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: "0 0 12px" } as React.CSSProperties}>
          Who to follow
        </h3>
        {[
          { name: "Keanu Reeves", handle: "@keanu", hue: 40 },
          { name: "Sofia Coppola", handle: "@sofia", hue: 200 },
          { name: "Denis Villeneuve", handle: "@denis", hue: 280 },
        ].map((u) => (
          <div key={u.handle} style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingBottom: 10,
            marginBottom: 10,
            borderBottom: `1px solid ${theme.divider}`,
          } as React.CSSProperties}>
            <Avatar name={u.name} hue={u.hue} size="sm" />
            <div style={{ flex: 1 } as React.CSSProperties}>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.text } as React.CSSProperties}>{u.name}</div>
              <div style={{ fontSize: 11, color: `${theme.text}55` } as React.CSSProperties}>{u.handle}</div>
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 10px" } as React.CSSProperties}>
              <UserPlus size={12} />
              Follow
            </button>
          </div>
        ))}
      </div>

      {/* Trending */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: "0 0 12px" } as React.CSSProperties}>
          Trending this week
        </h3>
        {["Dune: Part Two", "Oppenheimer", "Poor Things", "Anatomy of a Fall", "The Zone of Interest"].map((title, i) => (
          <div key={title} style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingBottom: 8,
            marginBottom: 8,
            borderBottom: `1px solid ${theme.divider}`,
          } as React.CSSProperties}>
            <span style={{ fontSize: 13, color: `${theme.text}44`, fontWeight: 700, width: 16 } as React.CSSProperties}>{i + 1}</span>
            <span style={{ fontSize: 13, color: theme.text, flex: 1 } as React.CSSProperties}>{title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function FeedScreen() {
  const { theme } = useTheme();
  const { data: logs, isLoading } = useMovieLogs({ archived: false });

  const feedLogs = (logs ?? []).slice(0, 20);

  // ── Web ─────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ padding: "28px 32px 40px", maxWidth: 1080, margin: "0 auto" } as React.CSSProperties}>
        {/* Header */}
        <h1 style={{
          fontSize: 32, fontWeight: 700, color: theme.text, margin: "0 0 24px",
          letterSpacing: -0.5,
        } as React.CSSProperties}>
          Feed
        </h1>

        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" } as React.CSSProperties}>
          {/* Main feed — flex:1, max-width:600px */}
          <div style={{ flex: 1, maxWidth: 600, minWidth: 0 } as React.CSSProperties}>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: theme.accent } as React.CSSProperties}>
                <span className="spin" style={{ fontSize: 24 } as React.CSSProperties}>◌</span>
              </div>
            ) : feedLogs.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 40 } as React.CSSProperties}>
                <div style={{ fontSize: 40, marginBottom: 12 } as React.CSSProperties}>🎬</div>
                <p style={{ color: `${theme.text}55`, fontSize: 15 } as React.CSSProperties}>
                  No activity yet — log a film to get started!
                </p>
              </div>
            ) : (
              feedLogs.map((log) => <FeedCard key={log.id} log={log} />)
            )}
          </div>

          {/* Sidebar — 260px */}
          <WebSidebar theme={theme} />
        </div>
      </div>
    );
  }

  // ── Native ───────────────────────────────────────────────────────────────────
  return (
    <FlatList
      data={feedLogs}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      ListHeaderComponent={
        <Text style={{ fontSize: 22, fontWeight: "800", color: theme.text, marginBottom: 16 }}>Feed</Text>
      }
      ListEmptyComponent={
        isLoading ? (
          <View style={{ flex: 1, alignItems: "center", paddingTop: 60 }}>
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingTop: 60, gap: 8 }}>
            <Text style={{ fontSize: 40 }}>🎬</Text>
            <Text style={{ color: `${theme.text}55`, fontSize: 15 }}>No activity yet</Text>
          </View>
        )
      }
      renderItem={({ item }) => <FeedCard log={item} />}
    />
  );
}
