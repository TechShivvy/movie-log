import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { PosterCard } from "../components/ui/PosterCard";
import type { MovieLog } from "../types";
import { styles } from "./LibraryScreen.styles";

const FORMATS = ["All", "IMAX", "4DX", "Dolby", "ScreenX", "Standard"];

export function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data: logs, isLoading } = useMovieLogs({ archived: false });

  const filtered = !logs
    ? []
    : activeFilter === "All"
    ? logs
    : logs.filter((l) => l.format === activeFilter);

  const numCols = Platform.OS === "web" ? 5 : 2;
  const cardWidth = Platform.OS === "web" ? 140 : 160;

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.filmCount, { color: theme.text }]}>
            {logs?.length ?? 0} films
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

      {/* Format filter chips */}
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

      {/* Loading state */}
      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: `${theme.text}55` }]}>
            No films yet 🎬
          </Text>
          <Text style={[styles.emptySubText, { color: `${theme.text}33` }]}>
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
          showsVerticalScrollIndicator={false}
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
          {log.format} · {log.rating != null ? `★ ${log.rating}` : "No rating"} ·{" "}
          {new Date(log.created_at).getFullYear()}
        </Text>
      </View>
    </Pressable>
  );
}
