/**
 * PosterCard — matches design-system .gridcard .lift .poster .ov exactly.
 *
 * Web: HTML divs with CSS classes — hover effects handled by CSS.
 *   .gridcard.lift.tapc → wrapper (cursor:pointer, lift transition)
 *   .poster → aspect-ratio:2/3, gradient bg, overflow:hidden
 *   .ov → hover overlay (opacity 0→1, bottom gradient, title+meta)
 *   star badge → top-right pill, backdrop-filter:blur(4px)
 *
 * Native: Pressable + LinearGradient overlay.
 */
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../hooks/useTheme";
import { useMovie } from "../../hooks/useSearch";
import { tmdbPosterUrl } from "../../lib/tmdb";
import { avatarUrl } from "../../lib/storage";
import { anonName } from "../../lib/anonName";
import { Poster } from "./Poster";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import type { MovieLog } from "../../types";
import { type as fontSizes } from "../../constants/fonts";

interface PosterCardProps {
  log: MovieLog;
  onPress?: () => void;
  /** Native only — web uses CSS grid to control width */
  width?: number;
  /** Shows a small avatar+name row under the card — off by default (a
   * caller's own logs, e.g. ProfileScreen's own grid, gains nothing from
   * labeling every card with the viewer's own name). Set true only where
   * a grid genuinely mixes multiple authors (ScopedLogGrid's Public/
   * Following tabs). log.username/display_name/avatar_path are only
   * ever populated on those multi-author views to begin with (server-
   * null on a caller's own-logs response) — see types/index.ts's own
   * comment on MovieLog. A null username with showOwner on means an
   * anonymous log: shown as a generated pseudonym, not a link (there's
   * nothing real to link to).
   */
  showOwner?: boolean;
}

function OwnerRow({ log, theme }: { log: MovieLog; theme: any }) {
  const router = useRouter();
  const isAnonymous = !log.username;
  const name = isAnonymous ? anonName(log.id) : (log.display_name ?? log.username ?? "");
  const row = (
    <View style={ownerStyles.row}>
      <Avatar name={name} uri={isAnonymous ? undefined : avatarUrl(log.avatar_path)} size="sm" />
      <Text numberOfLines={1} style={[ownerStyles.name, { color: isAnonymous ? `${theme.text}66` : theme.text }]}>
        {name}
      </Text>
    </View>
  );
  if (isAnonymous) return row;
  return (
    <Pressable onPress={(e: any) => { e?.stopPropagation?.(); router.push(`/(app)/profile/${log.username}` as any); }}>
      {row}
    </Pressable>
  );
}

const ownerStyles = StyleSheet.create({
  row:  { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  name: { fontSize: fontSizes.xs, fontWeight: "600", flexShrink: 1 },
});

// Every card here used to hard-code the hue-gradient placeholder, even for
// a log whose movie_id links to a catalog entry with real artwork —
// nothing here ever looked the artwork up (the component's own old
// comment said as much: "a real fix is a follow-up, not part of this
// drift-correction pass"). LibraryScreen's LogPoster got this fix
// earlier; this shared component — used by ProfileScreen, SearchScreen,
// and FeedScreen — didn't, which is why posters looked broken specifically
// on those screens and nowhere else. Delegates to the shared Poster
// primitive (gradient/real-image/loading-state logic, hue derivation) now
// instead of re-implementing its own copy of all of that.
export function PosterCard({ log, onPress, width = 120, showOwner = false }: PosterCardProps) {
  const { theme } = useTheme();
  const { data: movie, isLoading } = useMovie(log.movie_id);
  const posterUrl = tmdbPosterUrl(movie?.poster_path, "w342");
  const h = Math.round((width ?? 120) * 1.5);

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div
        className="gridcard lift tapc"
        onClick={onPress}
        style={{ display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties}
      >
        <Poster title={log.movie ?? "Untitled"} imageUrl={posterUrl} loading={isLoading} style={{ aspectRatio: "2/3" } as React.CSSProperties}>
          {/* Star rating badge */}
          {log.rating != null && (
            <div style={{
              position: "absolute", top: 8, right: 8,
              background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)",
              borderRadius: 20, padding: "3px 8px",
              fontSize: fontSizes.xs, color: "#fff", fontWeight: 600,
              zIndex: 1, display: "flex", alignItems: "center", gap: 3,
            } as React.CSSProperties}>
              <Icon name="star" weight="fill" size={11} color="#fff" />
              {log.rating.toFixed(1)}
            </div>
          )}

          {/* Hover overlay */}
          <div className="ov">
            <div style={{ fontWeight: 600, fontSize: fontSizes.sm, color: "#fff", lineHeight: 1.3 } as React.CSSProperties}>
              {log.movie}
            </div>
            {(log.theater || log.created_at) && (
              <div style={{ fontSize: fontSizes.xs, color: "rgba(255,255,255,.7)", marginTop: 3 } as React.CSSProperties}>
                {[log.theater, new Date(log.created_at).getFullYear()]
                  .filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </Poster>

        {/* Below poster: title + format. minHeight reserves exactly 2
            lines' worth of title regardless of whether this particular
            card's title actually wraps that far, or has a format tag at
            all — without it, a 1-line card (short title, or no tag to
            fit around) sat shorter than a 2-line neighbor, so anything
            below it (the owner row) started at a different y per card
            in the same grid row: misaligned avatars/names across an
            otherwise-uniform row of cards. The title itself also had no
            line clamp at all (native's own numberOfLines={2} had no web
            equivalent) — a long title could run past 2 lines and break
            this same alignment even worse; -webkit-line-clamp matches
            native's own cap exactly. */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, minHeight: 34 } as React.CSSProperties}>
          <span
            className="tapc"
            style={{
              fontSize: fontSizes.sm, color: theme.text, fontWeight: 500, lineHeight: 1.3, flex: 1,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            } as React.CSSProperties}
          >
            {log.movie}
          </span>
          {log.format && (
            <span className="tag tag-neutral" style={{ flexShrink: 0 } as React.CSSProperties}>
              {log.format}
            </span>
          )}
        </div>
        {showOwner && <OwnerRow log={log} theme={theme} />}
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    // Was also given an explicit height:h — exactly the poster's own
    // height, with no room reserved for the footer (title + format tag)
    // that renders *below* it inside this same box. Yoga doesn't grow or
    // clip a box to fit a child once an explicit height is set, so the
    // footer visually spilled past this card's bottom edge into whatever
    // sat below it in the next grid row — most visible when two adjacent
    // cards in the same column happened to show the same movie twice.
    // Letting the card size itself (Poster's own fixed height + the
    // footer's natural height + styles.card's own gap) fixes that;
    // overflow:hidden is a defensive backstop against a title genuinely
    // long enough to still run past its own 2-line clamp.
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width, opacity: pressed ? 0.85 : 1 }]}
    >
      <Poster title={log.movie ?? "Untitled"} imageUrl={posterUrl} loading={isLoading} style={{ width, height: h }}>
        {/* Star badge */}
        {log.rating != null && (
          <View style={[styles.starBadge, { backgroundColor: `${theme.bg}cc` }]}>
            <Icon name="star" weight="fill" size={10} color="#fff" />
            <Text style={styles.starText}>{log.rating.toFixed(1)}</Text>
          </View>
        )}

        {/* Bottom overlay */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={[StyleSheet.absoluteFill, styles.overlay]}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        >
          <Text style={styles.overlayTitle} numberOfLines={2}>{log.movie}</Text>
          {(log.theater || log.created_at) && (
            <Text style={styles.overlayMeta}>
              {[log.theater, new Date(log.created_at).getFullYear()].filter(Boolean).join(" · ")}
            </Text>
          )}
        </LinearGradient>
      </Poster>

      {/* Title + format below poster — footer has a minHeight reserving
          the full 2-line title height regardless of whether THIS card's
          title actually wraps that far, so the owner row below it (when
          shown) starts at the same y on every card in the same grid
          row, not shifted by a shorter neighbor's shorter title. */}
      <View style={styles.footer}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{log.movie}</Text>
        {log.format && (
          <View style={[styles.format, { backgroundColor: theme.neutral800 }]}>
            <Text style={[styles.formatText, { color: theme.neutral100 }]}>{log.format}</Text>
          </View>
        )}
      </View>
      {showOwner && <OwnerRow log={log} theme={theme} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card:        { flexDirection: "column", gap: 6, overflow: "hidden" },
  starBadge:   { position: "absolute", top: 8, right: 8, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 3 },
  starText:    { fontSize: fontSizes.xs, color: "#fff", fontWeight: "600" },
  overlay:     { position: "absolute", inset: 0, justifyContent: "flex-end", padding: 12 },
  overlayTitle:{ fontSize: fontSizes.sm, fontWeight: "600", color: "#fff", lineHeight: 17 },
  overlayMeta: { fontSize: fontSizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 3 },
  footer:      { flexDirection: "row", alignItems: "flex-start", gap: 4, minHeight: 34 },
  title:       { flex: 1, fontSize: fontSizes.sm, fontWeight: "500", lineHeight: 17 },
  format:      { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, flexShrink: 0 },
  formatText:  { fontSize: fontSizes.xs },
});
