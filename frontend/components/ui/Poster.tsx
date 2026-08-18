/**
 * Poster — the gradient artwork block used everywhere a film appears.
 *
 * Mirrors support.js:
 *   poster(hue, dark) {
 *     const l1 = dark ? 20 : 26, l2 = dark ? 8 : 12;
 *     return `background:linear-gradient(155deg,
 *       hsl(${hue} 42% ${l1}%), hsl(${(hue+30)%360} 38% ${l2}%))`;
 *   }
 * and the .poster class: position:relative; border-radius:var(--radius-md);
 * overflow:hidden.
 *
 * The hue is derived from the title so a given film always renders the same
 * artwork, matching the design's per-item posterStyle.
 */
import React from "react";
import { Image, Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// Typed loosely on purpose: MovieLog.movie is optional (a title that failed
// to resolve, a row written before extraction finished, etc.) so real API/DB
// rows can come back null/undefined — the ?? "" guard is what actually stops
// Array.from from crashing, so the signature should admit the values it's
// built to handle.
export function hueFromTitle(title: string | null | undefined): number {
  return Array.from(title ?? "").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

export function posterColors(hue: number, dark = true): [string, string] {
  const l1 = dark ? 20 : 26;
  const l2 = dark ? 8 : 12;
  return [`hsl(${hue} 42% ${l1}%)`, `hsl(${(hue + 30) % 360} 38% ${l2}%)`];
}

interface PosterProps {
  title: string;
  /**
   * A real poster image (built via lib/tmdb.ts's tmdbPosterUrl from a
   * linked Movie's poster_path). Every caller of this component always
   * rendered the hue-gradient placeholder, even for a log whose movie_id
   * pointed at a catalog entry with real artwork — this prop was simply
   * never plumbed through until now. Falls back to the gradient when
   * absent (no movie_id link, catalog entry has no poster, still loading).
   */
  imageUrl?: string;
  /** Overlays (star badge, hover overlay, title plate). */
  children?: React.ReactNode;
  /** Extra styles — width, aspectRatio, flex, etc. */
  style?: ViewStyle | React.CSSProperties | any;
  className?: string;
  dark?: boolean;
  onClick?: () => void;
}

export function Poster({ title, imageUrl, children, style, className, dark = true, onClick }: PosterProps) {
  const hue = hueFromTitle(title);
  const [c1, c2] = posterColors(hue, dark);

  if (Platform.OS === "web") {
    return (
      <div
        className={["poster", className].filter(Boolean).join(" ")}
        onClick={onClick}
        style={{
          // 155deg in CSS terms. Real artwork wins outright when present —
          // no need to layer it over the gradient, a poster image already
          // fills the frame edge to edge same as the gradient did.
          background: imageUrl
            ? `url("${imageUrl}") center/cover no-repeat`
            : `linear-gradient(155deg, ${c1}, ${c2})`,
          ...(style as React.CSSProperties),
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <View style={[styles.poster, style]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={[c1, c2]}
          // 155deg ≈ down-and-slightly-left
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  poster: { position: "relative", borderRadius: 8, overflow: "hidden" },
});
