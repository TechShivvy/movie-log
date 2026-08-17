/**
 * LibraryScreen — pixel-accurate match to CineLog Web.dc.html Library screen.
 *
 * Web layout (max-width:1160px, padding:28px 32px 40px):
 *   - Cinematic header gradient behind title area (height:280px, inset:-60px)
 *   - Header row: kicker + h1 title count | Analytics btn + grid/list seg
 *   - Filter chips (tag-accent active, tag-neutral inactive)
 *   - 5-col CSS grid (gap:18px), each cell = .gridcard.lift.tapc
 *   - FAB bottom-right: .fab class
 *
 * Mobile layout:
 *   - PWA install banner (glass card, dismissible)
 *   - Same header / filter chips
 *   - 2-col FlatList grid
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SquaresFour, Rows, ChartLine, Plus } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { PosterCard } from "../components/ui/PosterCard";
import type { MovieLog } from "../types";

const FILTERS = ["All", "IMAX", "4DX", "Dolby", "ScreenX", "Laser", "Standard"];

export function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data: logs, isLoading } = useMovieLogs({ archived: false });

  const filtered = !logs ? [] : activeFilter === "All" ? logs : logs.filter((l) => l.format === activeFilter);
  const count = logs?.length ?? 0;

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ padding: "28px 32px 40px", maxWidth: 1160, margin: "0 auto", position: "relative" } as React.CSSProperties}>
        {/* Cinematic header gradient backdrop */}
        <div style={{
          position: "absolute",
          inset: "-60px -60px auto -60px",
          height: 280,
          zIndex: -1,
          pointerEvents: "none",
          background: `radial-gradient(circle at 30% 50%, ${theme.accent800} 0%, transparent 60%)`,
          filter: "blur(30px)",
        } as React.CSSProperties} />

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 } as React.CSSProperties}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.accent, marginBottom: 4 } as React.CSSProperties}>
              Your library
            </div>
            <h1 style={{ fontSize: 34, fontWeight: 700, color: theme.text, margin: 0, letterSpacing: -0.5 } as React.CSSProperties}>
              {count} film{count !== 1 ? "s" : ""} logged
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties}>
            <button className="btn btn-secondary" onClick={() => router.push("/(app)/stats" as any)}>
              <ChartLine size={14} color={theme.text} />
              Analytics
            </button>
            <div className="seg">
              <button
                className={viewMode === "grid" ? "seg-opt active" : "seg-opt"}
                onClick={() => setViewMode("grid")}
                style={{ background: "none", border: "none" } as React.CSSProperties}
              >
                <SquaresFour size={14} />
              </button>
              <button
                className={viewMode === "list" ? "seg-opt active" : "seg-opt"}
                onClick={() => setViewMode("list")}
                style={{ background: "none", border: "none" } as React.CSSProperties}
              >
                <Rows size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 22 } as React.CSSProperties}>
          {FILTERS.map((f) => (
            <button
              key={f}
              className={activeFilter === f ? "tag tag-accent" : "tag tag-neutral"}
              onClick={() => setActiveFilter(f)}
              style={{ cursor: "pointer", border: "none" } as React.CSSProperties}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 60, color: theme.accent } as React.CSSProperties}>
            <span className="spin" style={{ fontSize: 24 } as React.CSSProperties}>◌</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80 } as React.CSSProperties}>
            <div style={{ fontSize: 48, marginBottom: 12 } as React.CSSProperties}>🎬</div>
            <p style={{ color: `${theme.text}55`, fontSize: 15 } as React.CSSProperties}>No films yet</p>
            <p style={{ color: `${theme.text}33`, fontSize: 13 } as React.CSSProperties}>Tap + to log your first screening</p>
          </div>
        ) : viewMode === "grid" ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 18,
          } as React.CSSProperties}>
            {filtered.map((log) => (
              <PosterCard key={log.id} log={log} onPress={() => router.push(`/(app)/log/${log.id}` as any)} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 } as React.CSSProperties}>
            {filtered.map((log) => (
              <WebListRow key={log.id} log={log} onPress={() => router.push(`/(app)/log/${log.id}` as any)} theme={theme} />
            ))}
          </div>
        )}

        {/* FAB */}
        <button
          className="fab"
          onClick={() => router.push("/(app)/log/new" as any)}
          title="Log a screening"
        >
          <Plus size={24} color={theme.bg} weight="bold" />
        </button>
      </div>
    );
  }

  // ── Native (mobile) ────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <FlatList
        data={filtered}
        key={viewMode}
        numColumns={viewMode === "grid" ? 2 : 1}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={viewMode === "grid" ? styles.row : undefined}
        ListHeaderComponent={
          <LibraryHeader
            count={count}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            viewMode={viewMode}
            setViewMode={setViewMode}
            theme={theme}
            router={router}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loader}>
              <ActivityIndicator color={theme.accent} size="large" />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={{ fontSize: 48, textAlign: "center" }}>🎬</Text>
              <Text style={[styles.emptyText, { color: `${theme.text}55` }]}>No films yet</Text>
              <Text style={[styles.emptySubText, { color: `${theme.text}33` }]}>Tap + to log your first screening</Text>
            </View>
          )
        }
        renderItem={({ item }) =>
          viewMode === "grid" ? (
            <View style={styles.gridCell}>
              <PosterCard log={item} width={160} onPress={() => router.push(`/(app)/log/${item.id}` as any)} />
            </View>
          ) : (
            <NativeListRow log={item} onPress={() => router.push(`/(app)/log/${item.id}` as any)} theme={theme} />
          )
        }
      />
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LibraryHeader({ count, activeFilter, setActiveFilter, viewMode, setViewMode, theme, router }: any) {
  return (
    <View style={styles.headerArea}>
      <View style={styles.headerRow}>
        <View>
          <Text style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: theme.accent, marginBottom: 4 }}>
            Your library
          </Text>
          <Text style={{ fontSize: 27, fontWeight: "800", color: theme.text, letterSpacing: -0.5 }}>
            {count} film{count !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            style={[styles.toggleBtn, { borderColor: theme.divider, backgroundColor: theme.surfaceHigh }]}
          >
            {viewMode === "grid" ? <Rows size={16} color={theme.text} /> : <SquaresFour size={16} color={theme.text} />}
          </Pressable>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginBottom: 4 }}>
        <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16 }}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[
                styles.chip,
                {
                  backgroundColor: activeFilter === f ? theme.accent800 : theme.neutral800,
                  borderColor: activeFilter === f ? theme.accent : "transparent",
                },
              ]}
            >
              <Text style={{ fontSize: 11, color: activeFilter === f ? theme.accent100 : theme.neutral100 }}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function WebListRow({ log, onPress, theme }: { log: MovieLog; onPress: () => void; theme: any }) {
  const hue = Array.from(log.movie_title).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="tapc"
      onClick={onPress}
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "10px 0",
        borderBottom: `1px solid ${theme.divider}`, cursor: "pointer",
      } as React.CSSProperties}
    >
      <div style={{
        width: 56, height: 84, borderRadius: 6, flexShrink: 0,
        background: log.movie_poster_url
          ? `url(${log.movie_poster_url}) center/cover`
          : `linear-gradient(155deg, hsl(${hue} 42% 20%), hsl(${(hue + 30) % 360} 38% 8%))`,
      } as React.CSSProperties} />
      <div style={{ flex: 1 } as React.CSSProperties}>
        <div style={{ fontWeight: 600, fontSize: 14, color: theme.text } as React.CSSProperties}>{log.movie_title}</div>
        <div style={{ fontSize: 12, color: `${theme.text}66`, marginTop: 3 } as React.CSSProperties}>
          {[log.format, log.rating != null ? `★ ${log.rating}` : null, new Date(log.created_at).getFullYear()].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}

function NativeListRow({ log, onPress, theme }: { log: MovieLog; onPress: () => void; theme: any }) {
  return (
    <Pressable onPress={onPress} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
      <View style={[styles.listPoster, { backgroundColor: theme.neutral800 }]}>
        <Text style={{ fontSize: 20 }}>🎬</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{log.movie_title}</Text>
        <Text style={{ fontSize: 12, color: `${theme.text}66`, marginTop: 3 }}>
          {[log.format, log.rating != null ? `★ ${log.rating}` : null].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  listContent: { paddingBottom: 100 },
  headerArea:  { paddingBottom: 8 },
  headerRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 20 },
  toggleBtn:   { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chip:        { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1 },
  row:         { gap: 14, paddingHorizontal: 16 },
  gridCell:    { flex: 1 },
  listRow:     { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  listPoster:  { width: 56, height: 84, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  loader:      { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  empty:       { alignItems: "center", paddingTop: 80, gap: 8 },
  emptyText:   { fontSize: 15 },
  emptySubText:{ fontSize: 13 },
});
