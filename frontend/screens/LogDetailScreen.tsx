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
 *
 * These are two real, deliberate visual designs — narrow and wide
 * screens legitimately look different here (hero-poster-with-overlay vs
 * two-column poster-beside-content), so both stay (see Part C of the
 * architecture-unification plan's own thesis on this exact screen), now
 * gated by isMobile rather than Platform.OS. What used to be duplicated
 * for no reason — MetaList, VenueRatings, the tags row, the author row,
 * the Edit/Archive/Delete trio, the Like button, and the comment
 * compose/load-more controls — are each now one shared component both
 * layouts call, extending the pattern CommentItem already correctly
 * used (a single implementation, shared, since it was written).
 */
import React, { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useNavigateOnce } from "../hooks/useNavigateOnce";
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
import { Tag } from "../components/ui/Tag";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { useVenueRating } from "../hooks/useVenueRating";
import { useMovie } from "../hooks/useSearch";
import { useToast } from "../context/ToastContext";
import { Avatar } from "../components/ui/Avatar";
import { StarRating } from "../components/ui/StarRating";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { hueFromTitle } from "../components/ui/Poster";
import { ScreenLoader, Spinner } from "../components/ui/Spinner";
import { type as fontSizes } from "../constants/fonts";
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
  return s === "early" ? "Arrived Early" : s === "on_time" ? "On Time" : s === "late" ? "Late" : null;
}
// Was color-coded via a leading emoji dot (🟢/🟡/🔴) — dropping that
// signal outright (plain text, matching the adjacent Screening row)
// lost a genuinely nice touch, not just an emoji. Restored properly:
// MetaRowData's own leading icon (already there, Timer for this row)
// tints red/amber/green instead of adding a second dot element — same
// semantic-status-color pattern error/success/visColor() already use
// elsewhere in this file (fixed literals, not theme-derived — a status
// meaning should read the same regardless of which theme is active).
const AMBER = "#F5B700";
function punctualityIconColor(s: string | undefined): string | undefined {
  return s === "early" ? "#22C55E" : s === "late" ? "#EF4444" : s === "on_time" ? AMBER : undefined;
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

// ─── CommentItem — already the reference pattern this whole file follows now ──

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
          {/* Was username-only (no display_name/avatar_path on Comment at
              all — the backend's own comments view never joined them,
              unlike every other author-facing view in the app) —
              display_name ?? username now matches AuthorRow/PosterCard's
              own OwnerRow, both already using this exact fallback. */}
          <Pressable onPress={goToProfile} disabled={!comment.username}>
            <Avatar name={comment.display_name ?? comment.username ?? "?"} uri={avatarUrl(comment.avatar_path)} size="sm" />
          </Pressable>
          <Pressable onPress={goToProfile} disabled={!comment.username}>
            <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: theme.text }}>
              {comment.display_name ?? comment.username ?? "User"}
            </Text>
          </Pressable>
          <Text style={{ fontSize: fontSizes.sm, color: theme.text, opacity: 0.5 }}>{fmtDate(comment.created_at)}</Text>
          {!!comment.edited_at && !isDeleted && (
            <Text style={{ fontSize: fontSizes.xs, color: theme.text, opacity: 0.4, fontStyle: "italic" }}>(edited)</Text>
          )}
        </View>
        {isDeleted ? (
          <Text style={{ fontSize: fontSizes.base, lineHeight: 20, color: theme.text, opacity: 0.5, fontStyle: "italic" }}>
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
                fontSize: fontSizes.base, lineHeight: 20, color: theme.text,
                backgroundColor: theme.bg, borderRadius: 8, borderWidth: 1, borderColor: theme.divider,
                padding: 8, minHeight: 60, textAlignVertical: "top",
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={saveEdit} disabled={editComment.isPending}>
                <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: theme.accent }}>{editComment.isPending ? "Saving…" : "Save"}</Text>
              </Pressable>
              <Pressable onPress={() => setIsEditing(false)} disabled={editComment.isPending}>
                <Text style={{ fontSize: fontSizes.sm, color: theme.text, opacity: 0.6 }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: fontSizes.base, lineHeight: 20, color: theme.text }}>{comment.text}</Text>
        )}
        {!isDeleted && !isEditing && (
          <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
            <Pressable onPress={() => likeComment.mutate({ commentId: comment.id, liked: !!comment.liked_by_caller })}>
              <Text style={{ fontSize: fontSizes.sm, color: comment.liked_by_caller ? theme.accent : theme.text }}>
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
                <Text style={{ fontSize: fontSizes.sm, color: theme.accent }}>Reply</Text>
              </Pressable>
            )}
            {isOwn && (
              <Pressable onPress={startEdit}>
                <Text style={{ fontSize: fontSizes.sm, color: theme.accent }}>Edit</Text>
              </Pressable>
            )}
            {isOwn && (
              <Pressable onPress={() => setConfirmingDelete(true)}>
                <Text style={{ fontSize: fontSizes.sm, color: theme.error }}>Delete</Text>
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
// gap in the grid. One implementation now (was WebMetaList/MetaList,
// identical rows, only div+CSS vs View+Pressable).

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
  /** Overrides the row's own icon color — every row is the same muted
   * gray by default; only Punctuality sets this (red/amber/green). */
  iconColor?: string;
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
    { Icon: Timer, label: "Punctuality", value: punctualityLabel(log.arrival_status) ?? undefined, iconColor: punctualityIconColor(log.arrival_status) },
    // Always present (created_at is required on MovieLog) — the one row
    // here that isn't subject to the hide-if-empty rule.
    { Icon: Clock, label: "Logged", value: fmtShort(log.created_at) },
  ];
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
            <r.Icon size={16} color={r.iconColor ?? `${theme.text}88`} />
            <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}88`, width: 92 }}>{r.label}</Text>
            <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: r.onPress ? theme.accent : theme.text, flex: 1 }}>{r.value}</Text>
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
// four set, same hide-if-empty rule as the meta rows above. One
// implementation now, same reason as MetaList above.

const VENUE_RATING_ROWS: { key: "screen_rating" | "speaker_rating" | "ac_rating" | "seat_rating"; label: string }[] = [
  { key: "screen_rating", label: "Screen" },
  { key: "speaker_rating", label: "Speakers" },
  { key: "ac_rating", label: "AC" },
  { key: "seat_rating", label: "Seats" },
];

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
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}88`, width: 92 }}>{r.label}</Text>
          <Star size={13} weight="fill" color={theme.accent} />
          <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{rating![r.key]!.toFixed(1)}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Author row ─────────────────────────────────────────────────────────────
// Only ever present on a public/feed view of someone else's log
// (username/display_name/avatar_path are flat columns joined in only on
// those views, per MovieLog's own comment); the caller's own log GET
// never carries them, so this naturally never shows on your own logs
// without an extra check.

function AuthorRow({ log, theme, router }: { log: MovieLog; theme: any; router: ReturnType<typeof useRouter> }) {
  if (!log.username) return null;
  return (
    <Pressable
      onPress={() => router.push(`/(app)/profile/${log.username}` as any)}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}
    >
      <Avatar name={log.display_name ?? log.username} uri={avatarUrl(log.avatar_path)} size="sm" />
      <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: theme.text }}>
        {log.display_name ?? log.username}
      </Text>
    </Pressable>
  );
}

// ─── Tags row ───────────────────────────────────────────────────────────────

function TagsRow({ log, theme, vcol }: { log: MovieLog; theme: any; vcol: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <View style={{ backgroundColor: `${vcol}22`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
        <Text style={{ color: vcol, fontSize: fontSizes.xs, fontWeight: "700", textTransform: "capitalize" }}>
          {log.visibility.replace("_", " ")}
        </Text>
      </View>
      {log.is_fdfs && <Tag variant="accent" icon="ticket" label="FDFS" />}
      {/* is_fdfs implies is_first_day server-side (schemas/movie_logs.py's
          _fdfs_implies_first_day) — showing both tags when both are true
          would just repeat "opening day" twice. */}
      {log.is_first_day && !log.is_fdfs && <Tag variant="accent" label="Opening Day" />}
      {log.favorite_position != null && <Tag variant="accent" icon="star" label="Favorite" />}
      {log.format && <Tag variant="neutral" label={log.format} />}
      {(log.extraction_provider || log.extraction_model) && (
        <View style={{ backgroundColor: theme.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Robot size={11} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: fontSizes.xs, fontWeight: "700" }}>
            {[log.extraction_provider, log.extraction_model].filter(Boolean).join(" · ")}
          </Text>
        </View>
      )}
      {/* No direct ticket link — ticket_image_path is a Supabase Storage
          path, not a public URL; resolving it to a viewable link needs a
          signed-URL fetch, out of scope for this pass (same deferred-work
          class as the poster image). */}
    </View>
  );
}

// ─── Title + rating row ─────────────────────────────────────────────────────

function TitleAndRating({ log, theme, headingFamily, isMobile, router }: {
  log: MovieLog; theme: any; headingFamily?: string; isMobile: boolean; router: ReturnType<typeof useRouter>;
}) {
  return (
    <>
      {/* Links to the catalog movie page when this log has a real
          movie_id (a free-typed title with no TMDB pick behind it has
          nowhere real to link to). */}
      <Text
        onPress={log.movie_id ? () => router.push(`/(app)/movie/${log.movie_id}` as any) : undefined}
        numberOfLines={isMobile ? 3 : undefined}
        style={{
          fontSize: isMobile ? fontSizes.display : fontSizes.h2,
          fontWeight: isMobile ? "800" : "700",
          color: theme.text,
          marginBottom: 8,
          lineHeight: isMobile ? undefined : fontSizes.h2 * 1.2,
          letterSpacing: isMobile ? undefined : -0.3,
          fontFamily: headingFamily,
        }}
      >
        {log.movie}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: isMobile ? 10 : 12, marginBottom: isMobile ? 16 : 20, flexWrap: "wrap" }}>
        <StarRating value={log.rating ?? 0} onChange={() => {}} readonly size={isMobile ? "small" : undefined} />
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}99` }}>{fmtWatched(log)}</Text>
        {log.edited_at && <Tag variant="neutral" size="sm" label="edited" />}
      </View>
    </>
  );
}

// ─── Like button ────────────────────────────────────────────────────────────
// Same content everywhere (heart + like count, nested-Pressable-opens-
// likes-list) but a different position/size per layout — style is
// caller-supplied rather than baked in, same shape as every shared UI
// primitive in this app's own design system.

function LikeButton({ log, theme, onPress, onShowLikes, style }: {
  log: MovieLog; theme: any; onPress: () => void; onShowLikes: () => void; style?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[{
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
        paddingVertical: 10, borderRadius: 10, borderWidth: 1,
        borderColor: log.liked_by_caller ? theme.accent : theme.divider,
        backgroundColor: log.liked_by_caller ? `${theme.accent}22` : "transparent",
      }, style]}
    >
      <Heart size={16} color={log.liked_by_caller ? theme.accent : theme.text} weight={log.liked_by_caller ? "fill" : "regular"} />
      {log.like_count > 0 ? (
        // Nested Pressable — RN (and react-native-web) gives the innermost
        // matched responder the touch, so tapping the count opens the
        // likes list without also toggling the outer Like button; the
        // stopPropagation call is a defensive no-op there and the actual
        // fix on web, same pattern CommentItem's own like-count uses.
        <Pressable onPress={(e: any) => { e?.stopPropagation?.(); onShowLikes(); }} hitSlop={6}>
          <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: log.liked_by_caller ? theme.accent : theme.text, textDecorationLine: "underline" }}>
            {log.like_count} {log.like_count === 1 ? "like" : "likes"}
          </Text>
        </Pressable>
      ) : (
        <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: log.liked_by_caller ? theme.accent : theme.text }}>
          0 likes
        </Text>
      )}
    </Pressable>
  );
}

// ─── Edit/Archive/Delete — "manage this entry", separate from the social
// Like action. Delete never existed in this UI before, despite DELETE
// /movie-logs/{id} being a real, working endpoint. A plain transparent-
// fill button outlined only in divider-colour read as barely-there
// against the page — each carries a real surfaceHigh fill so the three
// read as distinct, findable buttons at rest, not just on hover (which
// touch doesn't even have); Delete additionally gets an error-tinted
// fill/border so its destructive weight is visible without hovering to
// discover the red icon color. ──────────────────────────────────────────

function ManageButtons({ log, theme, onEdit, onArchive, onDelete }: {
  log: MovieLog; theme: any; onEdit: () => void; onArchive: () => void; onDelete: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {/* accessibilityLabel on the Pressable (the real screen-reader
          target — react-native-web maps this to aria-label) AND `title`
          on the raw phosphor icon itself: these three icons are imported
          straight from phosphor-react-native, not through this app's own
          Icon.tsx wrapper, and react-native-web's Pressable/View has no
          path to a real DOM `title` attribute at all (not in RNW's
          forwarded-props list) — but phosphor's own IconProps DOES
          accept `title` (an SVG <title> child), which browsers natively
          show as a hover tooltip over the SVG, same visible effect. */}
      <Pressable
        onPress={onEdit}
        accessibilityLabel="Edit"
        style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: theme.divider, backgroundColor: theme.surfaceHigh }}
      >
        <PencilSimple size={17} color={theme.text} title="Edit" />
      </Pressable>
      <Pressable
        onPress={onArchive}
        accessibilityLabel={log.is_archived ? "Unarchive" : "Archive"}
        style={{
          width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1,
          borderColor: log.is_archived ? theme.accent : theme.divider,
          backgroundColor: log.is_archived ? `${theme.accent}1a` : theme.surfaceHigh,
        }}
      >
        <Archive
          size={17}
          color={log.is_archived ? theme.accent : theme.text}
          weight={log.is_archived ? "fill" : "regular"}
          title={log.is_archived ? "Unarchive" : "Archive"}
        />
      </Pressable>
      <Pressable
        onPress={onDelete}
        accessibilityLabel="Delete"
        style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: `${theme.error}55`, backgroundColor: `${theme.error}15` }}
      >
        <Trash size={17} color={theme.error} title="Delete" />
      </Pressable>
    </View>
  );
}

// ─── Comments section (heading + compose + list + load-more) ───────────────

function CommentsSection({
  theme, headingFamily, comments, isCommentsLoading, commentText, setCommentText,
  replyTo, setReplyTo, onSend, hasMoreComments, isFetchingComments, loadMoreComments, logId, onReply,
}: {
  theme: any; headingFamily?: string; comments: Comment[]; isCommentsLoading: boolean;
  commentText: string; setCommentText: (t: string) => void;
  replyTo: { username: string; commentId: string } | null; setReplyTo: (r: null) => void;
  onSend: () => void; hasMoreComments: boolean; isFetchingComments: boolean; loadMoreComments: () => void;
  logId: string; onReply: (username: string, commentId: string) => void;
}) {
  // Border-color-on-focus, not the app's global box-shadow ring — same
  // fix and same reasoning as SearchScreen's own search field (see that
  // file's comment): a raw TextInput with no .input-class treatment
  // otherwise picks up a hard-edged ring that doesn't match this box's
  // rounded corners.
  const [focused, setFocused] = useState(false);
  return (
    <View>
      {/* No comment_count field exists on MovieLog — this is the real
          count of the currently-loaded comment list. */}
      <Text style={{ fontSize: fontSizes.lg, fontWeight: "700", color: theme.text, marginBottom: 16, fontFamily: headingFamily }}>
        Comments{isCommentsLoading ? "" : ` (${comments.length})`}
      </Text>

      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={replyTo ? `Replying to @${replyTo.username}…` : "Add a comment…"}
          placeholderTextColor={`${theme.text}55`}
          style={{
            flex: 1, backgroundColor: theme.surface, color: theme.text,
            borderWidth: 1, borderColor: focused ? theme.accent : theme.divider,
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSizes.base,
            boxShadow: "none",
          } as any}
          multiline
          maxLength={500}
        />
        <Button label="Send" onPress={onSend} />
      </View>
      {replyTo && (
        <Button
          variant="ghost"
          label={`Cancel reply to @${replyTo.username}`}
          onPress={() => { setReplyTo(null); setCommentText(""); }}
          style={{ marginBottom: 12, alignSelf: "flex-start" }}
        />
      )}

      {comments.map((c) => (
        <CommentItem key={c.id} comment={c} logId={logId} onReply={onReply} />
      ))}
      {comments.length === 0 && (
        <Text style={{ color: theme.text, opacity: 0.4, fontSize: fontSizes.base, textAlign: "center", paddingVertical: 24 }}>
          No comments yet. Be the first!
        </Text>
      )}
      {hasMoreComments && (
        <Button
          variant="secondary"
          block
          label={isFetchingComments ? "Loading…" : "Load more comments"}
          loading={isFetchingComments}
          onPress={loadMoreComments}
          style={{ marginTop: 4 }}
        />
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function LogDetailScreen() {
  const { theme, fontConfig } = useTheme();
  // The web layout below is a fixed 280px-poster + flex-1-content row —
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
  const navigateOnce = useNavigateOnce();
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
  const { data: comments = [], loadMore: loadMoreComments, hasMore: hasMoreComments, isFetching: isFetchingComments, isLoading: isCommentsLoading } = useComments(id ?? "");
  const [showLogLikes, setShowLogLikes] = useState(false);
  const { data: logLikes, isLoading: logLikesLoading } = useLogLikes(id, showLogLikes);
  const addComment = useAddComment(id ?? "");

  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ username: string; commentId: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isLoading) return <ScreenLoader />;
  if (error || !log) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 40 }}>
        <Text style={{ fontSize: fontSizes.lg, color: theme.text }}>Log not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.accent, fontSize: fontSizes.md }}>← Go back</Text>
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
      showToast(e?.detail ?? e?.message ?? "Couldn't delete — try again", "error");
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
  const metaRows = buildMetaRows(log, (path) => router.push(path as any));
  const commentsSection = (
    <CommentsSection
      theme={theme}
      headingFamily={headingFamily}
      comments={comments}
      isCommentsLoading={isCommentsLoading}
      commentText={commentText}
      setCommentText={setCommentText}
      replyTo={replyTo}
      setReplyTo={setReplyTo}
      onSend={() => void handleSendComment()}
      hasMoreComments={hasMoreComments}
      isFetchingComments={isFetchingComments}
      loadMoreComments={loadMoreComments}
      logId={id ?? ""}
      onReply={handleReply}
    />
  );

  // ── Desktop/tablet: two-column, poster beside content ──────────────────────
  if (!isMobile) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any} contentContainerStyle={{ paddingTop: 24, paddingHorizontal: 32, paddingBottom: 40 }} contentInsetAdjustmentBehavior="automatic">
        <View style={{ maxWidth: 980, width: "100%", alignSelf: "center" }}>
          <Button variant="ghost" icon="caret-left" label="Back" onPress={() => router.back()} style={{ marginBottom: 20, alignSelf: "flex-start" }} />

          {deleteDialog}
          {likesModal}

          <View style={{ flexDirection: "row", gap: 32, alignItems: "flex-start" }}>
            {/* Poster column — fixed 280px. Only the social action (Like)
                lives here — Edit/Archive/Delete sit in the content
                column's header row, next to the title they act on rather
                than under the poster image. */}
            <View style={{ width: 280, flexShrink: 0 }}>
              <View
                style={{
                  aspectRatio: 2 / 3,
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: theme.neutral800,
                }}
              >
                {posterUrl ? (
                  <Image source={{ uri: posterUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                ) : (
                  <LinearGradient
                    colors={[`hsl(${hue}, 42%, 20%)`, `hsl(${(hue + 30) % 360}, 38%, 8%)`]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ width: "100%", height: "100%" }}
                  />
                )}
                {/* Real artwork still resolving — a couple seconds is
                    common on a cold backend; without this the gradient
                    placeholder reads as "no poster" rather than "loading". */}
                {isMovieLoading && !posterUrl && (
                  <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" } as any}>
                    <Spinner size="sm" color="rgba(255,255,255,0.7)" />
                  </View>
                )}
              </View>
              <LikeButton log={log} theme={theme} onPress={handleLike} onShowLikes={() => setShowLogLikes(true)} style={{ marginTop: 12, width: "100%" }} />
            </View>

            {/* Content column */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <AuthorRow log={log} theme={theme} router={router} />

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                <TagsRow log={log} theme={theme} vcol={vcol} />
                {isOwnLog && <ManageButtons log={log} theme={theme} onEdit={() => navigateOnce(`/log/new?edit=${log.id}` as never)} onArchive={handleArchive} onDelete={handleDelete} />}
              </View>

              <TitleAndRating log={log} theme={theme} headingFamily={headingFamily} isMobile={false} router={router} />

              <MetaList rows={metaRows} theme={theme} />
              <VenueRatings rating={venueRating} theme={theme} />

              {log.notes && (
                <>
                  <Text style={{ fontSize: fontSizes.lg, fontWeight: "700", color: theme.text, marginBottom: 12, fontFamily: headingFamily }}>
                    Review
                  </Text>
                  <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 24 }}>
                    <Text style={{ fontSize: fontSizes.base, lineHeight: 22, color: theme.text }}>{log.notes}</Text>
                  </View>
                </>
              )}

              <View style={{ borderTopWidth: 1, borderTopColor: theme.divider, paddingTop: 24 }}>
                {commentsSection}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Mobile: hero poster, stacked content ────────────────────────────────────
  return (
    <>
      {deleteDialog}
      {likesModal}
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any} contentContainerStyle={{ paddingBottom: 80 }} contentInsetAdjustmentBehavior="automatic">
        {/* Hero poster — 340px */}
        <View style={{ width: "100%", height: 340, position: "relative" }}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[`hsl(${hue}, 42%, 20%)`, `hsl(${(hue + 30) % 360}, 38%, 8%)`]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: "100%", height: "100%" }}
            />
          )}
          {isMovieLoading && !posterUrl && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: "60%", alignItems: "center", justifyContent: "center" }}>
              <Spinner size="sm" color="rgba(255,255,255,0.7)" />
            </View>
          )}
          <LinearGradient
            colors={[`${theme.bg}00`, theme.bg]}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60%" }}
          />
          <Pressable
            onPress={() => router.back()}
            style={{
              position: "absolute", top: 48, left: 16,
              backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8,
              flexDirection: "row", alignItems: "center", gap: 4,
            }}
          >
            <ArrowLeft size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: fontSizes.sm, fontWeight: "600" }}>Back</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <AuthorRow log={log} theme={theme} router={router} />
          <TagsRow log={log} theme={theme} vcol={vcol} />
          <View style={{ height: 12 }} />
          <TitleAndRating log={log} theme={theme} headingFamily={headingFamily} isMobile router={router} />

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            <LikeButton log={log} theme={theme} onPress={handleLike} onShowLikes={() => setShowLogLikes(true)} style={{ flex: 1 }} />
            {isOwnLog && <ManageButtons log={log} theme={theme} onEdit={() => navigateOnce(`/log/new?edit=${log.id}` as never)} onArchive={handleArchive} onDelete={handleDelete} />}
          </View>

          <MetaList rows={metaRows} theme={theme} />
          <VenueRatings rating={venueRating} theme={theme} />

          {log.notes && (
            <>
              <Text style={{ fontSize: fontSizes.lg, fontWeight: "700", color: theme.text, marginBottom: 12, fontFamily: headingFamily }}>
                Review
              </Text>
              <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <Text style={{ fontSize: fontSizes.base, lineHeight: 22, color: theme.text }}>{log.notes}</Text>
              </View>
            </>
          )}

          <View style={{ height: 1, backgroundColor: theme.divider, marginBottom: 20 }} />

          {commentsSection}
        </View>
      </ScrollView>
    </>
  );
}
