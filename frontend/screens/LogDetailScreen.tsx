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
  Robot,
  Trash,
  Translate,
  SealCheck,
  CurrencyDollar,
  Receipt,
  Star,
  MapPin,
  ProjectorScreen,
  Armchair,
  Clock,
  Timer,
  Flag,
} from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { fontFamily } from "../constants/fonts";
import { useMovieLog, useArchiveLog, useDeleteLog } from "../hooks/useMovieLogs";
import { useLikeLog, useComments, useAddComment, useLikeComment, useDeleteComment, useEditComment, useLogLikes, useCommentLikes } from "../hooks/useSocial";
import { LikesListModal } from "../components/social/LikesListModal";
import { useAuth } from "../hooks/useAuth";
import { useVenueRating } from "../hooks/useVenueRating";
import { useMovie } from "../hooks/useSearch";
import { useToast } from "../context/ToastContext";
import { Avatar } from "../components/ui/Avatar";
import { StarRating } from "../components/ui/StarRating";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { hueFromTitle } from "../components/ui/Poster";
import { tmdbPosterUrl } from "../lib/tmdb";
import { avatarUrl } from "../lib/storage";
import type { Comment, MovieLog } from "../types";

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
// The date next to the title used to be fmtShort(log.created_at) — when
// the row was logged, not when the film was actually watched. watched_date
// was never read anywhere in this file. Falls back to created_at only when
// watched_date itself is missing (an older/incomplete row) — this is the
// one date on the screen that always needs a value to anchor the entry, so
// it doesn't follow the hide-if-empty rule the meta rows below it do.
function fmtWatched(log: MovieLog): string {
  const dateStr = new Date(log.watched_date ?? log.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  if (!log.watched_time) return dateStr;
  // watched_date ("YYYY-MM-DD") and watched_time ("HH:MM") are two separate
  // plain fields with no timezone math tying them together — timezone_abbrv
  // is print-only context from the ticket (e.g. "IST"), not something to
  // convert through. Formatting watched_time via a throwaway Date just for
  // its 12-hour-clock/AM-PM rendering, not treating it as a real instant.
  const [h, m] = log.watched_time.split(":");
  const t = new Date();
  t.setHours(Number(h), Number(m), 0, 0);
  const timeStr = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateStr} · ${timeStr}${log.timezone_abbrv ? " " + log.timezone_abbrv : ""}`;
}
function punctualityLabel(s?: string) {
  return s === "early" ? "🟢 Arrived Early" : s === "on_time" ? "🟡 On Time" : s === "late" ? "🔴 Late" : null;
}
function screeningStartLabel(s?: string) {
  return s === "early" ? "Started Early" : s === "on_time" ? "Started On Time"
    : s === "delayed" ? "Delayed" : s === "cancelled" ? "Cancelled" : null;
}
function fmtPrice(price?: number, currency?: string): string | undefined {
  if (price == null) return undefined;
  return currency ? `${currency} ${price.toFixed(2)}` : price.toFixed(2);
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
  const router = useRouter();
  const { user } = useAuth();
  const likeComment = useLikeComment(logId);
  const deleteComment = useDeleteComment(logId);
  const editComment = useEditComment(logId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text ?? "");
  const { data: commentLikes, isLoading: commentLikesLoading } = useCommentLikes(comment.id, showLikes);

  const startEdit = () => { setEditText(comment.text ?? ""); setIsEditing(true); };
  const saveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === comment.text) { setIsEditing(false); return; }
    editComment.mutate({ commentId: comment.id, text: trimmed }, { onSuccess: () => setIsEditing(false) });
  };

  const isOwn = !!user && comment.user_id === user.id;
  const isDeleted = !!comment.deleted_at;
  const goToProfile = () => comment.username && router.push(`/(app)/profile/${comment.username}` as any);

  return (
    <View style={depth > 0 ? { marginLeft: 28, marginTop: 6 } : undefined}>
      <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 12, marginBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          {/* Comment has no display_name/avatar_url — only a flat username */}
          <Pressable onPress={goToProfile} disabled={!comment.username}>
            <Avatar name={comment.username ?? "?"} size="sm" />
          </Pressable>
          <Pressable onPress={goToProfile} disabled={!comment.username}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text }}>
              {comment.username ?? "User"}
            </Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: theme.text, opacity: 0.5 }}>{fmtDate(comment.created_at)}</Text>
          {!!comment.edited_at && !isDeleted && (
            <Text style={{ fontSize: 11, color: theme.text, opacity: 0.4, fontStyle: "italic" }}>(edited)</Text>
          )}
        </View>
        {isDeleted ? (
          <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text, opacity: 0.5, fontStyle: "italic" }}>
            [deleted]
          </Text>
        ) : isEditing ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              style={{
                fontSize: 14, lineHeight: 20, color: theme.text,
                backgroundColor: theme.bg, borderRadius: 8, borderWidth: 1, borderColor: theme.divider,
                padding: 8, minHeight: 60, textAlignVertical: "top",
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={saveEdit} disabled={editComment.isPending}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.accent }}>{editComment.isPending ? "Saving…" : "Save"}</Text>
              </Pressable>
              <Pressable onPress={() => setIsEditing(false)} disabled={editComment.isPending}>
                <Text style={{ fontSize: 12, color: theme.text, opacity: 0.6 }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>{comment.text}</Text>
        )}
        {!isDeleted && !isEditing && (
          <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
            <Pressable onPress={() => likeComment.mutate({ commentId: comment.id, liked: !!comment.liked_by_caller })}>
              <Text style={{ fontSize: 12, color: comment.liked_by_caller ? theme.accent : theme.text }}>
                ♥{" "}
                {comment.like_count ? (
                  // Nested Pressable — same "innermost responder wins"
                  // pattern as the log's own like count; opens who-liked
                  // instead of toggling the like.
                  <Text onPress={(e: any) => { e?.stopPropagation?.(); setShowLikes(true); }} style={{ textDecorationLine: "underline" }}>
                    {comment.like_count}
                  </Text>
                ) : (
                  comment.like_count ?? 0
                )}
              </Text>
            </Pressable>
            <LikesListModal visible={showLikes} entries={commentLikes} isLoading={commentLikesLoading} onClose={() => setShowLikes(false)} />
            {depth === 0 && (
              <Pressable onPress={() => onReply(comment.username ?? "User", comment.id)}>
                <Text style={{ fontSize: 12, color: theme.accent }}>Reply</Text>
              </Pressable>
            )}
            {isOwn && (
              <Pressable onPress={startEdit}>
                <Text style={{ fontSize: 12, color: theme.accent }}>Edit</Text>
              </Pressable>
            )}
            {isOwn && (
              <Pressable onPress={() => setConfirmingDelete(true)}>
                <Text style={{ fontSize: 12, color: theme.error }}>Delete</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {(comment.replies ?? []).map((r) => (
        <CommentItem key={r.id} comment={r} logId={logId} depth={1} onReply={onReply} />
      ))}
      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete comment"
        message="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { deleteComment.mutate(comment.id); setConfirmingDelete(false); }}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}

// ─── Meta list ────────────────────────────────────────────────────────────────
// Used to be 6 individually-bordered cards in a 3-column grid — every field,
// present or not, got its own box. Rebuilt as rows inside one shared
// container: less boxy, and each row hides outright when its value is
// empty (per the "hide, don't show a dash" choice) rather than leaving a
// gap in the grid.

interface MetaRowData {
  // phosphor-react-native's icon components all share this same call
  // signature (size/color/weight), close enough to treat interchangeably
  // here without importing each one's own prop type.
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value?: string | null;
  // Set only for rows with a real id to link to — an older log (or one
  // whose venue was free-typed before theatre selection was required)
  // can have a `theater` string with no `theatre_id` behind it, and a
  // plain-text venue name has nowhere real to link to.
  onPress?: () => void;
}

function buildMetaRows(log: MovieLog, onNavigate: (path: string) => void): MetaRowData[] {
  return [
    { Icon: MapPin, label: "Venue", value: log.theater, onPress: log.theatre_id ? () => onNavigate(`/(app)/venue/${log.theatre_id}`) : undefined },
    { Icon: ProjectorScreen, label: "Screen", value: log.screen, onPress: (log.theatre_id && log.screen_id) ? () => onNavigate(`/(app)/venue/${log.theatre_id}/screen/${log.screen_id}`) : undefined },
    { Icon: Armchair, label: "Seats", value: log.seats?.length ? log.seats.join(", ") : undefined },
    { Icon: Translate, label: "Language", value: log.language },
    { Icon: SealCheck, label: "Certificate", value: log.certificate },
    { Icon: CurrencyDollar, label: "Price", value: fmtPrice(log.price, log.currency) },
    { Icon: Receipt, label: "Booking ref", value: log.booking_ref },
    { Icon: Flag, label: "Screening", value: screeningStartLabel(log.screening_start_status) ?? undefined },
    { Icon: Timer, label: "Punctuality", value: punctualityLabel(log.arrival_status) ?? undefined },
    // Always present (created_at is required on MovieLog) — the one row
    // here that isn't subject to the hide-if-empty rule.
    { Icon: Clock, label: "Logged", value: fmtShort(log.created_at) },
  ];
}

function WebMetaList({ rows }: { rows: MetaRowData[] }) {
  const { theme } = useTheme();
  const visible = rows.filter((r) => r.value);
  if (!visible.length) return null;
  return (
    <div className="card" style={{ padding: 0, marginBottom: 24, overflow: "hidden" } as React.CSSProperties}>
      {visible.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 16px",
            borderBottom: i < visible.length - 1 ? `1px solid ${theme.divider}` : "none",
          } as React.CSSProperties}
        >
          <r.Icon size={16} color={`${theme.text}88`} />
          <span style={{ fontSize: 12, color: `${theme.text}88`, width: 100, flexShrink: 0 } as React.CSSProperties}>{r.label}</span>
          {r.onPress ? (
            <span
              onClick={r.onPress}
              className="tapc"
              style={{ fontSize: 14, fontWeight: 600, color: "var(--color-accent)", cursor: "pointer" } as React.CSSProperties}
            >
              {r.value}
            </span>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600 } as React.CSSProperties}>{r.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function MetaList({ rows, theme }: { rows: MetaRowData[]; theme: any }) {
  const visible = rows.filter((r) => r.value);
  if (!visible.length) return null;
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      {visible.map((r, i) => {
        const row = (
          <View
            style={{
              flexDirection: "row", alignItems: "center", gap: 10,
              paddingVertical: 11, paddingHorizontal: 14,
              borderBottomWidth: i < visible.length - 1 ? 1 : 0,
              borderBottomColor: theme.divider,
            }}
          >
            <r.Icon size={16} color={`${theme.text}88`} />
            <Text style={{ fontSize: 12, color: `${theme.text}88`, width: 92 }}>{r.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: r.onPress ? theme.accent : theme.text, flex: 1 }}>{r.value}</Text>
          </View>
        );
        return r.onPress ? <Pressable key={r.label} onPress={r.onPress}>{row}</Pressable> : <View key={r.label}>{row}</View>;
      })}
    </View>
  );
}

// ─── Venue ratings ──────────────────────────────────────────────────────────
// Screen/speaker/AC/seat, half-star 0.5-5.0 each, from useVenueRating (see
// that hook for why this reads from an account-export cache rather than a
// dedicated endpoint). The whole section hides if the log has none of the
// four set, same hide-if-empty rule as the meta rows above.

const VENUE_RATING_ROWS: { key: "screen_rating" | "speaker_rating" | "ac_rating" | "seat_rating"; label: string }[] = [
  { key: "screen_rating", label: "Screen" },
  { key: "speaker_rating", label: "Speakers" },
  { key: "ac_rating", label: "AC" },
  { key: "seat_rating", label: "Seats" },
];

function WebVenueRatings({ rating }: { rating?: { screen_rating?: number; speaker_rating?: number; ac_rating?: number; seat_rating?: number } }) {
  const { theme } = useTheme();
  const rows = VENUE_RATING_ROWS.filter((r) => rating?.[r.key] != null);
  if (!rows.length) return null;
  return (
    <div className="card" style={{ padding: 0, marginBottom: 24, overflow: "hidden" } as React.CSSProperties}>
      {rows.map((r, i) => (
        <div
          key={r.key}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 16px",
            borderBottom: i < rows.length - 1 ? `1px solid ${theme.divider}` : "none",
          } as React.CSSProperties}
        >
          <span style={{ fontSize: 12, color: `${theme.text}88`, width: 100, flexShrink: 0 } as React.CSSProperties}>{r.label}</span>
          <Star size={13} weight="fill" color={theme.accent} />
          <span style={{ fontSize: 14, fontWeight: 600 } as React.CSSProperties}>{rating![r.key]!.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function VenueRatings({ rating, theme }: { rating?: { screen_rating?: number; speaker_rating?: number; ac_rating?: number; seat_rating?: number }; theme: any }) {
  const rows = VENUE_RATING_ROWS.filter((r) => rating?.[r.key] != null);
  if (!rows.length) return null;
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      {rows.map((r, i) => (
        <View
          key={r.key}
          style={{
            flexDirection: "row", alignItems: "center", gap: 10,
            paddingVertical: 11, paddingHorizontal: 14,
            borderBottomWidth: i < rows.length - 1 ? 1 : 0,
            borderBottomColor: theme.divider,
          }}
        >
          <Text style={{ fontSize: 12, color: `${theme.text}88`, width: 92 }}>{r.label}</Text>
          <Star size={13} weight="fill" color={theme.accent} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{rating![r.key]!.toFixed(1)}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function LogDetailScreen() {
  const { theme, fontConfig } = useTheme();
  // The web branch below is a fixed 280px-poster + flex-1-content row —
  // never checked viewport width at all, so at phone width it didn't
  // reflow, it just overflowed sideways past the screen edge (confirmed:
  // at 392px the content column rendered ~110px wide, clipped, with the
  // rest of it off-screen to the right). (app)/_layout.tsx's shell already
  // swaps Sidebar for TabBar under 768px; this screen's own two-column
  // layout needed the same width check, just applied to its own markup
  // instead of the shell.
  const { isMobile } = useBreakpoint();
  // Web → CSS family stack; native → the registered TTF family (e.g. Sora_700Bold)
  const headingFamily = fontFamily(fontConfig, "heading", 700);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const { data: log, isLoading, error } = useMovieLog(id ?? "");
  const archiveLog = useArchiveLog();
  const deleteLog = useDeleteLog();
  const { showToast } = useToast();
  const likeLog = useLikeLog();
  const venueRating = useVenueRating(id ?? "");
  // log isn't guaranteed loaded yet here (still before the isLoading/error
  // early-returns below) — useMovie's own `enabled: !!movieId` check
  // handles that, same pattern as venueRating above.
  const { data: movieCatalog, isLoading: isMovieLoading } = useMovie(log?.movie_id);
  const { data: comments = [], loadMore: loadMoreComments, hasMore: hasMoreComments, isFetching: isFetchingComments } = useComments(id ?? "");
  const [showLogLikes, setShowLogLikes] = useState(false);
  const { data: logLikes, isLoading: logLikesLoading } = useLogLikes(id, showLogLikes);
  const addComment = useAddComment(id ?? "");

  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ username: string; commentId: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
  // Edit/Archive/Delete only ever make sense on your own log — now that
  // GET /movie-logs/{id} can return someone else's public log too (see
  // useMovieLogs.ts), those actions would otherwise render for a log the
  // backend will reject any write against (update_log/delete_log stay
  // owner-only by design). log.user_id is itself null on an anonymous
  // log, which correctly falls through to "not mine" here too.
  const isOwnLog = !!user && !!log.user_id && log.user_id === user.id;
  const handleLike = () => likeLog.mutate({ logId: log.id, liked: !!log.liked_by_caller });
  // Archiving just flips is_archived and the log silently drops out of
  // Library's default view — with no confirmation of any kind, that read
  // as "the button doesn't do anything" (compounded by the real
  // useMovieLogs `archived`/`archived_only` param bug that also made the
  // Archived filter chip never show the log again either — fixed
  // separately in useMovieLogs.ts). The toast is what actually tells the
  // user their tap did something.
  const handleArchive = () => {
    const archive = !log.is_archived;
    archiveLog.mutate(
      { id: log.id, archive },
      {
        onSuccess: () => showToast(archive ? "Log archived" : "Log unarchived"),
        onError: () => showToast("Couldn't update — try again"),
      }
    );
  };
  // router.back() alone strands a user with nowhere to go if this screen
  // was opened directly (a deep link, a shared URL, a fresh tab) rather
  // than navigated to from within the app — there's no history to go back
  // to. canGoBack() is the documented way to tell the two cases apart.
  const goBackOrHome = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // No confirmation dialog existed anywhere for Delete — it wasn't even
  // reachable in the UI before this pass despite DELETE /movie-logs/{id}
  // being a real, working endpoint. Both platforms now go through the
  // shared ConfirmDialog (see components/ui/ConfirmDialog.tsx) instead of
  // native Alert.alert — which is a documented hard no-op on web
  // (react-native-web's Alert.alert does literally nothing), and even on
  // native was bare unstyled OS chrome with no relation to the app's theme.
  //
  // Deliberately mutateAsync + await, not mutate(id, {onSuccess}) — the
  // per-call onSuccess never actually fired in testing (confirmed via a
  // debug log that never printed, even though the DELETE itself reliably
  // reached the backend every time). useDeleteLog's own hook-level
  // onSuccess invalidates this exact log's query, which this component
  // re-renders in response to before the per-call callback's turn comes
  // up — a plain await sidesteps that ordering question entirely instead
  // of relying on exactly when React Query decides to run which callback.
  //
  // confirmDelete deliberately does NOT close the dialog before this
  // resolves — it used to, which is exactly the bug: dialog closes,
  // screen sits there for the 1-2s the request actually takes with zero
  // indication anything is happening, then navigates. The dialog now
  // stays open (ConfirmDialog's loading prop, driven by
  // deleteLog.isPending below) showing a spinner until the delete is
  // actually done, then navigates and confirms via toast. On failure it
  // closes and reports the error instead of leaving the user stuck
  // looking at a spinner that will never resolve.
  const doDelete = async () => {
    try {
      await deleteLog.mutateAsync(log.id);
      showToast("Log deleted");
      goBackOrHome();
    } catch (e: any) {
      setConfirmingDelete(false);
      showToast(e?.response?.data?.detail ?? "Couldn't delete — try again", "error");
    }
  };
  const handleDelete = () => setConfirmingDelete(true);
  const confirmDelete = () => { void doDelete(); };
  const handleReply = (username: string, commentId: string) => {
    setReplyTo({ username, commentId });
    setCommentText(`@${username} `);
  };
  const handleSendComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    // Was a bare `await` with no try/catch — a real rejection (403 on a
    // private log, a blocked pair, network drop) surfaced as an
    // unhandled promise rejection: the typed text just sat there with no
    // feedback, same silent-failure class the delete flow above this was
    // already fixed for.
    try {
      await addComment.mutateAsync({ text, parent_comment_id: replyTo?.commentId });
      setCommentText("");
      setReplyTo(null);
    } catch {
      showToast("Couldn't post comment — try again", "error");
    }
  };

  // Hue from title for poster gradient — `movie` can be null/undefined
  // (e.g. a log created without a resolved title), which crashed Array.from
  // with "undefined is not iterable". hueFromTitle already guards this.
  const hue = hueFromTitle(log.movie);
  // The log only carries movie_id, not a poster — resolved from the
  // catalog entry it points at. Every log created before movie_id got
  // wired up in LogFormScreen has none, so this stays a gradient for
  // those regardless — nothing to resolve, not a bug.
  const posterUrl = tmdbPosterUrl(movieCatalog?.poster_path, "w500");

  // Built once, dropped into whichever of the two platform-branch return
  // trees below actually renders — ConfirmDialog itself renders nothing
  // when !visible, so this is a no-op node the rest of the time.
  const deleteDialog = (
    <ConfirmDialog
      visible={confirmingDelete}
      title="Delete this log?"
      message="This can't be undone."
      confirmLabel="Delete"
      destructive
      loading={deleteLog.isPending}
      onConfirm={confirmDelete}
      onCancel={() => setConfirmingDelete(false)}
    />
  );
  const likesModal = (
    <LikesListModal
      visible={showLogLikes}
      entries={logLikes}
      isLoading={logLikesLoading}
      onClose={() => setShowLogLikes(false)}
    />
  );

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

        {deleteDialog}
        {likesModal}

        {/* Two-column on desktop/tablet; stacked, poster on top, below 768px. */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 20 : 32, alignItems: isMobile ? "stretch" : "flex-start" } as React.CSSProperties}>
          {/* Poster column — fixed 280px at tablet+; full width, capped so
              the 2:3 poster doesn't stretch edge-to-edge, when stacked.
              Only the social action (Like) lives here now — Edit/Archive/
              Delete moved to the content column's header row, next to the
              title they act on rather than under the poster image. */}
          <div style={isMobile ? { width: "100%", maxWidth: 280, margin: "0 auto" } as React.CSSProperties : { width: 280, flexShrink: 0 } as React.CSSProperties}>
            <div
              // isMovieLoading && !posterUrl — a log's real artwork is
              // still resolving (catalog GET, then the TMDB CDN fetch)
              // for a good couple seconds, commonly longer on a cold
              // backend — the pulse marks the placeholder as transient
              // rather than "this log genuinely has no poster".
              className={isMovieLoading && !posterUrl ? "poster-loading" : undefined}
              style={{
                aspectRatio: "2/3",
                borderRadius: 12,
                overflow: "hidden",
                background: posterUrl
                  ? `url(${posterUrl}) center/cover`
                  : `linear-gradient(155deg, hsl(${hue} 42% 20%), hsl(${(hue + 30) % 360} 38% 8%))`,
              } as React.CSSProperties}
            />

            <button
              className={`btn btn-block ${log.liked_by_caller ? "btn-primary" : "btn-secondary"}`}
              onClick={handleLike}
              style={{ marginTop: 12 } as React.CSSProperties}
            >
              <Heart size={14} weight={log.liked_by_caller ? "fill" : "regular"} />
              {log.like_count > 0 ? (
                <span
                  onClick={(e) => { e.stopPropagation(); setShowLogLikes(true); }}
                  style={{ textDecoration: "underline" } as React.CSSProperties}
                >
                  {log.like_count} {log.like_count === 1 ? "like" : "likes"}
                </span>
              ) : (
                <span>{log.like_count} likes</span>
              )}
            </button>
          </div>

          {/* Content column */}
          <div style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
            {/* Author — only ever present on a public/feed view of someone
                else's log (username/display_name/avatar_path are flat
                columns joined in only on those views, per MovieLog's own
                comment); the caller's own log GET never carries them, so
                this naturally never shows on your own logs without an
                extra check. */}
            {log.username && (
              <div
                onClick={() => router.push(`/(app)/profile/${log.username}` as any)}
                className="tapc"
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" } as React.CSSProperties}
              >
                <Avatar name={log.display_name ?? log.username} uri={avatarUrl(log.avatar_path)} size="sm" />
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.text } as React.CSSProperties}>
                  {log.display_name ?? log.username}
                </span>
              </div>
            )}
            {/* Tags (left) + owner actions (right) */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 } as React.CSSProperties}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 } as React.CSSProperties}>
                <span className="tag" style={{ backgroundColor: vcol + "22", color: vcol } as React.CSSProperties}>
                  {log.visibility.replace("_", " ")}
                </span>
                {log.is_fdfs && <span className="tag tag-accent">FDFS 🎟️</span>}
                {/* is_fdfs implies is_first_day server-side (schemas/movie_logs.py's
                    _fdfs_implies_first_day) — showing both tags when both are
                    true would just repeat "opening day" twice. */}
                {log.is_first_day && !log.is_fdfs && <span className="tag tag-accent">Opening Day</span>}
                {log.favorite_position != null && (
                  <span className="tag" style={{ backgroundColor: theme.accent800, color: theme.accent100, display: "flex", alignItems: "center", gap: 4 } as React.CSSProperties}>
                    <Star size={11} weight="fill" color={theme.accent100} />
                    Favorite
                  </span>
                )}
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

              {/* Edit/Archive/Delete — grouped as "manage this entry"
                  separate from the social Like action by the poster.
                  Delete never existed in this UI before, despite DELETE
                  /movie-logs/{id} being a real endpoint. A plain
                  btn-secondary icon button (transparent fill, a
                  1.5px divider-colour border) reads as barely-there
                  against the page background — each now carries a real
                  surfaceHigh fill so the three read as distinct,
                  findable buttons at rest, not just on hover; Delete
                  additionally gets an error-tinted fill/border so its
                  destructive weight is visible without having to hover
                  to discover the red icon color. */}
              {isOwnLog && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 } as React.CSSProperties}>
                  <button
                    className="btn btn-icon"
                    title="Edit"
                    onClick={() => router.push(`/log/new?edit=${log.id}` as never)}
                    style={{ backgroundColor: theme.surfaceHigh, border: `1px solid ${theme.divider}` } as React.CSSProperties}
                  >
                    <PencilSimple size={17} />
                  </button>
                  <button
                    className="btn btn-icon"
                    title={log.is_archived ? "Unarchive" : "Archive"}
                    onClick={handleArchive}
                    style={log.is_archived
                      ? { color: theme.accent, backgroundColor: `${theme.accent}1a`, border: `1px solid ${theme.accent}` } as React.CSSProperties
                      : { backgroundColor: theme.surfaceHigh, border: `1px solid ${theme.divider}` } as React.CSSProperties}
                  >
                    <Archive size={17} weight={log.is_archived ? "fill" : "regular"} />
                  </button>
                  <button
                    className="btn btn-icon"
                    title="Delete"
                    onClick={handleDelete}
                    style={{ color: theme.error, backgroundColor: `${theme.error}15`, border: `1px solid ${theme.error}55` } as React.CSSProperties}
                  >
                    <Trash size={17} />
                  </button>
                </div>
              )}
            </div>

            {/* Title — links to the catalog movie page when this log has
                a real movie_id (a free-typed title with no TMDB pick
                behind it has nowhere real to link to). */}
            <h1
              onClick={log.movie_id ? () => router.push(`/(app)/movie/${log.movie_id}` as any) : undefined}
              className={log.movie_id ? "tapc" : undefined}
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: theme.text,
                margin: "0 0 8px",
                lineHeight: 1.2,
                letterSpacing: -0.3,
                fontFamily: headingFamily,
                cursor: log.movie_id ? "pointer" : undefined,
              } as React.CSSProperties}>
              {log.movie}
            </h1>

            {/* Stars + watched date (was created_at — when the row was
                logged, not when the film was watched; watched_date was
                never read anywhere in this file before) */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" } as React.CSSProperties}>
              <StarRating value={log.rating ?? 0} onChange={() => {}} readonly />
              <span style={{ fontSize: 13, opacity: 0.6, color: theme.text } as React.CSSProperties}>{fmtWatched(log)}</span>
              {log.edited_at && (
                <span className="tag tag-neutral" style={{ fontSize: 11 } as React.CSSProperties}>edited</span>
              )}
            </div>

            <WebMetaList rows={buildMetaRows(log, (path) => router.push(path as any))} />
            <WebVenueRatings rating={venueRating} />

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
              {hasMoreComments && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={loadMoreComments}
                  disabled={isFetchingComments}
                  style={{ marginTop: 4 } as React.CSSProperties}
                >
                  {isFetchingComments ? "Loading…" : "Load more comments"}
                </button>
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
    <>
      {deleteDialog}
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
        {/* Real artwork still resolving — see the matching web comment. */}
        {isMovieLoading && !posterUrl && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: "60%", alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
          </View>
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
        {/* Author — see web branch's identical comment above: only ever
            present on a feed/public view of someone else's log. */}
        {log.username && (
          <Pressable
            onPress={() => router.push(`/(app)/profile/${log.username}` as any)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}
          >
            <Avatar name={log.display_name ?? log.username} uri={avatarUrl(log.avatar_path)} size="sm" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text }}>
              {log.display_name ?? log.username}
            </Text>
          </Pressable>
        )}
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
          {/* is_fdfs implies is_first_day server-side — showing both would
              just repeat "opening day" twice. */}
          {log.is_first_day && !log.is_fdfs && (
            <View style={{ backgroundColor: theme.accent800, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
              <Text style={{ color: theme.accent100, fontSize: 11, fontWeight: "700" }}>Opening Day</Text>
            </View>
          )}
          {log.favorite_position != null && (
            <View style={{ backgroundColor: theme.accent800, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
              <Star size={11} weight="fill" color={theme.accent100} />
              <Text style={{ color: theme.accent100, fontSize: 11, fontWeight: "700" }}>Favorite</Text>
            </View>
          )}
          {log.format && (
            <View style={{ backgroundColor: theme.neutral800, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
              <Text style={{ color: theme.neutral100, fontSize: 11, fontWeight: "700" }}>{log.format}</Text>
            </View>
          )}
        </View>

        {/* Title — see the web branch's identical comment on movie_id */}
        <Text
          onPress={log.movie_id ? () => router.push(`/(app)/movie/${log.movie_id}` as any) : undefined}
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: theme.text,
            marginBottom: 8,
            fontFamily: headingFamily,
          }} numberOfLines={3}>
          {log.movie}
        </Text>

        {/* Rating + watched date (was created_at — when the row was
            logged, not when the film was watched) */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <StarRating value={log.rating ?? 0} onChange={() => {}} readonly size="small" />
          <Text style={{ fontSize: 13, color: `${theme.text}66` }}>{fmtWatched(log)}</Text>
        </View>

        {/* Like (social, stays prominent) + Edit/Archive/Delete (owner
            management, compact icon buttons — Delete never existed in this
            UI before despite the endpoint being real and working). */}
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
            {log.like_count > 0 ? (
              // Nested Pressable — RN gives the innermost matched
              // responder the touch, so tapping the count opens the
              // likes list without also toggling the outer Like button.
              <Pressable onPress={() => setShowLogLikes(true)} hitSlop={6}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: log.liked_by_caller ? theme.accent : theme.text, textDecorationLine: "underline" }}>
                  {log.like_count} {log.like_count === 1 ? "like" : "likes"}
                </Text>
              </Pressable>
            ) : (
              <Text style={{ fontSize: 13, fontWeight: "600", color: log.liked_by_caller ? theme.accent : theme.text }}>
                0 likes
              </Text>
            )}
          </Pressable>
          {/* A transparent-fill button outlined only in divider-colour
              read as barely-there against the page — same fix as the
              matching web buttons: a real surfaceHigh fill so these
              three are findable at a glance, not just on a hover state
              touch doesn't even have; Delete gets an error tint. */}
          {isOwnLog && (
            <>
              <Pressable
                onPress={() => router.push(`/log/new?edit=${log.id}` as never)}
                style={{ width: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: theme.divider, backgroundColor: theme.surfaceHigh }}
              >
                <PencilSimple size={17} color={theme.text} />
              </Pressable>
              <Pressable
                onPress={handleArchive}
                style={{
                  width: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1,
                  borderColor: log.is_archived ? theme.accent : theme.divider,
                  backgroundColor: log.is_archived ? `${theme.accent}1a` : theme.surfaceHigh,
                }}
              >
                <Archive size={17} color={log.is_archived ? theme.accent : theme.text} weight={log.is_archived ? "fill" : "regular"} />
              </Pressable>
              <Pressable
                onPress={handleDelete}
                style={{ width: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: `${theme.error}55`, backgroundColor: `${theme.error}15` }}
              >
                <Trash size={17} color={theme.error} />
              </Pressable>
            </>
          )}
        </View>

        <MetaList rows={buildMetaRows(log, (path) => router.push(path as any))} theme={theme} />
        <VenueRatings rating={venueRating} theme={theme} />

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
        {hasMoreComments && (
          <Pressable
            onPress={loadMoreComments}
            disabled={isFetchingComments}
            style={{ paddingVertical: 12, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: theme.divider, marginTop: 4 }}
          >
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
              {isFetchingComments ? "Loading…" : "Load more comments"}
            </Text>
          </Pressable>
        )}
      </View>
      </ScrollView>
    </>
  );
}
