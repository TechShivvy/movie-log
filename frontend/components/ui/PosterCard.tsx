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
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../hooks/useTheme";
import type { MovieLog } from "../../types";

interface PosterCardProps {
  log: MovieLog;
  onPress?: () => void;
  /** Native only — web uses CSS grid to control width */
  width?: number;
}

/** Deterministic hue from movie title */
function titleHue(title: string): number {
  return Array.from(title).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

/** Gradient CSS for web (matches design JS poster() function) */
function posterGradientCss(hue: number, dark = true): string {
  const [l1, l2] = dark ? [20, 8] : [26, 12];
  return `linear-gradient(155deg, hsl(${hue} 42% ${l1}%), hsl(${(hue + 30) % 360} 38% ${l2}%))`;
}

/** HSL → hex for native */
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function PosterCard({ log, onPress, width = 120 }: PosterCardProps) {
  const { theme } = useTheme();
  const hue = titleHue(log.movie_title);
  const h = Math.round((width ?? 120) * 1.5);

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    const grad = posterGradientCss(hue);
    return (
      <div
        className="gridcard lift tapc"
        onClick={onPress}
        style={{ display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties}
      >
        {/* Poster */}
        <div
          className="poster"
          style={{
            aspectRatio: "2/3",
            background: log.movie_poster_url
              ? `url(${log.movie_poster_url}) center/cover no-repeat`
              : grad,
          } as React.CSSProperties}
        >
          {/* Star rating badge */}
          {log.rating != null && (
            <div style={{
              position: "absolute", top: 8, right: 8,
              background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)",
              borderRadius: 20, padding: "3px 8px",
              fontSize: 11, color: "#fff", fontWeight: 600,
              zIndex: 1,
            } as React.CSSProperties}>
              ★ {log.rating.toFixed(1)}
            </div>
          )}

          {/* Hover overlay */}
          <div className="ov">
            <div style={{ fontWeight: 600, fontSize: 13, color: "#fff", lineHeight: 1.3 } as React.CSSProperties}>
              {log.movie_title}
            </div>
            {(log.venue_name || log.watched_at) && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", marginTop: 3 } as React.CSSProperties}>
                {[log.venue_name, log.watched_at ? new Date(log.watched_at).getFullYear() : null]
                  .filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </div>

        {/* Below poster: title + format */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 } as React.CSSProperties}>
          <span style={{ fontSize: 13, color: theme.text, fontWeight: 500, lineHeight: 1.3, flex: 1 } as React.CSSProperties} className="tapc">
            {log.movie_title}
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
  const c1 = hslToHex(hue, 42, 20);
  const c2 = hslToHex((hue + 30) % 360, 38, 8);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width, height: h, opacity: pressed ? 0.85 : 1 }]}
    >
      {/* Poster */}
      <View style={[styles.poster, { width, height: h }]}>
        {log.movie_poster_url ? (
          <Image source={{ uri: log.movie_poster_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}

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
          <Text style={styles.overlayTitle} numberOfLines={2}>{log.movie_title}</Text>
          {(log.venue_name || log.watched_at) && (
            <Text style={styles.overlayMeta}>
              {[log.venue_name, log.watched_at ? new Date(log.watched_at).getFullYear() : null].filter(Boolean).join(" · ")}
            </Text>
          )}
        </LinearGradient>
      </View>

      {/* Title + format below poster */}
      <View style={styles.footer}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{log.movie_title}</Text>
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
  poster:      { borderRadius: 8, overflow: "hidden", position: "relative" },
  starBadge:   { position: "absolute", top: 8, right: 8, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8 },
  starText:    { fontSize: 11, color: "#fff", fontWeight: "600" },
  overlay:     { position: "absolute", inset: 0, justifyContent: "flex-end", padding: 12 },
  overlayTitle:{ fontSize: 13, fontWeight: "600", color: "#fff", lineHeight: 17 },
  overlayMeta: { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 3 },
  footer:      { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  title:       { flex: 1, fontSize: 13, fontWeight: "500", lineHeight: 17 },
  format:      { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, flexShrink: 0 },
  formatText:  { fontSize: 11 },
});
