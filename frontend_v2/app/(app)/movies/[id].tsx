import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "../../../src/components/Button";
import { EmptyState } from "../../../src/components/EmptyState";
import { Field } from "../../../src/components/Field";
import { ImageViewer } from "../../../src/components/ImageViewer";
import { useToast } from "../../../src/hooks/useToast";
import { supabase } from "../../../src/lib/supabase";
import {
  useDeleteMovieLogMutation,
  useGetMovieLogQuery,
  useUpdateMovieLogMutation,
} from "../../../src/store/apiSlice";
import { useTheme } from "../../../src/theme/ThemeContext";

import { radii, spacing, typography } from "../../../src/theme/tokens";

export default function MovieDetailScreen() {
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toastError, toastSuccess } = useToast();

  const {
    data: log,
    isLoading,
    isError,
  } = useGetMovieLogQuery(id ?? "", { skip: !id });
  const [updateLog, { isLoading: updating }] = useUpdateMovieLogMutation();
  const [deleteLog, { isLoading: deleting }] = useDeleteMovieLogMutation();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Fetch a 1-hour signed URL whenever the stored path becomes available.
  useEffect(() => {
    if (!log?.ticket_image_path) return;
    supabase.storage
      .from("ticket-images")
      .createSignedUrl(log.ticket_image_path, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) setImageUrl(data.signedUrl);
      });
  }, [log?.ticket_image_path]);

  function startEdit() {
    if (!log) return;
    setDraft({
      movie: log.movie ?? "",
      watched_date: log.watched_date ?? "",
      watched_time: log.watched_time ?? "",
      timezone_abbrv: log.timezone_abbrv ?? "",
      theater: log.theater ?? "",
      seats: log.seats?.join(", ") ?? "",
      language: log.language ?? "",
      screen: log.screen ?? "",
      booking_ref: log.booking_ref ?? "",
      certificate: log.certificate ?? "",
      notes: log.notes ?? "",
      rating: log.rating != null ? String(log.rating) : "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!id) return;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (k === "seats")
        patch.seats = v
          ? v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      else if (k === "rating") patch.rating = v ? parseInt(v, 10) : null;
      else patch[k] = v || null;
    }
    try {
      await updateLog({ id, patch }).unwrap();
      toastSuccess("Changes saved.");
      setEditing(false);
    } catch (e) {
      toastError(e);
    }
  }

  async function confirmDelete() {
    if (!id) return;
    if (Platform.OS === "web") {
      if (!window.confirm("Delete this movie log?")) return;
    } else {
      await new Promise<void>((resolve, reject) =>
        Alert.alert("Delete movie log", "This cannot be undone.", [
          { text: "Cancel", style: "cancel", onPress: () => reject() },
          { text: "Delete", style: "destructive", onPress: () => resolve() },
        ]),
      ).catch(() => null);
    }
    try {
      await deleteLog(id).unwrap();
      toastSuccess("Movie log deleted.");
      router.replace("/(app)/movies");
    } catch (e) {
      toastError(e);
    }
  }

  if (isLoading) {
    return <ActivityIndicator color={colors.accent} style={styles.centered} />;
  }

  if (isError || !log) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Log not found"
        message="It may have been deleted."
      />
    );
  }

  const timeStr = [
    log.watched_date,
    log.watched_time &&
      `${log.watched_time}${log.timezone_abbrv ? " " + log.timezone_abbrv : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={3}>
          {log.movie ?? "Untitled"}
        </Text>
        <View style={styles.titleActions}>
          <Button
            label={editing ? "Cancel" : "Edit"}
            variant="secondary"
            onPress={() => (editing ? setEditing(false) : startEdit())}
          />
          {editing && (
            <Button label="Save" onPress={saveEdit} loading={updating} />
          )}
        </View>
      </View>

      {/* Ticket image */}
      {imageUrl && <ImageViewer uri={imageUrl} height={220} />}

      {editing ? (
        /* Edit form */
        <View style={styles.fields}>
          {Object.entries(draft).map(([key, value]) => (
            <Field
              key={key}
              label={key.replace(/_/g, " ")}
              value={value}
              onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
              multiline={key === "notes"}
              keyboardType={key === "rating" ? "numeric" : "default"}
            />
          ))}
        </View>
      ) : (
        /* Read-only view */
        <View style={styles.card}>
          {timeStr ? (
            <Row icon="calendar-outline" label="When" value={timeStr} />
          ) : null}
          {log.theater ? (
            <Row icon="location-outline" label="Theater" value={log.theater} />
          ) : null}
          {log.screen ? (
            <Row icon="tv-outline" label="Screen" value={log.screen} />
          ) : null}
          {log.language ? (
            <Row
              icon="language-outline"
              label="Language"
              value={log.language}
            />
          ) : null}
          {log.seats?.length ? (
            <Row
              icon="people-outline"
              label="Seats"
              value={log.seats.join(", ")}
            />
          ) : null}
          {log.certificate ? (
            <Row
              icon="shield-outline"
              label="Certificate"
              value={log.certificate}
            />
          ) : null}
          {log.booking_ref ? (
            <Row
              icon="receipt-outline"
              label="Booking ref"
              value={log.booking_ref}
            />
          ) : null}
          {log.rating != null ? (
            <Row
              icon="star-outline"
              label="Rating"
              value={`${log.rating}/10`}
            />
          ) : null}
          {log.notes ? (
            <Row
              icon="document-text-outline"
              label="Notes"
              value={log.notes}
              multiline
            />
          ) : null}
        </View>
      )}

      <Button
        label="Delete movie log"
        variant="danger"
        fullWidth
        loading={deleting}
        onPress={confirmDelete}
      />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  value,
  multiline,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Ionicons
        name={icon}
        size={15}
        color="#e9bcb6"
        style={styles.rowIcon}
      />
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, multiline && styles.rowValueMultiline]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0b1326" },
  content: {
    padding: spacing.lg,
    rowGap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centered: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    columnGap: spacing.md,
    alignItems: "flex-start",
  },
  title: { ...typography.headlineMd, flex: 1 },
  titleActions: { flexDirection: "row", columnGap: spacing.sm, flexShrink: 0 },
  card: {
    backgroundColor: "#171f33",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "#5e3f3b",
    padding: spacing.md,
    rowGap: spacing.sm,
    ...Platform.select({
      web: { boxShadow: "0 2px 12px rgba(0,0,0,0.3)" } as object,
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: spacing.sm,
  },
  rowIcon: { marginTop: 2 },
  rowContent: { flex: 1 },
  rowLabel: { ...typography.label, marginBottom: 2 },
  rowValue: { ...typography.bodyLg },
  rowValueMultiline: { lineHeight: 22 },
  fields: { rowGap: spacing.md },
});
