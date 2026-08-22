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
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../hooks/useTheme";
import { useMovie } from "../../hooks/useSearch";
import { tmdbPosterUrl } from "../../lib/tmdb";
import { Poster } from "./Poster";
import type { MovieLog } from "../../types";
import { type as fontSizes } from "../../constants/fonts";

interface PosterCardProps {
  log: MovieLog;
  onPress?: () => void;
  /** Native only — web uses CSS grid to control width */
  width?: number;
}

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
export function PosterCard({ log, onPress, width = 120 }: PosterCardProps) {
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
              zIndex: 1,
            } as React.CSSProperties}>
              ★ {log.rating.toFixed(1)}
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

        {/* Below poster: title + format */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 } as React.CSSProperties}>
          <span style={{ fontSize: fontSizes.sm, color: theme.text, fontWeight: 500, lineHeight: 1.3, flex: 1 } as React.CSSProperties} className="tapc">
            {log.movie}
          </span>
          {log.format && (
            <span className="tag tag-neutral" style={{ flexShrink: 0 } as React.CSSProperties}>
              {log.format}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width, height: h, opacity: pressed ? 0.85 : 1 }]}
    >
      <Poster title={log.movie ?? "Untitled"} imageUrl={posterUrl} loading={isLoading} style={{ width, height: h }}>
        {/* Star badge */}
        {log.rating != null && (
          <View style={[styles.starBadge, { backgroundColor: `${theme.bg}cc` }]}>
            <Text style={styles.starText}>★ {log.rating.toFixed(1)}</Text>
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

      {/* Title + format below poster */}
      <View style={styles.footer}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{log.movie}</Text>
        {log.format && (
          <View style={[styles.format, { backgroundColor: theme.neutral800 }]}>
            <Text style={[styles.formatText, { color: theme.neutral100 }]}>{log.format}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card:        { flexDirection: "column", gap: 6 },
  starBadge:   { position: "absolute", top: 8, right: 8, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8 },
  starText:    { fontSize: fontSizes.xs, color: "#fff", fontWeight: "600" },
  overlay:     { position: "absolute", inset: 0, justifyContent: "flex-end", padding: 12 },
  overlayTitle:{ fontSize: fontSizes.sm, fontWeight: "600", color: "#fff", lineHeight: 17 },
  overlayMeta: { fontSize: fontSizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 3 },
  footer:      { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  title:       { flex: 1, fontSize: fontSizes.sm, fontWeight: "500", lineHeight: 17 },
  format:      { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, flexShrink: 0 },
  formatText:  { fontSize: fontSizes.xs },
});
