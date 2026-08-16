import React from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import type { MovieLog } from "../../types";

interface PosterCardProps {
  log: MovieLog;
  onPress?: () => void;
  width?: number;
}

function starColor(rating?: number) {
  if (!rating) return "#888";
  if (rating >= 4.5) return "#FFD700";
  if (rating >= 3) return "#FFA500";
  return "#888";
}

export function PosterCard({ log, onPress, width = 120 }: PosterCardProps) {
  const { theme } = useTheme();
  const height = Math.round(width * 1.5); // 2:3 ratio

  // Hue-based gradient from movie title
  const hue = Array.from(log.movie_title).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width, height, opacity: pressed ? 0.85 : 1 },
        Platform.OS === "web" && ({ transition: "transform 0.15s, opacity 0.15s" } as any),
      ]}
    >
      {log.movie_poster_url ? (
        <Image
          source={{ uri: log.movie_poster_url }}
          style={[styles.poster, { width, height }]}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width, height, backgroundColor: theme.surface },
          ]}
        >
          <View style={[styles.gradientFill, { backgroundColor: `hsl(${hue},40%,20%)` }]} />
          <Text style={[styles.titleText, { color: theme.text }]} numberOfLines={3}>
            {log.movie_title}
          </Text>
        </View>
      )}

      {/* Star badge */}
      {log.rating != null && (
        <View style={[styles.badge, { backgroundColor: `${theme.bg}cc` }]}>
          <Text style={[styles.badgeText, { color: starColor(log.rating) }]}>
            ★ {log.rating.toFixed(1)}
          </Text>
        </View>
      )}

      {/* Format chip */}
      {log.format && (
        <View style={[styles.formatChip, { backgroundColor: `${theme.accent}cc` }]}>
          <Text style={styles.formatText}>{log.format}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 8, overflow: "hidden", position: "relative" },
  poster: { borderRadius: 8 },
  placeholder: { borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "flex-end", padding: 8 },
  gradientFill: { ...StyleSheet.absoluteFillObject },
  titleText: { fontSize: 11, fontWeight: "600", textAlign: "center", zIndex: 1 },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "700" },
  formatChip: {
    position: "absolute",
    bottom: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  formatText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
