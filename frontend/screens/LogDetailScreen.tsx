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
  Alert,
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
import { useLikeLog, useComments, useAddComment, useLikeComment } from "../hooks/useSocial";
import { useVenueRating } from "../hooks/useVenueRating";
import { Avatar } from "../components/ui/Avatar";
import { StarRating } from "../components/ui/StarRating";
import { hueFromTitle } from "../components/ui/Poster";
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
}

function buildMetaRows(log: MovieLog): MetaRowData[] {
  return [
    { Icon: MapPin, label: "Venue", value: log.theater },
    { Icon: ProjectorScreen, label: "Screen", value: log.screen },
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
          <span style={{ fontSize: 14, fontWeight: 600 } as React.CSSProperties}>{r.value}</span>
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
      {visible.map((r, i) => (
        <View
          key={r.label}
          style={{
            flexDirection: "row", alignItems: "center", gap: 10,
            paddingVertical: 11, paddingHorizontal: 14,
            borderBottomWidth: i < visible.length - 1 ? 1 : 0,
            borderBottomColor: theme.divider,
          }}
        >
          <r.Icon size={16} color={`${theme.text}88`} />
          <Text style={{ fontSize: 12, color: `${theme.text}88`, width: 92 }}>{r.label}</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text, flex: 1 }}>{r.value}</Text>
        </View>
      ))}
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

  const { data: log, isLoading, error } = useMovieLog(id ?? "");
  const archiveLog = useArchiveLog();
  const deleteLog = useDeleteLog();
  const likeLog = useLikeLog();
  const venueRating = useVenueRating(id ?? "");
  const { data: comments = [] } = useComments(id ?? "");
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
  const handleLike = () => likeLog.mutate({ logId: log.id, liked: !!log.liked_by_caller });
  const handleArchive = () => archiveLog.mutate({ id: log.id, archive: !log.is_archived });
  // router.back() alone strands a user with nowhere to go if this screen
  // was opened directly (a deep link, a shared URL, a fresh tab) rather
  // than navigated to from within the app — there's no history to go back
  // to. canGoBack() is the documented way to tell the two cases apart.
  const goBackOrHome = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // No confirmation dialog existed anywhere for Delete — it wasn't even
  // reachable in the UI before this pass despite DELETE /movie-logs/{id}
  // being a real, working endpoint. Native uses Alert.alert, the same
  // pattern SettingsScreen's own delete-account already uses; web uses the
  // app's existing .dialog-backdrop/.dialog classes (designCss.ts), not a
  // new one.
  //
  // Deliberately mutateAsync + await, not mutate(id, {onSuccess}) — the
  // per-call onSuccess never actually fired in testing (confirmed via a
  // debug log that never printed, even though the DELETE itself reliably
  // reached the backend every time). useDeleteLog's own hook-level
  // onSuccess invalidates this exact log's query, which this component
  // re-renders in response to before the per-call callback's turn comes
  // up — a plain await sidesteps that ordering question entirely instead
  // of relying on exactly when React Query decides to run which callback.
  const doDelete = async () => {
    await deleteLog.mutateAsync(log.id);
    goBackOrHome();
  };
  const handleDelete = () => {
    if (Platform.OS === "web") {
      setConfirmingDelete(true);
      return;
    }
    Alert.alert("Delete this log?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void doDelete(); } },
    ]);
  };
  const confirmDelete = () => {
    setConfirmingDelete(false);
    void doDelete();
  };
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

        {confirmingDelete && (
          <div className="dialog-backdrop" onClick={() => setConfirmingDelete(false)}>
            <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: 340 } as React.CSSProperties}>
              <div className="dialog-title">Delete this log?</div>
              <div className="dialog-body">This can't be undone.</div>
              <div className="dialog-actions">
                <button className="btn btn-secondary" onClick={() => setConfirmingDelete(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  style={{ color: "#EF4444", borderColor: "#EF4444" } as React.CSSProperties}
                  onClick={confirmDelete}
                  disabled={deleteLog.isPending}
                >
                  {deleteLog.isPending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Two-column on desktop/tablet; stacked, poster on top, below 768px. */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 20 : 32, alignItems: isMobile ? "stretch" : "flex-start" } as React.CSSProperties}>
          {/* Poster column — fixed 280px at tablet+; full width, capped so
              the 2:3 poster doesn't stretch edge-to-edge, when stacked.
              Only the social action (Like) lives here now — Edit/Archive/
              Delete moved to the content column's header row, next to the
              title they act on rather than under the poster image. */}
          <div style={isMobile ? { width: "100%", maxWidth: 280, margin: "0 auto" } as React.CSSProperties : { width: 280, flexShrink: 0 } as React.CSSProperties}>
            <div style={{
              aspectRatio: "2/3",
              borderRadius: 12,
              overflow: "hidden",
              background: posterUrl
                ? `url(${posterUrl}) center/cover`
                : `linear-gradient(155deg, hsl(${hue} 42% 20%), hsl(${(hue + 30) % 360} 38% 8%))`,
            } as React.CSSProperties} />

            <button
              className={`btn btn-block ${log.liked_by_caller ? "btn-primary" : "btn-secondary"}`}
              onClick={handleLike}
              style={{ marginTop: 12 } as React.CSSProperties}
            >
              <Heart size={14} weight={log.liked_by_caller ? "fill" : "regular"} />
              {log.like_count} {log.like_count === 1 ? "like" : "likes"}
            </button>
          </div>

          {/* Content column */}
          <div style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
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

              {/* Edit/Archive/Delete — compact icon buttons, grouped as
                  "manage this entry" separate from the social Like action
                  by the poster. Delete never existed in this UI before,
                  despite DELETE /movie-logs/{id} being a real endpoint. */}
              <div style={{ display: "flex", gap: 4, flexShrink: 0 } as React.CSSProperties}>
                <button
                  className="btn btn-icon btn-secondary"
                  title="Edit"
                  onClick={() => router.push(`/log/new?edit=${log.id}` as never)}
                >
                  <PencilSimple size={16} />
                </button>
                <button
                  className="btn btn-icon btn-secondary"
                  title={log.is_archived ? "Unarchive" : "Archive"}
                  onClick={handleArchive}
                  style={log.is_archived ? { color: theme.accent, borderColor: theme.accent } as React.CSSProperties : undefined}
                >
                  <Archive size={16} weight={log.is_archived ? "fill" : "regular"} />
                </button>
                <button
                  className="btn btn-icon btn-secondary"
                  title="Delete"
                  onClick={handleDelete}
                  style={{ color: "#EF4444" } as React.CSSProperties}
                >
                  <Trash size={16} />
                </button>
              </div>
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

            <WebMetaList rows={buildMetaRows(log)} />
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
            <Text style={{ fontSize: 13, fontWeight: "600", color: log.liked_by_caller ? theme.accent : theme.text }}>
              {log.like_count} {log.like_count === 1 ? "like" : "likes"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/log/new?edit=${log.id}` as never)}
            style={{ width: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: theme.divider }}
          >
            <PencilSimple size={16} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={handleArchive}
            style={{
              width: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1,
              borderColor: log.is_archived ? theme.accent : theme.divider,
            }}
          >
            <Archive size={16} color={log.is_archived ? theme.accent : theme.text} weight={log.is_archived ? "fill" : "regular"} />
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={{ width: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: theme.divider }}
          >
            <Trash size={16} color="#EF4444" />
          </Pressable>
        </View>

        <MetaList rows={buildMetaRows(log)} theme={theme} />
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
      </View>
    </ScrollView>
  );
}
