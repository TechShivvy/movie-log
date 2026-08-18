/**
 * StatsScreen — pixel-accurate match to design spec.
 *
 * Web layout (padding:28px 32px 40px; max-width:1000px):
 *   Title: "Your year in film" (h1 32px)
 *   4-col stat tiles (number in accent 30px + label text-muted 13px)
 *   Two-col charts: bar chart (1.6fr) + rating distribution (1fr)
 *   Three-col: top genres + punctuality big% + format breakdown
 *
 * Mobile: stacked layout
 */
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useMovieLogs } from "../hooks/useMovieLogs";
import type { MovieLog } from "../types";

// ─── Computed stats ────────────────────────────────────────────────────────────

function computeStats(logs: MovieLog[]) {
  const year = new Date().getFullYear();
  const thisYear = logs.filter((l) => new Date(l.created_at).getFullYear() === year);
  const rated = logs.filter((l) => l.rating != null);
  const avgRating = rated.length
    ? (rated.reduce((a, l) => a + (l.rating ?? 0), 0) / rated.length).toFixed(1)
    : "—";
  const fdfsCount = logs.filter((l) => l.is_fdfs).length;

  // Format breakdown
  const formatCounts: Record<string, number> = {};
  logs.forEach((l) => { if (l.format) formatCounts[l.format] = (formatCounts[l.format] ?? 0) + 1; });

  // Monthly counts (this year)
  const monthly: number[] = Array(12).fill(0);
  thisYear.forEach((l) => { monthly[new Date(l.created_at).getMonth()]++; });

  // Rating distribution
  const ratingDist: number[] = Array(5).fill(0);
  rated.forEach((l) => { if (l.rating && l.rating >= 1 && l.rating <= 5) ratingDist[Math.round(l.rating) - 1]++; });

  return { thisYear: thisYear.length, total: logs.length, avgRating, fdfsCount, formatCounts, monthly, ratingDist };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Main ─────────────────────────────────────────────────────────────────────

export function StatsScreen() {
  const { theme } = useTheme();
  const { data: logs, isLoading } = useMovieLogs({ archived: false });

  const stats = useMemo(() => computeStats(logs ?? []), [logs]);
  const maxMonthly = Math.max(...stats.monthly, 1);
  const maxRating = Math.max(...stats.ratingDist, 1);
  const topFormats = Object.entries(stats.formatCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  // ── Web layout ─────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      /* width:"100%" alongside maxWidth — see LibraryScreen.tsx's root div;
         same shrink-wrap-instead-of-filling bug as every other screen
         below this maxWidth+margin:auto shape. */
      <div style={{ padding: "28px 32px 40px", maxWidth: 1000, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        <h1 style={{
          fontSize: 32, fontWeight: 700, color: theme.text, margin: "0 0 28px",
          letterSpacing: -0.5,
        } as React.CSSProperties}>
          Your year in film
        </h1>

        {/* 4-col stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 } as React.CSSProperties}>
          {[
            { label: "Films this year", value: stats.thisYear },
            { label: "All time",        value: stats.total },
            { label: "Avg rating",      value: stats.avgRating },
            { label: "FDFS screenings", value: stats.fdfsCount },
          ].map((s) => (
            <div key={s.label} className="card" style={{ textAlign: "center" } as React.CSSProperties}>
              <div style={{ fontSize: 30, fontWeight: 700, color: theme.accent, marginBottom: 4 } as React.CSSProperties}>{s.value}</div>
              <div style={{ fontSize: 13, color: `${theme.text}66` } as React.CSSProperties}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Charts row: bar (1.6fr) + rating dist (1fr) */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 20 } as React.CSSProperties}>
          {/* Monthly bar chart */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: "0 0 16px" } as React.CSSProperties}>Films per month</h3>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 } as React.CSSProperties}>
              {stats.monthly.map((count, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } as React.CSSProperties}>
                  <div
                    style={{
                      width: "100%",
                      height: count === 0 ? 2 : `${Math.max(4, (count / maxMonthly) * 100)}%`,
                      background: count === 0 ? theme.divider : theme.accent,
                      borderRadius: 3,
                      transition: "height 0.3s",
                    } as React.CSSProperties}
                  />
                  <span style={{ fontSize: 9, color: `${theme.text}55`, textAlign: "center" } as React.CSSProperties}>{MONTHS[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rating distribution */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: "0 0 16px" } as React.CSSProperties}>Rating distribution</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 } as React.CSSProperties}>
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} style={{ display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties}>
                  <span style={{ fontSize: 12, color: `${theme.text}66`, width: 16 } as React.CSSProperties}>{star}★</span>
                  <div style={{ flex: 1, height: 8, background: theme.neutral800, borderRadius: 4, overflow: "hidden" } as React.CSSProperties}>
                    <div style={{
                      width: `${(stats.ratingDist[star - 1] / maxRating) * 100}%`,
                      height: "100%",
                      background: theme.accent,
                      borderRadius: 4,
                    } as React.CSSProperties} />
                  </div>
                  <span style={{ fontSize: 11, color: `${theme.text}44`, width: 24 } as React.CSSProperties}>{stats.ratingDist[star - 1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Format breakdown */}
        {topFormats.length > 0 && (
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: "0 0 16px" } as React.CSSProperties}>Format breakdown</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 } as React.CSSProperties}>
              {topFormats.map(([fmt, cnt]) => (
                <div key={fmt} style={{ display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties}>
                  <span className="tag tag-neutral" style={{ width: 72, textAlign: "center" } as React.CSSProperties}>{fmt}</span>
                  <div style={{ flex: 1, height: 8, background: theme.neutral800, borderRadius: 4, overflow: "hidden" } as React.CSSProperties}>
                    <div style={{
                      width: `${(cnt / (logs?.length ?? 1)) * 100}%`,
                      height: "100%",
                      background: theme.accent,
                      borderRadius: 4,
                    } as React.CSSProperties} />
                  </div>
                  <span style={{ fontSize: 12, color: `${theme.text}55`, width: 24, textAlign: "right" } as React.CSSProperties}>{cnt}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
      <Text style={{ fontSize: 24, fontWeight: "800", color: theme.text, marginBottom: 20 }}>Your year in film</Text>

      {/* 2-col stat tiles on mobile */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Films this year", value: stats.thisYear },
          { label: "All time",        value: stats.total },
          { label: "Avg rating",      value: stats.avgRating },
          { label: "FDFS",            value: stats.fdfsCount },
        ].map((s) => (
          <View key={s.label} style={{
            width: "47%",
            backgroundColor: theme.surface,
            borderRadius: 12,
            padding: 14,
            alignItems: "center",
          }}>
            <Text style={{ fontSize: 26, fontWeight: "700", color: theme.accent }}>{s.value}</Text>
            <Text style={{ fontSize: 12, color: `${theme.text}66`, marginTop: 2 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Monthly bar chart */}
      <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text, marginBottom: 14 }}>Films per month</Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 80 }}>
          {stats.monthly.map((count, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 3 }}>
              <View style={{
                width: "100%",
                height: count === 0 ? 2 : Math.max(4, (count / maxMonthly) * 70),
                backgroundColor: count === 0 ? theme.divider : theme.accent,
                borderRadius: 3,
              }} />
              <Text style={{ fontSize: 7, color: `${theme.text}55`, textAlign: "center" }}>{MONTHS[i].slice(0, 1)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Rating distribution */}
      <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text, marginBottom: 14 }}>Rating distribution</Text>
        {[5, 4, 3, 2, 1].map((star) => (
          <View key={star} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: `${theme.text}66`, width: 20 }}>{star}★</Text>
            <View style={{ flex: 1, height: 8, backgroundColor: theme.neutral800, borderRadius: 4, overflow: "hidden" }}>
              <View style={{
                width: `${(stats.ratingDist[star - 1] / maxRating) * 100}%`,
                height: 8,
                backgroundColor: theme.accent,
                borderRadius: 4,
              }} />
            </View>
            <Text style={{ fontSize: 11, color: `${theme.text}44`, width: 20, textAlign: "right" }}>{stats.ratingDist[star - 1]}</Text>
          </View>
        ))}
      </View>

      {/* Format breakdown */}
      {topFormats.length > 0 && (
        <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text, marginBottom: 14 }}>Format breakdown</Text>
          {topFormats.map(([fmt, cnt]) => (
            <View key={fmt} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <View style={{
                backgroundColor: theme.neutral800, borderRadius: 6,
                paddingHorizontal: 8, paddingVertical: 3, width: 64, alignItems: "center",
              }}>
                <Text style={{ fontSize: 11, color: theme.neutral100, fontWeight: "600" }}>{fmt}</Text>
              </View>
              <View style={{ flex: 1, height: 8, backgroundColor: theme.neutral800, borderRadius: 4, overflow: "hidden" }}>
                <View style={{
                  width: `${(cnt / (logs?.length ?? 1)) * 100}%`,
                  height: 8, backgroundColor: theme.accent, borderRadius: 4,
                }} />
              </View>
              <Text style={{ fontSize: 12, color: `${theme.text}55`, width: 20, textAlign: "right" }}>{cnt}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
