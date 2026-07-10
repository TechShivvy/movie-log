import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View, ViewStyle } from "react-native";
import { supabase } from "../lib/supabase";
import type { MovieLog } from "../store/apiSlice";
import { colors, radii, spacing, typography } from "../theme";

interface Props {
  item: MovieLog;
  style?: ViewStyle;
}

const CERT_COLORS: Record<string, string> = {
  U: "#22C55E",
  "U/A": "#F59E0B",
  UA: "#F59E0B",
  A: "#EF4444",
};

export function MovieCard({ item, style }: Props) {
  const certColor =
    CERT_COLORS[item.certificate?.toUpperCase() ?? ""] ?? colors.textSecondary;

  const timeStr = [
    item.watched_date,
    item.watched_time &&
      `${item.watched_time}${item.timezone_abbrv ? " " + item.timezone_abbrv : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!item.ticket_image_path) return;
    supabase.storage
      .from("ticket-images")
      .createSignedUrl(item.ticket_image_path, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) setThumbUrl(data.signedUrl);
      });
  }, [item.ticket_image_path]);

  return (
    <View style={[styles.card, style]}>
      {thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          style={styles.thumb}
          contentFit="cover"
        />
      ) : null}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {item.movie ?? "Untitled"}
        </Text>
        {item.certificate ? (
          <View style={[styles.certBadge, { borderColor: certColor }]}>
            <Text style={[styles.certText, { color: certColor }]}>
              {item.certificate}
            </Text>
          </View>
        ) : null}
      </View>

      {timeStr ? (
        <View style={styles.metaRow}>
          <Ionicons
            name="calendar-outline"
            size={12}
            color={colors.textSecondary}
          />
          <Text style={styles.metaText}>{timeStr}</Text>
        </View>
      ) : null}

      {item.theater ? (
        <View style={styles.metaRow}>
          <Ionicons
            name="location-outline"
            size={12}
            color={colors.textSecondary}
          />
          <Text style={styles.metaText} numberOfLines={1}>
            {item.theater}
          </Text>
        </View>
      ) : null}

      {item.seats && item.seats.length > 0 ? (
        <View style={styles.seatsRow}>
          {item.seats.slice(0, 6).map((s) => (
            <View key={s} style={styles.seatChip}>
              <Text style={styles.seatText}>{s}</Text>
            </View>
          ))}
          {item.seats.length > 6 ? (
            <Text style={styles.moreSeats}>+{item.seats.length - 6}</Text>
          ) : null}
        </View>
      ) : null}

      {item.language ? (
        <View style={styles.metaRow}>
          <Ionicons
            name="language-outline"
            size={12}
            color={colors.textSecondary}
          />
          <Text style={styles.metaText}>{item.language}</Text>
        </View>
      ) : null}

      {item.rating ? (
        <View style={styles.metaRow}>
          <Ionicons name="star" size={12} color={colors.accent} />
          <Text style={[styles.metaText, { color: colors.accent }]}>
            {item.rating}/10
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    rowGap: spacing.sm - 2,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 2px 12px rgba(0,0,0,0.3)" } as object,
    }),
  },
  thumb: {
    height: 120,
    borderRadius: radii.md,
    marginBottom: spacing.sm - 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    rowGap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h3,
    flex: 1,
  },
  certBadge: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  certText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.xs,
  },
  metaText: { ...typography.caption, flex: 1 },
  seatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.xs,
    marginTop: spacing.xs - 2,
  },
  seatChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  seatText: { ...typography.mono, fontSize: 11 },
  moreSeats: { ...typography.caption, alignSelf: "center" },
});
