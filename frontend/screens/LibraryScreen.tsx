import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { MOCK_LOGS } from "../lib/mockData";
import { PosterCard } from "../components/ui/PosterCard";
import type { MovieLog } from "../types";

const FORMATS = ["All", "IMAX", "4DX", "Dolby", "ScreenX", "Standard"];

export function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filtered = activeFilter === "All"
    ? MOCK_LOGS
    : MOCK_LOGS.filter((l) => l.format === activeFilter);

  const numCols = Platform.OS === "web" ? 5 : 2;
  const cardWidth = Platform.OS === "web" ? 140 : 160;

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.filmCount, { color: theme.text }]}>
            {MOCK_LOGS.length} films
          </Text>
          <Text style={[styles.subtitle, { color: `${theme.text}66` }]}>
            Your cinema diary
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/(app)/stats")}
            style={[styles.analyticsBtn, { backgroundColor: theme.surfaceHigh, borderColor: theme.divider }]}
          >
            <Text style={[styles.analyticsBtnText, { color: theme.text }]}>📊 Analytics</Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            style={[styles.viewToggle, { backgroundColor: theme.surfaceHigh, borderColor: theme.divider }]}
          >
            <Text style={{ color: theme.text }}>{viewMode === "grid" ? "☰" : "⊞"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FORMATS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setActiveFilter(f)}
            style={[
              styles.chip,
              {
                backgroundColor: activeFilter === f ? theme.accent : theme.surfaceHigh,
                borderColor: activeFilter === f ? theme.accent : theme.divider,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: activeFilter === f ? "#fff" : `${theme.text}88` },
              ]}
            >
              {f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Grid */}
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: `${theme.text}55`, fontSize: 16 }}>No films yet 🎬</Text>
          <Text style={{ color: `${theme.text}33`, fontSize: 13, marginTop: 8 }}>
            Tap + to log your first screening
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          key={`${viewMode}-${numCols}`}
          numColumns={viewMode === "grid" ? numCols : 1}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={viewMode === "grid" && numCols > 1 ? styles.row : undefined}
          renderItem={({ item }) =>
            viewMode === "grid" ? (
              <PosterCard
                log={item}
                width={cardWidth}
                onPress={() => router.push(`/(app)/log/${item.id}` as any)}
              />
            ) : (
              <LogListRow
                log={item}
                onPress={() => router.push(`/(app)/log/${item.id}` as any)}
              />
            )
          }
        />
      )}
    </View>
  );
}

function LogListRow({ log, onPress }: { log: MovieLog; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.listRow, { borderBottomColor: theme.divider }]}
    >
      <View style={[styles.listPoster, { backgroundColor: theme.surfaceHigh }]}>
        <Text style={{ fontSize: 20 }}>🎬</Text>
      </View>
      <View style={styles.listMeta}>
        <Text style={[styles.listTitle, { color: theme.text }]}>{log.movie_title}</Text>
        <Text style={[styles.listSub, { color: `${theme.text}66` }]}>
          {log.format} · {log.rating != null ? `★ ${log.rating}` : "No rating"} · {new Date(log.created_at).getFullYear()}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  filmCount: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 8 },
  analyticsBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  analyticsBtnText: { fontSize: 13, fontWeight: "500" },
  viewToggle: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: "500" },
  grid: { paddingHorizontal: 20, paddingBottom: 32 },
  row: { gap: 12, marginBottom: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  listRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  listPoster: { width: 48, height: 72, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  listMeta: { flex: 1 },
  listTitle: { fontSize: 15, fontWeight: "600" },
  listSub: { fontSize: 13, marginTop: 4 },
});
