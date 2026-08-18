/**
 * LogDetailScreen — pixel-accurate match to design spec.
 *
 * Web layout (padding:24px 32px 40px; max-width:980px):
 *   Back button + two-column: 280px poster + flex:1 content
 *   Poster: gradient bg + aspect-ratio:2/3 + borderRadius:12px
 *   Below poster: Like button (flex:1, border:accent) + Edit btn
 *   Content: tags (Public, FDFS) + h1 + stars + meta grid (3-col, 7 cards) + seats + review + comments
 *
 * Mobile layout:
 *   Hero poster: height:340px gradient bg + overlay + back btn
 *   Content: rating row + meta (vertical) + review + comments
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Heart,
  Archive,
  PencilSimple,
  ArrowLeft,
  ChatCircle,
  Robot,
} from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { fontFamily } from "../constants/fonts";
import { useMovieLog, useArchiveLog } from "../hooks/useMovieLogs";
import { useLikeLog, useComments, useAddComment, useLikeComment } from "../hooks/useSocial";
import { Avatar } from "../components/ui/Avatar";
import { StarRating } from "../components/ui/StarRating";
import { hueFromTitle } from "../components/ui/Poster";
import type { Comment } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function punctualityLabel(s?: string) {
  return s === "early" ? "🟢 Arrived Early" : s === "on_time" ? "🟡 On Time" : s === "late" ? "🔴 Late" : null;
}
function screeningStartLabel(s?: string) {
  return s === "early" ? "Started Early" : s === "on_time" ? "Started On Time"
    : s === "delayed" ? "Delayed" : s === "cancelled" ? "Cancelled" : null;
}
// LogVisibility is "private" | "anonymous" | "public" — no "followers_only"
// (that's the distinct account-level AccountVisibility).
function visColor(v: string) {
  return v === "public" ? "#4caf7a" : v === "anonymous" ? "#ffb800" : "#9e9e9e";
}

// ─── CommentItem ──────────────────────────────────────────────────────────────

function CommentItem({
  comment, logId, depth = 0, onReply,
}: {
  comment: Comment; logId: string; depth?: number;
  onReply: (username: string, commentId: string) => void;
}) {
  const { theme } = useTheme();
  const likeComment = useLikeComment(logId);

  return (
    <View style={depth > 0 ? { marginLeft: 28, marginTop: 6 } : undefined}>
      <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 12, marginBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          {/* Comment has no display_name/avatar_url — only a flat username */}
          <Avatar name={comment.username ?? "?"} size="sm" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text }}>
            {comment.username ?? "User"}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text, opacity: 0.5 }}>{fmtDate(comment.created_at)}</Text>
        </View>
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>{comment.text}</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
          <Pressable onPress={() => likeComment.mutate({ commentId: comment.id, liked: !!comment.liked_by_caller })}>
            <Text style={{ fontSize: 12, color: comment.liked_by_caller ? theme.accent : theme.text }}>♥ {comment.like_count ?? 0}</Text>
          </Pressable>
          {depth === 0 && (
            <Pressable onPress={() => onReply(comment.username ?? "User", comment.id)}>
              <Text style={{ fontSize: 12, color: theme.accent }}>Reply</Text>
            </Pressable>
          )}
        </View>
      </View>
      {(comment.replies ?? []).map((r) => (
        <CommentItem key={r.id} comment={r} logId={logId} depth={1} onReply={onReply} />
      ))}
    </View>
  );
}

// ─── MetaCard ─────────────────────────────────────────────────────────────────

function MetaCard({ label, value, theme }: { label: string; value?: string | null; theme: any }) {
  if (!value) return null;
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, flex: 1, minWidth: 130 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: `${theme.text}66`, textTransform: "uppercase", marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{value}</Text>
    </View>
  );
}

// ─── Web Meta Card ────────────────────────────────────────────────────────────

function WebMetaCard({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="card" style={{ flex: 1, minWidth: 130 } as React.CSSProperties}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.5, textTransform: "uppercase", marginBottom: 4 } as React.CSSProperties}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 } as React.CSSProperties}>{value}</div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function LogDetailScreen() {
  const { theme, fontConfig } = useTheme();
  // Web → CSS family stack; native → the registered TTF family (e.g. Sora_700Bold)
  const headingFamily = fontFamily(fontConfig, "heading", 700);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: log, isLoading, error } = useMovieLog(id ?? "");
  const archiveLog = useArchiveLog();
  const likeLog = useLikeLog();
  const { data: comments = [] } = useComments(id ?? "");
  const addComment = useAddComment(id ?? "");

  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ username: string; commentId: string } | null>(null);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }
  if (error || !log) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 40 }}>
        <Text style={{ fontSize: 16, color: theme.text }}>Log not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.accent, fontSize: 15 }}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  const vcol = visColor(log.visibility);
  const handleLike = () => likeLog.mutate({ logId: log.id, liked: !!log.liked_by_caller });
  const handleArchive = () => archiveLog.mutate({ id: log.id, archive: !log.is_archived });
  const handleReply = (username: string, commentId: string) => {
    setReplyTo({ username, commentId });
    setCommentText(`@${username} `);
  };
  const handleSendComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    await addComment.mutateAsync({ text, parent_comment_id: replyTo?.commentId });
    setCommentText("");
    setReplyTo(null);
  };

  // Hue from title for poster gradient — `movie` can be null/undefined
  // (e.g. a log created without a resolved title), which crashed Array.from
  // with "undefined is not iterable". hueFromTitle already guards this.
  const hue = hueFromTitle(log.movie);
  // No poster image support yet — see PosterCard.tsx's own note on why.
  const posterUrl: string | undefined = undefined;

  // ── Web layout ─────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      /* width:"100%" alongside maxWidth — see LibraryScreen.tsx's root div;
         same shrink-wrap-instead-of-filling bug as every other screen
         below this maxWidth+margin:auto shape. */
      <div style={{ padding: "24px 32px 40px", maxWidth: 980, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        {/* Back btn */}
        <button
          className="btn btn-ghost"
          onClick={() => router.back()}
          style={{ marginBottom: 20 } as React.CSSProperties}
        >
          <ArrowLeft size={16} color={theme.text} />
          Back
        </button>

        {/* Two-column */}
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" } as React.CSSProperties}>
          {/* Poster column — 280px */}
          <div style={{ width: 280, flexShrink: 0 } as React.CSSProperties}>
            <div style={{
              aspectRatio: "2/3",
              borderRadius: 12,
              overflow: "hidden",
              background: posterUrl
                ? `url(${posterUrl}) center/cover`
                : `linear-gradient(155deg, hsl(${hue} 42% 20%), hsl(${(hue + 30) % 360} 38% 8%))`,
            } as React.CSSProperties} />

            {/* Like + Edit row below poster */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 } as React.CSSProperties}>
              <button
                className={`btn ${log.liked_by_caller ? "btn-primary" : "btn-secondary"}`}
                onClick={handleLike}
                style={{ flex: 1 } as React.CSSProperties}
              >
                <Heart size={14} weight={log.liked_by_caller ? "fill" : "regular"} />
                {log.like_count} {log.like_count === 1 ? "like" : "likes"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => router.push(`/log/new?edit=${log.id}` as never)}
              >
                <PencilSimple size={14} />
                Edit
              </button>
            </div>

            {/* Archive btn */}
            <button
              className="btn btn-ghost btn-block"
              onClick={handleArchive}
              style={{ marginTop: 8 } as React.CSSProperties}
            >
              <Archive size={14} />
              {log.is_archived ? "Unarchive" : "Archive"}
            </button>
          </div>

          {/* Content column */}
          <div style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
            {/* Tags row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 } as React.CSSProperties}>
              <span className="tag" style={{ backgroundColor: vcol + "22", color: vcol } as React.CSSProperties}>
                {log.visibility.replace("_", " ")}
              </span>
              {log.is_fdfs && <span className="tag tag-accent">FDFS 🎟️</span>}
              {log.format && <span className="tag tag-neutral">{log.format}</span>}
              {(log.extraction_provider || log.extraction_model) && (
                <span className="tag" style={{ backgroundColor: theme.surface, color: theme.accent, display: "flex", alignItems: "center", gap: 4 } as React.CSSProperties}>
                  <Robot size={11} color={theme.accent} />
                  {[log.extraction_provider, log.extraction_model].filter(Boolean).join(" · ")}
                </span>
              )}
              {/* No direct ticket link — ticket_image_path is a Supabase
                  Storage path, not a public URL; resolving it to a viewable
                  link needs a signed-URL fetch, out of scope for this pass
                  (same deferred-work class as the poster image). */}
            </div>

            {/* Title */}
            <h1 style={{
              fontSize: 28,
              fontWeight: 700,
              color: theme.text,
              margin: "0 0 8px",
              lineHeight: 1.2,
              letterSpacing: -0.3,
              fontFamily: headingFamily,
            } as React.CSSProperties}>
              {log.movie}
            </h1>

            {/* Stars + date */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 } as React.CSSProperties}>
              <StarRating value={log.rating ?? 0} onChange={() => {}} readonly />
              <span style={{ fontSize: 13, opacity: 0.6, color: theme.text } as React.CSSProperties}>{fmtShort(log.created_at)}</span>
              {log.edited_at && (
                <span className="tag tag-neutral" style={{ fontSize: 11 } as React.CSSProperties}>edited</span>
              )}
            </div>

            {/* Meta grid — 3-col */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              marginBottom: 24,
            } as React.CSSProperties}>
              <WebMetaCard label="Venue" value={log.theater} />
              <WebMetaCard label="Screen" value={log.screen} />
              <WebMetaCard label="Seats" value={log.seats?.length ? log.seats.join(", ") : undefined} />
              <WebMetaCard label="Screening" value={screeningStartLabel(log.screening_start_status) ?? undefined} />
              <WebMetaCard label="Punctuality" value={punctualityLabel(log.arrival_status) ?? undefined} />
              <WebMetaCard label="Logged" value={log.created_at ? fmtShort(log.created_at) : undefined} />
            </div>

            {/* Notes */}
            {log.notes && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text, marginBottom: 12, fontFamily: headingFamily } as React.CSSProperties}>
                  Review
                </h3>
                <div className="card" style={{ marginBottom: 24 } as React.CSSProperties}>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: theme.text, margin: 0 } as React.CSSProperties}>{log.notes}</p>
                </div>
              </>
            )}

            {/* Comments section */}
            <div style={{ borderTop: `1px solid ${theme.divider}`, paddingTop: 24 } as React.CSSProperties}>
              {/* No comment_count field exists on MovieLog — this is the
                  real count of the currently-loaded comment list. */}
              <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text, marginBottom: 16, fontFamily: headingFamily } as React.CSSProperties}>
                Comments ({comments.length})
              </h3>

              {/* Compose */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 20 } as React.CSSProperties}>
                <textarea
                  className="input"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={replyTo ? `Replying to @${replyTo.username}…` : "Add a comment…"}
                  rows={2}
                  style={{ flex: 1, resize: "vertical" } as React.CSSProperties}
                  maxLength={500}
                />
                <button className="btn btn-primary" onClick={handleSendComment}>Send</button>
              </div>
              {replyTo && (
                <button
                  className="btn btn-ghost"
                  onClick={() => { setReplyTo(null); setCommentText(""); }}
                  style={{ marginBottom: 12, fontSize: 12 } as React.CSSProperties}
                >
                  Cancel reply to @{replyTo.username}
                </button>
              )}

              {comments.map((c) => (
                <CommentItem key={c.id} comment={c} logId={id ?? ""} onReply={handleReply} />
              ))}
              {comments.length === 0 && (
                <p style={{ color: `${theme.text}44`, fontSize: 14, textAlign: "center", paddingTop: 24 } as React.CSSProperties}>
                  No comments yet. Be the first!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  const c1Native = `hsl(${hue}, 42%, 20%)`;
  const c2Native = `hsl(${(hue + 30) % 360}, 38%, 8%)`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingBottom: 80 }}>
      {/* Hero poster — 340px */}
      <View style={{ width: "100%", height: 340, position: "relative" }}>
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[c1Native, c2Native]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ width: "100%", height: "100%" }}
          />
        )}
        {/* Gradient overlay from bottom */}
        <LinearGradient
          colors={[theme.bg + "00", theme.bg]}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60%" }}
        />
        {/* Back btn */}
        <Pressable
          onPress={() => router.back()}
          style={{
            position: "absolute",
            top: 48,
            left: 16,
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: 20,
            padding: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <ArrowLeft size={16} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Back</Text>
        </Pressable>
      </View>

      {/* Content */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        {/* Tags */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <View style={{ backgroundColor: visColor(log.visibility) + "22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
            <Text style={{ color: vcol, fontSize: 11, fontWeight: "700", textTransform: "capitalize" }}>
              {log.visibility.replace("_", " ")}
            </Text>
          </View>
          {log.is_fdfs && (
            <View style={{ backgroundColor: theme.accent800, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
              <Text style={{ color: theme.accent100, fontSize: 11, fontWeight: "700" }}>FDFS 🎟️</Text>
            </View>
          )}
          {log.format && (
            <View style={{ backgroundColor: theme.neutral800, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
              <Text style={{ color: theme.neutral100, fontSize: 11, fontWeight: "700" }}>{log.format}</Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={{
          fontSize: 24,
          fontWeight: "800",
          color: theme.text,
          marginBottom: 8,
          fontFamily: headingFamily,
        }} numberOfLines={3}>
          {log.movie}
        </Text>

        {/* Rating + date */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <StarRating value={log.rating ?? 0} onChange={() => {}} readonly size="small" />
          <Text style={{ fontSize: 13, color: `${theme.text}66` }}>{fmtShort(log.created_at)}</Text>
        </View>

        {/* Like / archive / edit actions */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          <Pressable
            onPress={handleLike}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: log.liked_by_caller ? theme.accent : theme.divider,
              backgroundColor: log.liked_by_caller ? theme.accent + "22" : "transparent",
            }}
          >
            <Heart size={16} color={log.liked_by_caller ? theme.accent : theme.text} weight={log.liked_by_caller ? "fill" : "regular"} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: log.liked_by_caller ? theme.accent : theme.text }}>
              {log.like_count} {log.like_count === 1 ? "like" : "likes"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/log/new?edit=${log.id}` as never)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.divider,
            }}
          >
            <PencilSimple size={16} color={theme.text} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={handleArchive}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.divider,
            }}
          >
            <Archive size={16} color={log.is_archived ? theme.accent : theme.text} weight={log.is_archived ? "fill" : "regular"} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: log.is_archived ? theme.accent : theme.text }}>
              {log.is_archived ? "Unarchive" : "Archive"}
            </Text>
          </Pressable>
        </View>

        {/* Meta cards */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
          <MetaCard label="Venue" value={log.theater} theme={theme} />
          <MetaCard label="Screen" value={log.screen} theme={theme} />
          <MetaCard label="Seats" value={log.seats?.length ? log.seats.join(", ") : undefined} theme={theme} />
          <MetaCard label="Screening" value={screeningStartLabel(log.screening_start_status) ?? undefined} theme={theme} />
          <MetaCard label="Punctuality" value={punctualityLabel(log.arrival_status) ?? undefined} theme={theme} />
        </View>

        {/* Notes */}
        {log.notes && (
          <>
            <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12, fontFamily: headingFamily }}>
              Review
            </Text>
            <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <Text style={{ fontSize: 14, lineHeight: 22, color: theme.text }}>{log.notes}</Text>
            </View>
          </>
        )}

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: theme.divider, marginBottom: 20 }} />

        {/* Comments — no comment_count field on MovieLog; real loaded-list count */}
        <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 12, fontFamily: headingFamily }}>
          Comments ({comments.length})
        </Text>

        {/* Compose */}
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end", marginBottom: 20 }}>
          <TextInput
            value={commentText}
            onChangeText={setCommentText}
            placeholder={replyTo ? `Replying to @${replyTo.username}…` : "Add a comment…"}
            placeholderTextColor={theme.text + "55"}
            style={{
              flex: 1,
              backgroundColor: theme.surface,
              color: theme.text,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
            }}
            multiline
            maxLength={500}
          />
          <Pressable
            onPress={handleSendComment}
            style={{ backgroundColor: theme.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Send</Text>
          </Pressable>
        </View>

        {replyTo && (
          <Pressable onPress={() => { setReplyTo(null); setCommentText(""); }}>
            <Text style={{ color: theme.accent, fontSize: 12, marginBottom: 10 }}>
              Cancel reply to @{replyTo.username}
            </Text>
          </Pressable>
        )}

        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} logId={id ?? ""} onReply={handleReply} />
        ))}
        {comments.length === 0 && (
          <Text style={{ color: theme.text, opacity: 0.4, fontSize: 14, textAlign: "center", paddingVertical: 24 }}>
            No comments yet. Be the first!
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
