import React from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import type { MovieLog } from "../../types";
import { styles } from "./PosterCard.styles";

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

  // Hue-based gradient from movie title characters
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
        <View style={[styles.placeholder, { width, height, backgroundColor: theme.surface }]}>
          <View style={[styles.gradientFill, { backgroundColor: `hsl(${hue},40%,20%)` }]} />
          <Text style={[styles.titleText, { color: theme.text }]} numberOfLines={3}>
            {log.movie_title}
          </Text>
        </View>
      )}

      {/* FDFS badge */}
      {log.is_fdfs && (
        <View style={[styles.fdfsBadge, { backgroundColor: `${theme.accent}dd` }]}>
          <Text style={styles.fdfsText}>FDFS</Text>
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
