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
  Ticket,
} from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useMovieLog, useArchiveLog } from "../hooks/useMovieLogs";
import { useLikeLog, useComments, useAddComment, useLikeComment } from "../hooks/useSocial";
import { Avatar } from "../components/ui/Avatar";
import { StarRating } from "../components/ui/StarRating";
import type { Comment } from "../types";
import { styles } from "./LogDetailScreen.styles";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function punctualityLabel(arrivalStatus?: string) {
  switch (arrivalStatus) {
    case "early": return "🟢 Arrived Early";
    case "on_time": return "🟡 On Time";
    case "late": return "🔴 Late";
    default: return null;
  }
}

// ─── Visibility colours ───────────────────────────────────────────────────────

function visibilityColour(v: string, accent: string) {
  switch (v) {
    case "public": return "#4caf7a";
    case "followers_only": return "#ffb800";
    case "private": return "#9e9e9e";
    default: return accent;
  }
}

// ─── CommentItem ─────────────────────────────────────────────────────────────

function CommentItem({
  comment,
  logId,
  depth = 0,
  onReply,
}: {
  comment: Comment;
  logId: string;
  depth?: number;
  onReply: (username: string, commentId: string) => void;
}) {
  const { theme } = useTheme();
  const likeComment = useLikeComment(logId);

  return (
    <View style={depth > 0 ? styles.replyIndent : undefined}>
      <View style={[styles.commentCard, { backgroundColor: theme.surface }]}>
        <View style={styles.commentHeader}>
          <Avatar
            name={comment.user?.display_name ?? comment.user?.username ?? "?"}
            size={28}
            uri={comment.user?.avatar_url}
          />
          <Text style={[styles.commentAuthor, { color: theme.text }]}>
            {comment.user?.display_name ?? comment.user?.username ?? "User"}
          </Text>
          <Text style={[styles.commentTime, { color: theme.text }]}>
            {formatDate(comment.created_at)}
          </Text>
        </View>

        <Text style={[styles.commentBody, { color: theme.text }]}>{comment.content}</Text>

        <View style={styles.commentActions}>
          <Pressable
            onPress={() => likeComment.mutate({ commentId: comment.id, liked: !!comment.is_liked })}
          >
            <Text style={[styles.commentActionText, { color: comment.is_liked ? theme.accent : theme.text }]}>
              ♥ {comment.like_count ?? 0}
            </Text>
          </Pressable>
          {depth === 0 && (
            <Pressable onPress={() => onReply(comment.user?.username ?? "User", comment.id)}>
              <Text style={[styles.commentActionText, { color: theme.accent }]}>Reply</Text>
            </Pressable>
          )}
        </View>
      </View>

      {(comment.replies ?? []).map((reply) => (
        <CommentItem key={reply.id} comment={reply} logId={logId} depth={1} onReply={onReply} />
      ))}
    </View>
  );
}

// ─── MetaCard ────────────────────────────────────────────────────────────────

function MetaCard({ label, value }: { label: string; value?: string | null }) {
  const { theme } = useTheme();
  if (!value) return null;
  return (
    <View style={[styles.metaCard, { backgroundColor: theme.surface }]}>
      <Text style={[styles.metaLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function LogDetailScreen() {
  const { theme, fontConfig } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isWeb = Platform.OS === "web";

  const { data: log, isLoading, error } = useMovieLog(id ?? "");
  const archiveLog = useArchiveLog();
  const likeLog = useLikeLog();
  const { data: comments = [] } = useComments(id ?? "");
  const addComment = useAddComment(id ?? "");

  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ username: string; commentId: string } | null>(null);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  if (error || !log) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>Log not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.accent, fontSize: 15 }}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  const vcol = visibilityColour(log.visibility, theme.accent);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleLike = () => likeLog.mutate({ logId: log.id, liked: log.is_liked });
  const handleArchive = () => archiveLog.mutate({ id: log.id, archive: !log.is_archived });
  const handleReply = (username: string, commentId: string) => {
    setReplyTo({ username, commentId });
    setCommentText(`@${username} `);
  };
  const handleSendComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    await addComment.mutateAsync({ content: text, parent_comment_id: replyTo?.commentId });
    setCommentText("");
    setReplyTo(null);
  };

  // ── Poster placeholder ───────────────────────────────────────────────────
  const posterEl = log.movie_poster_url ? (
    <Image source={{ uri: log.movie_poster_url }} style={isWeb ? styles.webPoster : { width: "100%", height: "100%" }} resizeMode="cover" />
  ) : (
    <View style={[isWeb ? styles.webPoster : { width: "100%", height: "100%" }, { backgroundColor: theme.surface, alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ fontSize: 40 }}>🎬</Text>
      <Text style={{ color: theme.text, fontSize: 12, marginTop: 8, textAlign: "center", paddingHorizontal: 8 }}>
        {log.movie_title}
      </Text>
    </View>
  );

  // ── Shared content ───────────────────────────────────────────────────────
  const contentBlock = (
    <View style={isWeb ? undefined : styles.contentPad}>
      {/* Back button (mobile only) */}
      {!isWeb && (
        <Pressable onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <ArrowLeft size={18} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 14, marginLeft: 4 }}>Back</Text>
        </Pressable>
      )}

      {/* Title + Visibility */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text, fontFamily: fontConfig.heading }]} numberOfLines={3}>
          {log.movie_title}
        </Text>
        <View style={[styles.visibilityBadge, { backgroundColor: vcol + "22" }]}>
          <Text style={[styles.visibilityText, { color: vcol }]}>{log.visibility.replace("_", " ")}</Text>
        </View>
      </View>

      {/* Rating + Date */}
      <View style={styles.ratingRow}>
        <StarRating value={log.rating ?? 0} onChange={() => {}} readonly size="small" />
        <Text style={[styles.dateText, { color: theme.text }]}>{formatShortDate(log.created_at)}</Text>
        {log.edited_at && (
          <View style={[styles.editedBadge, { backgroundColor: theme.neutral800 }]}>
            <Text style={[styles.editedText, { color: theme.text }]}>edited</Text>
          </View>
        )}
      </View>

      {/* Chips: Format + FDFS */}
      <View style={styles.badgesRow}>
        {log.format && (
          <View style={[styles.chip, { backgroundColor: theme.accent + "22" }]}>
            <Text style={[styles.chipText, { color: theme.accent }]}>{log.format}</Text>
          </View>
        )}
        {log.is_fdfs && (
          <View style={[styles.chip, { backgroundColor: "#FFB80022" }]}>
            <Text style={[styles.chipText, { color: "#FFB800" }]}>FDFS 🎟️</Text>
          </View>
        )}
        {log.ticket_url && (
          <Pressable
            onPress={() => {
              if (Platform.OS === "web") {
                (window as Window).open(log.ticket_url, "_blank");
              }
            }}
            style={[styles.chip, { backgroundColor: theme.surface }]}
          >
            <Ticket size={12} color={theme.text} weight="bold" />
            <Text style={[styles.chipText, { color: theme.text, marginLeft: 4 }]}>Ticket</Text>
          </Pressable>
        )}
      </View>

      {/* Provenance chip */}
      {(log.used_provider || log.used_model) && (
        <View style={[styles.provenanceChip, { backgroundColor: theme.surface }]}>
          <Robot size={13} color={theme.accent} />
          <Text style={[styles.provenanceText, { color: theme.text }]}>
            {[log.used_provider, log.used_model].filter(Boolean).join(" · ")}
          </Text>
        </View>
      )}

      {/* Meta grid */}
      <View style={styles.metaGrid}>
        <MetaCard label="Venue" value={log.venue?.name} />
        <MetaCard label="Screen" value={log.screen_number ? `Screen ${log.screen_number}` : undefined} />
        <MetaCard label="Seat" value={log.seat} />
        {log.screening_started_at && (
          <MetaCard label="Started" value={formatTime(log.screening_started_at)} />
        )}
        {log.arrived_at && (
          <MetaCard label="Arrived" value={formatTime(log.arrived_at)} />
        )}
        <MetaCard label="Punctuality" value={punctualityLabel(log.arrival_status) ?? undefined} />
      </View>

      {/* Notes */}
      {log.notes && (
        <>
          <Text style={[styles.sectionHead, { color: theme.text, fontFamily: fontConfig.heading }]}>Notes</Text>
          <View style={[styles.notesCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.notesText, { color: theme.text }]}>{log.notes}</Text>
          </View>
        </>
      )}

      {/* Action row */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={handleLike}
          style={[styles.actionBtn, { backgroundColor: log.is_liked ? theme.accent + "22" : theme.surface }]}
        >
          <Heart size={18} color={log.is_liked ? theme.accent : theme.text} weight={log.is_liked ? "fill" : "regular"} />
          <Text style={[styles.actionBtnText, { color: log.is_liked ? theme.accent : theme.text }]}>
            {log.like_count}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleArchive}
          style={[styles.actionBtn, { backgroundColor: theme.surface }]}
        >
          <Archive size={18} color={log.is_archived ? theme.accent : theme.text} weight={log.is_archived ? "fill" : "regular"} />
          <Text style={[styles.actionBtnText, { color: theme.text }]}>
            {log.is_archived ? "Unarchive" : "Archive"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push(`/log/new?edit=${log.id}` as never)}
          style={[styles.actionBtn, { backgroundColor: theme.surface }]}
        >
          <PencilSimple size={18} color={theme.text} />
          <Text style={[styles.actionBtnText, { color: theme.text }]}>Edit</Text>
        </Pressable>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.divider }]} />

      {/* Comments */}
      <Text style={[styles.sectionHead, { color: theme.text, fontFamily: fontConfig.heading }]}>
        <ChatCircle size={16} color={theme.text} /> Comments ({log.comment_count})
      </Text>

      {/* Compose */}
      <View style={styles.composeRow}>
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          placeholder={replyTo ? `Replying to @${replyTo.username}…` : "Add a comment…"}
          placeholderTextColor={theme.text + "55"}
          style={[styles.composeInput, { backgroundColor: theme.surface, color: theme.text }]}
          multiline
          maxLength={500}
        />
        <Pressable onPress={handleSendComment} style={[styles.sendBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.sendBtnText, { color: "#fff" }]}>Send</Text>
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
  );

  // ── Web layout ────────────────────────────────────────────────────────────
  if (isWeb) {
    return (
      <ScrollView style={[styles.root, { backgroundColor: theme.bg }]} contentContainerStyle={styles.scrollContent}>
        <View style={styles.webRow}>
          <View style={styles.webPosterCol}>{posterEl}</View>
          <View style={styles.webContentCol}>{contentBlock}</View>
        </View>
      </ScrollView>
    );
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    <ScrollView style={[styles.root, { backgroundColor: theme.bg }]} contentContainerStyle={styles.scrollContent}>
      {/* Hero poster with gradient overlay */}
      <View style={styles.heroContainer}>
        {posterEl}
        <LinearGradient
          colors={[theme.bg + "00", theme.bg]}
          style={styles.heroGradient}
        />
      </View>
      {contentBlock}
    </ScrollView>
  );
}
