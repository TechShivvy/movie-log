/**
 * LibraryScreen — ported from the design files.
 *
 * WEB (CineLog Web.dc.html lines 98-116)
 *   screen    padding:28px 32px 40px; max-width:1160px; position:relative
 *   cine-bg   z-index:-1; height:280px; inset:-60px -60px auto -60px
 *   header    flex; align-items:flex-end; space-between; margin-bottom:18px
 *             kicker 11px/.1em uppercase accent "Your library"
 *             h1 34px margin:4px 0 0
 *             right gap:10 → btn-secondary [chart-bar] Analytics
 *                            + seg [squares-four | rows]
 *   filters   flex gap:8; margin-bottom:22px; wrap
 *   grid      repeat(5,1fr) gap:18px
 *   card      .tapc.gridcard.lift → .poster aspect-ratio:2/3
 *             badge  top/right 8, rgba(0,0,0,.5), blur(4), radius 6,
 *                    padding 2px 7px, 11px, accent star
 *             .ov    padding 12, gradient to top rgba(0,0,0,.85)→transparent 65%
 *                    title 15px heading #fff + 11px rgba(255,255,255,.7)
 *             below  flex space-between margin-top:8
 *                    title 13px heading + tag-neutral 10px padding 1px 6px
 *
 * MOBILE (CineLog Mobile.dc.html lines 108-166)
 *   screen    padding:14px 18px 24px
 *   pwa       .glass gap:10 padding:11 radius md mb:16 border 1px divider
 *   header    kicker + h2 27px margin:2px 0 0 + btn-icon [chart-bar @18px]
 *   filters   horizontal scroll, gap:8, margin:14px 0 4px
 *   sort row  "Sorted by recent" 12px muted + seg, margin:14px 0 12px
 *   grid      1fr 1fr gap:14px; title overlaid on poster (.pt padding:10)
 *             16px heading #fff, text-shadow 0 1px 8px rgba(0,0,0,.6)
 *             below: dateShort 11px muted + tag-neutral 10px padding 2px 7px
 *   list      .card row gap:12 padding:10; poster 56px
 */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { CinematicBg } from "../components/layout/CinematicBg";
import { Icon } from "../components/ui/Icon";
import { Poster } from "../components/ui/Poster";
import { fontFamily } from "../constants/fonts";
import type { MovieLog } from "../types";

// libFilters from the design, verbatim — "All" is tag-accent, rest tag-neutral
const FILTERS = ["All", "IMAX", "This year", "5 stars", "FDFS", "Archived"] as const;
type Filter = (typeof FILTERS)[number];

function fmtShort(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function applyFilter(logs: MovieLog[], f: Filter): MovieLog[] {
  switch (f) {
    case "IMAX":      return logs.filter((l) => /imax/i.test(l.format ?? ""));
    case "This year": return logs.filter((l) => new Date(l.created_at).getFullYear() === new Date().getFullYear());
    case "5 stars":   return logs.filter((l) => (l.rating ?? 0) >= 5);
    case "FDFS":      return logs.filter((l) => !!l.is_fdfs);
    case "Archived":  return logs.filter((l) => !!l.is_archived);
    default:          return logs;
  }
}

export function LibraryScreen() {
  const { theme, fontConfig } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("All");
  const [mode, setMode] = useState<"grid" | "list">("grid");
  const [showPwa, setShowPwa] = useState(true);

  const { data: logs = [], isLoading } = useMovieLogs({
    archived: filter === "Archived",
  });

  const heading = fontFamily(fontConfig, "heading", 600);
  const muted = `${theme.text}8c`;
  const shown = useMemo(() => applyFilter(logs, filter), [logs, filter]);
  const open = (id: string) => router.push(`/(app)/log/${id}` as any);

  // ── Web ─────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div
        className="screen-anim"
        style={{ padding: "28px 32px 40px", maxWidth: 1160, position: "relative" } as React.CSSProperties}
      >
        {/* Header gradient band — the ONLY place .cine-bg appears on web */}
        <div style={{ position: "absolute", top: -60, left: -60, right: -60, height: 280, zIndex: -1, overflow: "hidden" } as React.CSSProperties}>
          <CinematicBg />
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 } as React.CSSProperties}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: theme.accent } as React.CSSProperties}>
              Your library
            </div>
            <h1 style={{ fontSize: 34, margin: "4px 0 0" } as React.CSSProperties}>
              {shown.length} {shown.length === 1 ? "film" : "films"} logged
            </h1>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" } as React.CSSProperties}>
            <button className="btn btn-secondary" onClick={() => router.push("/(app)/stats" as any)}>
              <Icon name="chart-bar" size={16} />
              Analytics
            </button>
            <div className="seg">
              <label
                className={mode === "grid" ? "seg-opt active" : "seg-opt"}
                onClick={() => setMode("grid")}
              >
                <Icon name="squares-four" size={16} />
              </label>
              <label
                className={mode === "list" ? "seg-opt active" : "seg-opt"}
                onClick={() => setMode("list")}
              >
                <Icon name="rows" size={16} />
              </label>
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" } as React.CSSProperties}>
          {FILTERS.map((f) => (
            <span
              key={f}
              className={`tag ${f === filter ? "tag-accent" : "tag-neutral"}`}
              style={{ cursor: "pointer" } as React.CSSProperties}
              onClick={() => setFilter(f)}
            >
              {f}
            </span>
          ))}
        </div>

        {isLoading ? (
          <ActivityIndicator color={theme.accent} />
        ) : shown.length === 0 ? (
          <EmptyState theme={theme} muted={muted} />
        ) : mode === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 18 } as React.CSSProperties}>
            {shown.map((log) => (
              <div key={log.id} className="tapc gridcard lift" onClick={() => open(log.id)}>
                <Poster title={log.movie_title} style={{ aspectRatio: "2/3" }}>
                  <div
                    style={{
                      position: "absolute", top: 8, right: 8,
                      background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)",
                      borderRadius: 6, padding: "2px 7px", fontSize: 11, color: "#fff",
                      display: "flex", alignItems: "center", gap: 3,
                    } as React.CSSProperties}
                  >
                    <Icon name="star" weight="fill" size={11} color={theme.accent} />
                    {(log.rating ?? 0).toFixed(1)}
                  </div>

                  <div className="ov" style={{ padding: 12 } as React.CSSProperties}>
                    <div style={{ fontFamily: heading, fontSize: 15, color: "#fff" } as React.CSSProperties}>
                      {log.movie_title}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)" } as React.CSSProperties}>
                      {log.venue?.name ?? "—"} · {fmtShort(log.created_at)}
                    </div>
                  </div>
                </Poster>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 } as React.CSSProperties}>
                  <span style={{ fontSize: 13, fontFamily: heading } as React.CSSProperties}>{log.movie_title}</span>
                  {log.format ? (
                    <span className="tag tag-neutral" style={{ fontSize: 10, padding: "1px 6px" } as React.CSSProperties}>
                      {log.format}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 } as React.CSSProperties}>
            {shown.map((log) => (
              <div
                key={log.id}
                className="card tapc lift"
                style={{ flexDirection: "row", gap: 12, alignItems: "stretch", padding: 10 } as React.CSSProperties}
                onClick={() => open(log.id)}
              >
                <Poster title={log.movie_title} style={{ width: 56, flex: "none", aspectRatio: "2/3" }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 } as React.CSSProperties}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 } as React.CSSProperties}>
                    <div style={{ fontFamily: heading, fontSize: 16 } as React.CSSProperties}>{log.movie_title}</div>
                    <span style={{ fontSize: 12, color: theme.accent, whiteSpace: "nowrap" } as React.CSSProperties}>
                      <Icon name="star" weight="fill" size={11} /> {(log.rating ?? 0).toFixed(1)}
                    </span>
                  </div>
                  <div className="text-muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 } as React.CSSProperties}>
                    <Icon name="map-pin" size={12} />
                    {log.venue?.name ?? "—"}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 } as React.CSSProperties}>
                    <Icon name="calendar-blank" size={12} />
                    {fmtShort(log.created_at)}
                  </div>
                  {log.format ? (
                    <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" } as React.CSSProperties}>
                      <span className="tag tag-outline" style={{ fontSize: 10, padding: "1px 7px" } as React.CSSProperties}>
                        {log.format}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Native ──────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {showPwa && (
        <View
          style={{
            flexDirection: "row", alignItems: "center", gap: 10, padding: 11,
            borderRadius: 8, marginBottom: 16,
            borderWidth: 1, borderColor: theme.divider,
            backgroundColor: `${theme.surface}b8`, // .glass ≈ surface 72%
          }}
        >
          <Icon name="device-mobile-camera" size={22} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: heading, color: theme.text }}>Install CineLog</Text>
            <Text style={{ fontSize: 11, color: muted }}>Add to home screen — works offline.</Text>
          </View>
          <Pressable
            onPress={() => setShowPwa(false)}
            style={{ borderWidth: 1, borderColor: theme.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 12, color: theme.accent, fontFamily: heading }}>Install</Text>
          </Pressable>
          <Pressable onPress={() => setShowPwa(false)} hitSlop={8}>
            <Icon name="x" size={16} color={muted} />
          </Pressable>
        </View>
      )}

      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 4 }}>
        <View>
          <Text style={{ fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", color: theme.accent }}>
            Your library
          </Text>
          <Text style={{ fontSize: 27, marginTop: 2, fontFamily: heading, color: theme.text, letterSpacing: -0.4 }}>
            {shown.length} {shown.length === 1 ? "film" : "films"} logged
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(app)/stats" as any)}
          style={{
            width: 36, height: 36, alignItems: "center", justifyContent: "center",
            borderWidth: 1, borderColor: theme.divider, borderRadius: 8,
          }}
        >
          <Icon name="chart-bar" size={18} color={theme.text} />
        </Pressable>
      </View>

      {/* Filters — horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 14, marginBottom: 4 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
      >
        {FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6,
                backgroundColor: on ? theme.accent800 : theme.neutral800,
              }}
            >
              <Text style={{ fontSize: 11, color: on ? theme.accent100 : theme.neutral100 }}>{f}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Sort + view toggle */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: muted }}>Sorted by recent</Text>
        <View style={{ flexDirection: "row", borderWidth: 1, borderColor: theme.divider, borderRadius: 8, overflow: "hidden" }}>
          {(["grid", "list"] as const).map((m, i) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={{
                paddingHorizontal: 12, paddingVertical: 7,
                borderLeftWidth: i === 1 ? 1 : 0, borderLeftColor: theme.divider,
                backgroundColor: mode === m ? `${theme.accent}1f` : "transparent",
              }}
            >
              <Icon
                name={m === "grid" ? "squares-four" : "rows"}
                size={16}
                color={mode === m ? theme.accent : theme.text}
              />
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.accent} />
      ) : shown.length === 0 ? (
        <EmptyState theme={theme} muted={muted} />
      ) : mode === "grid" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {shown.map((log) => (
            <Pressable key={log.id} onPress={() => open(log.id)} style={{ width: "47.5%" }}>
              <Poster title={log.movie_title} style={{ width: "100%", aspectRatio: 2 / 3 }}>
                <View
                  style={{
                    position: "absolute", top: 8, right: 8,
                    backgroundColor: "rgba(0,0,0,.45)", borderRadius: 6,
                    paddingHorizontal: 7, paddingVertical: 2,
                    flexDirection: "row", alignItems: "center", gap: 3,
                  }}
                >
                  <Icon name="star" weight="fill" size={11} color={theme.accent} />
                  <Text style={{ fontSize: 11, color: "#fff" }}>{(log.rating ?? 0).toFixed(1)}</Text>
                </View>

                {/* .pt — title plate pinned to the poster's bottom */}
                <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 10 }}>
                  <Text
                    numberOfLines={2}
                    style={{
                      fontFamily: heading, fontSize: 16, lineHeight: 17.6, color: "#fff",
                      textShadowColor: "rgba(0,0,0,.6)",
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 8,
                    }}
                  >
                    {log.movie_title}
                  </Text>
                </View>
              </Poster>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
                <Text style={{ fontSize: 11, color: muted }}>{fmtShort(log.created_at)}</Text>
                {log.format ? (
                  <View style={{ backgroundColor: theme.neutral800, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, color: theme.neutral100 }}>{log.format}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {shown.map((log) => (
            <Pressable
              key={log.id}
              onPress={() => open(log.id)}
              style={{
                flexDirection: "row", gap: 12, padding: 10,
                borderRadius: 8, backgroundColor: theme.surface,
              }}
            >
              <Poster title={log.movie_title} style={{ width: 56, aspectRatio: 2 / 3 }} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: heading, fontSize: 16, color: theme.text }}>
                    {log.movie_title}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.accent }}>★ {(log.rating ?? 0).toFixed(1)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Icon name="map-pin" size={12} color={muted} />
                  <Text style={{ fontSize: 12, color: muted }}>{log.venue?.name ?? "—"}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Icon name="calendar-blank" size={12} color={muted} />
                  <Text style={{ fontSize: 12, color: muted }}>{fmtShort(log.created_at)}</Text>
                </View>
                {log.format ? (
                  <View style={{ flexDirection: "row", gap: 5, marginTop: 3 }}>
                    <View style={{ borderWidth: 1, borderColor: theme.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 10, color: theme.accent }}>{log.format}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function EmptyState({ theme, muted }: { theme: any; muted: string }) {
  if (Platform.OS === "web") {
    return (
      <div style={{ textAlign: "center", padding: "60px 0" } as React.CSSProperties}>
        <Icon name="film-slate" size={44} color={theme.accent} />
        <div style={{ fontSize: 16, marginTop: 12 } as React.CSSProperties}>No films yet</div>
        <div style={{ fontSize: 13, color: muted, marginTop: 4 } as React.CSSProperties}>
          Log your first screening to start your library.
        </div>
      </div>
    );
  }
  return (
    <View style={{ alignItems: "center", paddingVertical: 60 }}>
      <Icon name="film-slate" size={44} color={theme.accent} />
      <Text style={{ fontSize: 16, color: theme.text, marginTop: 12 }}>No films yet</Text>
      <Text style={{ fontSize: 13, color: muted, marginTop: 4 }}>
        Log your first screening to start your library.
      </Text>
    </View>
  );
}
