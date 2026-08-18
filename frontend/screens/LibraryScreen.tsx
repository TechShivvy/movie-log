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

// These chips/toggles were <span>/<label onClick> — unreachable by keyboard,
// invisible to a screen reader as controls. `<button>` fixes both for free
// (native focus, Enter/Space activation, the app's own global
// :focus-visible ring from designCss.ts), but a bare <button> also carries
// browser chrome (background, border, font, margin) neither .tag nor
// .seg-opt account for since they were written for non-button elements.
// Only reset what those classes don't already set themselves — anything set
// here as an inline style wins over the class's rule, so setting e.g.
// `background` would blank out .tag-accent/.tag-neutral's own color.
const TAG_BTN_RESET: React.CSSProperties = { border: "none", font: "inherit", margin: 0, cursor: "pointer" };
const SEG_BTN_RESET: React.CSSProperties = { ...TAG_BTN_RESET, background: "transparent" };

/** Enter/Space activation for the div-wrapped poster/list cards below —
 *  they carry `role="button"` + `tabIndex` rather than becoming real
 *  <button> elements, since each wraps a <Poster> plus nested tag/icon
 *  markup that would fight a real button's default padding/text-align. */
function onCardKey(activate: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };
}

function fmtShort(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Every date shown on a card used to be log.created_at — when the row was
// logged, not when the film was actually seen. Harmless if you log same-day,
// visibly wrong otherwise: backfilling three old ticket stubs in one sitting
// showed all three as "today," even sorted correctly by watched_date above
// them. watched_date is optional (older/incomplete rows), so this falls back
// to created_at rather than rendering a blank date.
function fmtLogDate(log: MovieLog) {
  return fmtShort(log.watched_date ?? log.created_at);
}

function applyFilter(logs: MovieLog[], f: Filter): MovieLog[] {
  switch (f) {
    case "IMAX":      return logs.filter((l) => /imax/i.test(l.format ?? ""));
    case "This year": return logs.filter((l) => new Date(l.watched_date ?? l.created_at).getFullYear() === new Date().getFullYear());
    case "5 stars":   return logs.filter((l) => (l.rating ?? 0) >= 5);
    case "FDFS":      return logs.filter((l) => !!l.is_fdfs);
    case "Archived":  return logs.filter((l) => !!l.is_archived);
    default:          return logs;
  }
}

// "Sorted by recent" (the sort-row label, both platforms) described an order
// applyFilter never actually produced — the list rendered in whatever order
// the API returned. watched_date is when the film was actually seen; it's
// optional (older/incomplete rows), so logs missing it fall back to
// created_at (when the row was logged) rather than sorting to the top/bottom
// arbitrarily.
function sortRecent(logs: MovieLog[]): MovieLog[] {
  const at = (l: MovieLog) => new Date(l.watched_date ?? l.created_at).getTime();
  return [...logs].sort((a, b) => at(b) - at(a));
}

export function LibraryScreen() {
  const { theme, fontConfig } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("All");
  const [mode, setMode] = useState<"grid" | "list">("grid");

  const { data: logs = [], isLoading, isError, refetch } = useMovieLogs({
    archived: filter === "Archived",
  });

  const heading = fontFamily(fontConfig, "heading", 600);
  const muted = `${theme.text}8c`;
  const shown = useMemo(() => sortRecent(applyFilter(logs, filter)), [logs, filter]);
  const open = (id: string) => router.push(`/(app)/log/${id}` as any);

  // ── Web ─────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div
        className="screen-anim"
        style={{
          padding: "28px 32px 40px",
          maxWidth: 1160,
          width: "100%",
          // .mainscroll > div { margin-inline:auto } in the design only reaches
          // a direct child; expo-router nests screens deeper, so centre here.
          margin: "0 auto",
          position: "relative",
        } as React.CSSProperties}
      >
        {/* Header gradient band — the ONLY place .cine-bg appears on web.
            Styles go straight on the element (no wrapper): its blur(60px) is
            what feathers the edges, so clipping it would draw a hard box. */}
        <CinematicBg
          style={{ zIndex: -1, height: 280, top: -60, left: -60, right: -60, bottom: "auto" }}
        />

        {/* .lib-header wraps to a stacked layout under 768px (designCss.ts) —
            at that width this row used to cram "Analytics" and the grid/list
            toggle onto the same line as a 34px heading, all fighting for a
            392px-wide column. */}
        <div className="lib-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 } as React.CSSProperties}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: theme.accent } as React.CSSProperties}>
              Your library
            </div>
            <h1 className="lib-title" style={{ fontSize: 34, margin: "4px 0 0" } as React.CSSProperties}>
              {shown.length} {shown.length === 1 ? "film" : "films"} logged
            </h1>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" } as React.CSSProperties}>
            <button className="btn btn-secondary" onClick={() => router.push("/(app)/stats" as any)}>
              <Icon name="chart-bar" size={16} />
              Analytics
            </button>
            <div className="seg">
              <button
                type="button"
                aria-pressed={mode === "grid"}
                aria-label="Grid view"
                className={mode === "grid" ? "seg-opt active" : "seg-opt"}
                style={SEG_BTN_RESET}
                onClick={() => setMode("grid")}
              >
                <Icon name="squares-four" size={16} />
              </button>
              <button
                type="button"
                aria-pressed={mode === "list"}
                aria-label="List view"
                className={mode === "list" ? "seg-opt active" : "seg-opt"}
                style={SEG_BTN_RESET}
                onClick={() => setMode("list")}
              >
                <Icon name="rows" size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" } as React.CSSProperties}>
          {FILTERS.map((f) => (
            <button
              type="button"
              key={f}
              aria-pressed={f === filter}
              className={`tag ${f === filter ? "tag-accent" : "tag-neutral"}`}
              style={TAG_BTN_RESET}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {isLoading ? (
          <ActivityIndicator color={theme.accent} />
        ) : isError ? (
          <ErrorState theme={theme} muted={muted} onRetry={refetch} />
        ) : shown.length === 0 ? (
          <EmptyState theme={theme} muted={muted} onLog={() => router.push("/(app)/log/new" as any)} />
        ) : mode === "grid" ? (
          <div className="libgrid">
            {shown.map((log) => (
              <div
                key={log.id}
                className="tapc gridcard lift"
                role="button"
                tabIndex={0}
                onClick={() => open(log.id)}
                onKeyDown={onCardKey(() => open(log.id))}
              >
                <Poster title={log.movie ?? "Untitled"} style={{ aspectRatio: "2/3" }}>
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
                      {log.movie}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)" } as React.CSSProperties}>
                      {log.theater ?? "—"} · {fmtLogDate(log)}
                    </div>
                  </div>
                </Poster>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 } as React.CSSProperties}>
                  {/* .ov (above) is always visible below tablet width now —
                      see designCss.ts's `(hover: none), (max-width: 767px)`
                      rule — and already carries the title, so repeating it
                      here would show it twice. Swap to the date instead,
                      matching the native/mobile design's own below-poster
                      row (dateShort + format), which never repeated the
                      title either. Both spans always render; the CSS below
                      shows exactly one depending on viewport/pointer. */}
                  <span className="lib-card-title" style={{ fontSize: 13, fontFamily: heading } as React.CSSProperties}>{log.movie}</span>
                  <span className="lib-card-date text-muted" style={{ fontSize: 11 } as React.CSSProperties}>{fmtLogDate(log)}</span>
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
                role="button"
                tabIndex={0}
                style={{ flexDirection: "row", gap: 12, alignItems: "stretch", padding: 10 } as React.CSSProperties}
                onClick={() => open(log.id)}
                onKeyDown={onCardKey(() => open(log.id))}
              >
                <Poster title={log.movie ?? "Untitled"} style={{ width: 56, flex: "none", aspectRatio: "2/3" }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 } as React.CSSProperties}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 } as React.CSSProperties}>
                    <div style={{ fontFamily: heading, fontSize: 16 } as React.CSSProperties}>{log.movie}</div>
                    <span style={{ fontSize: 12, color: theme.accent, whiteSpace: "nowrap" } as React.CSSProperties}>
                      <Icon name="star" weight="fill" size={11} /> {(log.rating ?? 0).toFixed(1)}
                    </span>
                  </div>
                  <div className="text-muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 } as React.CSSProperties}>
                    <Icon name="map-pin" size={12} />
                    {log.theater ?? "—"}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 } as React.CSSProperties}>
                    <Icon name="calendar-blank" size={12} />
                    {fmtLogDate(log)}
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
  // No PWA install banner here: this branch only renders when Platform.OS
  // !== "web" — i.e. the actual compiled/Expo Go app, which is by definition
  // already "installed". The design's mobile mockup shows this banner because
  // it depicts the mobile-WEB experience (a phone-width browser tab prompting
  // "add to home screen"); that belongs behind a `Platform.OS === "web"` +
  // beforeinstallprompt check, the same guard TopBar's "Install app" button
  // already uses, never in the native branch.
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >

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
      ) : isError ? (
        <ErrorState theme={theme} muted={muted} onRetry={refetch} />
      ) : shown.length === 0 ? (
        <EmptyState theme={theme} muted={muted} onLog={() => router.push("/(app)/log/new" as any)} />
      ) : mode === "grid" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {shown.map((log) => (
            <Pressable key={log.id} onPress={() => open(log.id)} style={{ width: "47.5%" }}>
              <Poster title={log.movie ?? "Untitled"} style={{ width: "100%", aspectRatio: 2 / 3 }}>
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
                    {log.movie}
                  </Text>
                </View>
              </Poster>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
                <Text style={{ fontSize: 11, color: muted }}>{fmtLogDate(log)}</Text>
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
              <Poster title={log.movie ?? "Untitled"} style={{ width: 56, aspectRatio: 2 / 3 }} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: heading, fontSize: 16, color: theme.text }}>
                    {log.movie}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.accent }}>★ {(log.rating ?? 0).toFixed(1)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Icon name="map-pin" size={12} color={muted} />
                  <Text style={{ fontSize: 12, color: muted }}>{log.theater ?? "—"}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Icon name="calendar-blank" size={12} color={muted} />
                  <Text style={{ fontSize: 12, color: muted }}>{fmtLogDate(log)}</Text>
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

function EmptyState({ theme, muted, onLog }: { theme: any; muted: string; onLog: () => void }) {
  if (Platform.OS === "web") {
    return (
      <div style={{ textAlign: "center", padding: "60px 0" } as React.CSSProperties}>
        <Icon name="film-slate" size={44} color={theme.accent} />
        <div style={{ fontSize: 16, marginTop: 12 } as React.CSSProperties}>No films yet</div>
        <div style={{ fontSize: 13, color: muted, marginTop: 4 } as React.CSSProperties}>
          Log your first screening to start your library.
        </div>
        <button className="btn btn-primary" style={{ marginTop: 18 } as React.CSSProperties} onClick={onLog}>
          <Icon name="plus-circle" size={16} />
          Log a screening
        </button>
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
      <Pressable
        onPress={onLog}
        style={{
          flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18,
          paddingVertical: 8, paddingHorizontal: 14,
          borderWidth: 1, borderColor: theme.accent, borderRadius: 8,
        }}
      >
        <Icon name="plus-circle" size={16} color={theme.accent} />
        <Text style={{ color: theme.accent, fontSize: 14 }}>Log a screening</Text>
      </Pressable>
    </View>
  );
}

// Previously: an API failure fell through to `logs = []` (useMovieLogs's
// default) and rendered EmptyState — "No films yet" is a confident wrong
// answer when the real story is "couldn't reach the server."
function ErrorState({ theme, muted, onRetry }: { theme: any; muted: string; onRetry: () => void }) {
  if (Platform.OS === "web") {
    return (
      <div style={{ textAlign: "center", padding: "60px 0" } as React.CSSProperties}>
        <Icon name="warning-circle" size={44} color={theme.error} />
        <div style={{ fontSize: 16, marginTop: 12 } as React.CSSProperties}>Couldn't load your library</div>
        <div style={{ fontSize: 13, color: muted, marginTop: 4 } as React.CSSProperties}>
          Check your connection and try again.
        </div>
        <button className="btn btn-secondary" style={{ marginTop: 18 } as React.CSSProperties} onClick={onRetry}>
          <Icon name="arrow-clockwise" size={16} />
          Retry
        </button>
      </div>
    );
  }
  return (
    <View style={{ alignItems: "center", paddingVertical: 60 }}>
      <Icon name="warning-circle" size={44} color={theme.error} />
      <Text style={{ fontSize: 16, color: theme.text, marginTop: 12 }}>Couldn't load your library</Text>
      <Text style={{ fontSize: 13, color: muted, marginTop: 4 }}>Check your connection and try again.</Text>
      <Pressable
        onPress={onRetry}
        style={{
          flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18,
          paddingVertical: 8, paddingHorizontal: 14,
          borderWidth: 1, borderColor: theme.divider, borderRadius: 8,
        }}
      >
        <Icon name="arrow-clockwise" size={16} color={theme.text} />
        <Text style={{ color: theme.text, fontSize: 14 }}>Retry</Text>
      </Pressable>
    </View>
  );
}
