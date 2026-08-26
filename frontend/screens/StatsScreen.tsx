/**
 * StatsScreen — one JSX tree, breakpoint-driven (see Part C of the
 * architecture-unification plan). Used to fork on `Platform.OS === "web"`
 * into a CSS-grid `<div>` tree and a separate RN `<View>` tree that
 * differed in real, non-cosmetic ways (a native tablet at desktop width
 * still got the 2-col mobile layout, since the fork never checked width).
 * Now every value that should change with screen size (tile columns,
 * chart height, font-size step) is computed from `isMobile`, and the
 * whole thing renders through one RN element tree on both platforms.
 */
import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { ScreenLoader } from "../components/ui/Spinner";
import type { MovieLog } from "../types";
import { type as fontSizes } from "../constants/fonts";

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
  const { isMobile } = useBreakpoint();
  const { data: logs, isLoading } = useMovieLogs({ archived: false });

  const stats = useMemo(() => computeStats(logs ?? []), [logs]);
  const maxMonthly = Math.max(...stats.monthly, 1);
  const maxRating = Math.max(...stats.ratingDist, 1);
  const topFormats = Object.entries(stats.formatCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

  if (isLoading) return <ScreenLoader />;

  // Breakpoint-driven presentational values — the only thing that used to
  // be decided by Platform.OS. 4-col stat tiles / side-by-side charts on
  // wide screens, 2-col / stacked on narrow ones, on EITHER platform.
  const cardRadius = 12;
  const cardPad = isMobile ? 16 : 20;
  const chartHeight = isMobile ? 80 : 120;
  const barMaxHeight = chartHeight - (isMobile ? 10 : 20);

  const StatCard = ({ label, value }: { label: string; value: string | number }) => (
    // Was a fixed 23.5% width on desktop — an approximation (4 tiles at
    // 23.5% + 3 gaps sums to less than the row's full width), which is
    // why the last tile's right edge sat visibly short of the charts
    // row's own right edge below it. flex:1 (no wrap needed — always
    // exactly 4 tiles in one row on desktop) fills the row exactly,
    // same technique the charts row already uses for its own two cards.
    <View style={{ flex: isMobile ? undefined : 1, width: isMobile ? "47%" : undefined, backgroundColor: theme.surface, borderRadius: cardRadius, padding: cardPad, alignItems: "center" }}>
      <Text style={{ fontSize: isMobile ? fontSizes.display : fontSizes.h2, fontWeight: "700", color: theme.accent }}>{value}</Text>
      <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginTop: isMobile ? 2 : 4, textAlign: "center" }}>{label}</Text>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any}
      contentContainerStyle={{
        paddingTop: isMobile ? 16 : 28,
        paddingHorizontal: isMobile ? 16 : 32,
        paddingBottom: isMobile ? 100 : 40,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={{ maxWidth: isMobile ? undefined : 1000, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
        <Text style={{
          fontSize: isMobile ? fontSizes.display : fontSizes.h1,
          fontWeight: isMobile ? "800" : "700",
          color: theme.text,
          marginBottom: isMobile ? 20 : 28,
          letterSpacing: isMobile ? undefined : -0.5,
        }}>
          Your year in film
        </Text>

        {/* Stat tiles */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: isMobile ? 10 : 12, marginBottom: isMobile ? 20 : 24 }}>
          <StatCard label="Films this year" value={stats.thisYear} />
          <StatCard label="All time" value={stats.total} />
          <StatCard label="Avg rating" value={stats.avgRating} />
          <StatCard label={isMobile ? "FDFS" : "FDFS screenings"} value={stats.fdfsCount} />
        </View>

        {/* Monthly bar chart + rating distribution — side by side on wide
            screens, stacked on narrow ones */}
        <View style={{ flexDirection: isMobile ? "column" : "row", gap: isMobile ? 14 : 16, marginBottom: isMobile ? 14 : 20 }}>
          <View style={{ flex: isMobile ? undefined : 1.6, backgroundColor: theme.surface, borderRadius: cardRadius, padding: cardPad }}>
            <Text style={{ fontSize: fontSizes.base, fontWeight: "700", color: theme.text, marginBottom: isMobile ? 14 : 16 }}>Films per month</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: isMobile ? 4 : 8, height: chartHeight }}>
              {stats.monthly.map((count, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center", gap: isMobile ? 3 : 4 }}>
                  <View style={{
                    width: "100%",
                    height: count === 0 ? 2 : Math.max(4, (count / maxMonthly) * barMaxHeight),
                    backgroundColor: count === 0 ? theme.divider : theme.accent,
                    borderRadius: 3,
                  }} />
                  <Text style={{ fontSize: isMobile ? 7 : 9, color: `${theme.text}55`, textAlign: "center" }}>
                    {isMobile ? MONTHS[i].slice(0, 1) : MONTHS[i]}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ flex: isMobile ? undefined : 1, backgroundColor: theme.surface, borderRadius: cardRadius, padding: cardPad }}>
            <Text style={{ fontSize: fontSizes.base, fontWeight: "700", color: theme.text, marginBottom: isMobile ? 14 : 16 }}>Rating distribution</Text>
            {[5, 4, 3, 2, 1].map((star) => (
              <View key={star} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {/* width was 16/20 — narrower than "N★"'s real rendered
                    width at this font size, so the ★ wrapped onto its
                    own line under the digit instead of sitting beside
                    it. numberOfLines is a defensive guard against the
                    same wrap on any font/platform where metrics differ. */}
                <Text numberOfLines={1} style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, width: 28 }}>{star}★</Text>
                <View style={{ flex: 1, height: 8, backgroundColor: theme.neutral800, borderRadius: 4, overflow: "hidden" }}>
                  <View style={{
                    width: `${(stats.ratingDist[star - 1] / maxRating) * 100}%`,
                    height: 8,
                    backgroundColor: theme.accent,
                    borderRadius: 4,
                  }} />
                </View>
                <Text style={{ fontSize: fontSizes.xs, color: `${theme.text}44`, width: isMobile ? 20 : 24, textAlign: "right" }}>
                  {stats.ratingDist[star - 1]}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Format breakdown */}
        {topFormats.length > 0 && (
          <View style={{ backgroundColor: theme.surface, borderRadius: cardRadius, padding: cardPad }}>
            <Text style={{ fontSize: fontSizes.base, fontWeight: "700", color: theme.text, marginBottom: isMobile ? 14 : 16 }}>Format breakdown</Text>
            {topFormats.map(([fmt, cnt]) => (
              <View key={fmt} style={{ flexDirection: "row", alignItems: "center", gap: isMobile ? 8 : 10, marginBottom: 10 }}>
                <View style={{
                  backgroundColor: theme.neutral800, borderRadius: 6,
                  paddingHorizontal: 8, paddingVertical: 3, width: isMobile ? 64 : 72, alignItems: "center",
                }}>
                  <Text style={{ fontSize: fontSizes.xs, color: theme.neutral100, fontWeight: "600" }}>{fmt}</Text>
                </View>
                <View style={{ flex: 1, height: 8, backgroundColor: theme.neutral800, borderRadius: 4, overflow: "hidden" }}>
                  <View style={{
                    width: `${(cnt / (logs?.length ?? 1)) * 100}%`,
                    height: 8, backgroundColor: theme.accent, borderRadius: 4,
                  }} />
                </View>
                <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, width: isMobile ? 20 : 24, textAlign: "right" }}>{cnt}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
