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
 *
 * One JSX tree, breakpoint-driven for header/filters/sort-toggle/list-mode/
 * empty/error states (see Part C of the architecture-unification plan) —
 * those were raw <div>/CSS-class markup on web and RN View/Pressable on
 * native for the exact same controls, now one Pressable-based tree
 * throughout (the technique every other unified screen this pass settled
 * on, since it renders correctly on web via react-native-web). Filter
 * chips reuse the shared Tag component (accent/neutral variants already
 * match .tag-accent/.tag-neutral exactly) instead of hand-rolling either
 * a styled <button> or a styled Pressable+View a second time.
 *
 * Grid-mode's card rendering keeps its Platform.OS split, deliberately —
 * a real capability difference, not accidental drift: web's hover-reveal
 * title overlay (`.ov`, opacity 0→1 on `:hover`) has no touch equivalent,
 * so native's card shows the same overlay always-visible via
 * LinearGradient, which is already the "works on touch" treatment the
 * plan calls for — CSS's own `@media (hover: none), (max-width: 767px)`
 * rule (designCss.ts) already does the equivalent switch on the web side
 * at narrow/touch widths. What WAS a real bug, fixed here: the grid's
 * column count came from CSS media queries on web (5 / 3 / 2, at the
 * 1120px/768px breakpoints — see `.libgrid`) but was a flat, unconditional
 * 2 on native, at any width — a landscape tablet on native got the same
 * cramped 2-up grid as a narrow phone. `cols` is now computed from
 * useBreakpoint on both platforms, so native/mobile-web tablet widths get
 * the same 3-column tier web already gave a browser at that width.
 */
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useMovieLogs } from "../hooks/useMovieLogs";
import { useMovie } from "../hooks/useSearch";
import { CinematicBg } from "../components/layout/CinematicBg";
import { Icon } from "../components/ui/Icon";
import { Tag } from "../components/ui/Tag";
import { Poster, type Poster as PosterType } from "../components/ui/Poster";
import { SectionLoader } from "../components/ui/Spinner";
import { tmdbPosterUrl } from "../lib/tmdb";
import { fontFamily } from "../constants/fonts";
import type { MovieLog } from "../types";
import { type as fontSizes } from "../constants/fonts";

/**
 * Every card's poster used to hard-code the hue-gradient placeholder, even
 * for a log whose movie_id links to a catalog entry with real artwork —
 * nothing here ever looked the artwork up. Each card needs its own
 * useMovie() call (React Query dedupes by movie_id, so five logs for the
 * same film cost one fetch), which means each poster needs to be its own
 * component — a hook can't run inside the .map() callbacks below directly.
 * Forwards every prop Poster itself takes; only adds the lookup.
 */
function LogPoster({ log, ...rest }: { log: MovieLog } & Omit<React.ComponentProps<typeof PosterType>, "title" | "imageUrl" | "loading">) {
  const { data: movie, isLoading } = useMovie(log.movie_id);
  return (
    <Poster
      title={log.movie ?? "Untitled"}
      imageUrl={tmdbPosterUrl(movie?.poster_path, "w342")}
      loading={isLoading}
      {...rest}
    />
  );
}

// libFilters from the design, verbatim — "All" is tag-accent, rest tag-neutral
const FILTERS = ["All", "IMAX", "This year", "5 stars", "FDFS", "Archived"] as const;
type Filter = (typeof FILTERS)[number];

// The count line under the filter row always said "N films logged" no
// matter which chip was active — true for "All" but misleading for the
// rest ("12 films logged" while looking at only the 5-star ones reads as
// "you've logged 12 films" full stop, not "12 of your logged films are
// 5-star"). One phrase per filter instead.
const FILTER_PHRASE: Record<Filter, string> = {
  "All":        "logged",
  "IMAX":       "in IMAX",
  "This year":  "this year",
  "5 stars":    "rated 5 stars",
  "FDFS":       "FDFS",
  "Archived":   "archived",
};

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

// "Sorted by recent" (the sort-row label) described an order applyFilter
// never actually produced — the list rendered in whatever order the API
// returned. watched_date is when the film was actually seen; it's optional
// (older/incomplete rows), so logs missing it fall back to created_at
// (when the row was logged) rather than sorting to the top/bottom
// arbitrarily.
function sortRecent(logs: MovieLog[]): MovieLog[] {
  const at = (l: MovieLog) => new Date(l.watched_date ?? l.created_at).getTime();
  return [...logs].sort((a, b) => at(b) - at(a));
}

export function LibraryScreen() {
  const { theme, fontConfig } = useTheme();
  const router = useRouter();
  const { isMobile, isTablet } = useBreakpoint();
  const [filter, setFilter] = useState<Filter>("All");
  const [mode, setMode] = useState<"grid" | "list">("grid");
  const [refreshing, setRefreshing] = useState(false);

  const { data: logs = [], isLoading, isError, refetch } = useMovieLogs({
    archived: filter === "Archived",
  });

  const heading = fontFamily(fontConfig, "heading", 600);
  const muted = `${theme.text}8c`;
  const shown = useMemo(() => sortRecent(applyFilter(logs, filter)), [logs, filter]);
  const open = (id: string) => router.push(`/(app)/log/${id}` as any);
  // Was a flat, unconditional 2 on native at any width and CSS-media-query-
  // driven (5/3/2) on web — see this file's own header comment. One
  // formula, both platforms, matching the CSS breakpoints exactly
  // (useBreakpoint's own BP.mobile/BP.tablet are the same 768/1120 values
  // designCss.ts's .libgrid media queries use).
  const cols = isMobile ? 2 : isTablet ? 3 : 5;
  const colWidthPct = `${100 / cols - (cols === 2 ? 2.5 : 1.3)}%`;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const header = (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: isMobile ? 4 : 18, flexWrap: isMobile ? undefined : "wrap", gap: isMobile ? undefined : 12 }}>
      <View>
        <Text style={{ fontSize: fontSizes.xs, letterSpacing: isMobile ? 1.1 : 2.2, textTransform: "uppercase", color: theme.accent }}>
          Your library
        </Text>
        <Text style={{
          fontSize: isMobile ? fontSizes.h2 : fontSizes.h1,
          marginTop: isMobile ? 2 : 4,
          fontFamily: heading,
          color: theme.text,
          letterSpacing: isMobile ? -0.4 : undefined,
          opacity: isLoading ? 0.5 : 1,
        }}>
          {isLoading ? "— films" : `${shown.length} ${shown.length === 1 ? "film" : "films"} ${FILTER_PHRASE[filter]}`}
        </Text>
      </View>

      {isMobile ? (
        <Pressable
          onPress={() => router.push("/(app)/stats" as any)}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.divider, borderRadius: 8 }}
        >
          <Icon name="chart-bar" size={18} color={theme.text} />
        </Pressable>
      ) : (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Pressable
            onPress={() => router.push("/(app)/stats" as any)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: theme.divider, borderRadius: 8 }}
          >
            <Icon name="chart-bar" size={16} color={theme.text} />
            <Text style={{ fontSize: fontSizes.sm, color: theme.text }}>Analytics</Text>
          </Pressable>
          <ViewToggle mode={mode} setMode={setMode} theme={theme} />
        </View>
      )}
    </View>
  );

  const filterChips = FILTERS.map((f) => (
    <Pressable key={f} onPress={() => setFilter(f)}>
      <Tag variant={f === filter ? "accent" : "neutral"} label={f} />
    </Pressable>
  ));
  // Desktop has room to wrap the chips onto a second line; mobile scrolls
  // them horizontally instead (a wrapping row inside a horizontal
  // ScrollView doesn't actually wrap — the scroll container gives it
  // unbounded width — so these need genuinely different containers, not
  // just a style tweak on one shared one).
  const filterRow = isMobile ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }} contentContainerStyle={{ gap: 8 }}>
      {filterChips}
    </ScrollView>
  ) : (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
      {filterChips}
    </View>
  );

  const sortRow = isMobile ? (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 12 }}>
      <Text style={{ fontSize: fontSizes.sm, color: muted }}>Sorted by recent</Text>
      <ViewToggle mode={mode} setMode={setMode} theme={theme} />
    </View>
  ) : null;

  const body =
    isLoading ? <SectionLoader /> :
    isError ? <ErrorState theme={theme} muted={muted} onRetry={refetch} /> :
    shown.length === 0 ? <EmptyState theme={theme} muted={muted} onLog={() => router.push("/(app)/log/new" as any)} /> :
    mode === "grid" ? (
      // Grid-mode card rendering keeps its Platform.OS split — see this
      // file's header comment on why (hover-reveal overlay has no touch
      // equivalent; native's always-visible LinearGradient IS the touch
      // treatment). cols/colWidthPct above are shared by both branches.
      // !isMobile too, not just Platform.OS — a narrow mobile-web browser
      // needs the touch-tuned card (always-visible overlay, no CSS-grid/
      // hover assumptions), the same reason every other screen in this
      // app branches on isMobile and not bare Platform.OS. See this
      // file's own header comment.
      Platform.OS === "web" && !isMobile ? (
        <div className="libgrid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: cols === 5 ? 18 : 14 } as React.CSSProperties}>
          {shown.map((log) => (
            <WebGridCard key={log.id} log={log} theme={theme} heading={heading} onPress={() => open(log.id)} />
          ))}
        </div>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: cols === 2 ? 14 : 10 }}>
          {shown.map((log) => (
            <NativeGridCard key={log.id} log={log} theme={theme} heading={heading} width={colWidthPct} onPress={() => open(log.id)} />
          ))}
        </View>
      )
    ) : (
      <View style={{ gap: 10 }}>
        {shown.map((log) => (
          <Pressable
            key={log.id}
            onPress={() => open(log.id)}
            style={{ flexDirection: "row", gap: 12, padding: 10, borderRadius: 8, backgroundColor: theme.surface }}
          >
            <LogPoster log={log} style={{ width: 56, aspectRatio: 2 / 3 }} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: heading, fontSize: fontSizes.lg, color: theme.text }}>
                  {log.movie}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Icon name="star" weight="fill" size={12} color={theme.accent} />
                  <Text style={{ fontSize: fontSizes.sm, color: theme.accent }}>{(log.rating ?? 0).toFixed(1)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Icon name="map-pin" size={12} color={muted} />
                <Text style={{ fontSize: fontSizes.sm, color: muted }}>{log.theater ?? "—"}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Icon name="calendar-blank" size={12} color={muted} />
                <Text style={{ fontSize: fontSizes.sm, color: muted }}>{fmtLogDate(log)}</Text>
              </View>
              {log.format ? (
                <View style={{ flexDirection: "row", gap: 5, marginTop: 3 }}>
                  <Tag variant="outline" size="sm" label={log.format} />
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    );

  return (
    // Was a single ScrollView with CinematicBg rendered as its first
    // child — i.e. INSIDE the scrolling content. A ScrollView's
    // overflow-y:auto forces overflow-x into a real clip too (a scroll
    // container can't leave one axis "visible" while the other scrolls
    // — CSS Overflow spec), so the glow's blur(60px) bleed got hard-cut
    // at the ScrollView's own left/right edges: correct-looking on the
    // left only by accident (the Sidebar happens to paint over that
    // same seam), visibly abrupt on the right where nothing did. This
    // predates the Part-C screen-unification pass's ScrollView-based
    // layout — the original web build scrolled via a plain overflow-y
    // div with no matching overflow-x, so the same blur bleed was never
    // clipped there at all. Restoring that: CinematicBg now renders
    // as a sibling BEHIND the ScrollView (a plain absolutely-positioned
    // backdrop in this outer, non-scrolling View), not a descendant of
    // it — nothing here clips it on any edge, on any screen width.
    // It no longer scrolls away with the header text above it; instead
    // the grid content scrolls up and over it as the user scrolls,
    // which reads fine since the glow is meant to feel like ambient
    // light behind the top of the page, not attached to any one row.
    <View style={{ flex: 1, backgroundColor: theme.bg, position: "relative" }}>
      {!isMobile && (
        <CinematicBg style={{ position: "absolute", zIndex: 0, height: 280, top: -60, left: -60, right: -60 } as any} />
      )}
      <ScrollView
        style={{ flex: 1, scrollbarGutter: "stable" } as any}
        contentContainerStyle={{
          paddingTop: isMobile ? 14 : 28,
          paddingHorizontal: isMobile ? 18 : 32,
          paddingBottom: isMobile ? 24 : 40,
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        // Pull-to-refresh — react-native-web renders RefreshControl as a
        // no-op wrapper (there's no native touch/overscroll to hook), so
        // this is free on real native and harmless on web.
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
      >
        <View style={{ maxWidth: isMobile ? undefined : 1160, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
          {header}
          {filterRow}
          {sortRow}
          {body}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── View toggle (grid/list) — shared by the desktop header row and the
// mobile sort row, which is why it takes its own small component instead
// of being inlined into either. ─────────────────────────────────────────

function ViewToggle({ mode, setMode, theme }: { mode: "grid" | "list"; setMode: (m: "grid" | "list") => void; theme: any }) {
  return (
    <View style={{ flexDirection: "row", borderWidth: 1, borderColor: theme.divider, borderRadius: 8, overflow: "hidden" }}>
      {(["grid", "list"] as const).map((m, i) => (
        <Pressable
          key={m}
          onPress={() => setMode(m)}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === m }}
          accessibilityLabel={m === "grid" ? "Grid view" : "List view"}
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
            accessibilityLabel={m === "grid" ? "Grid view" : "List view"}
          />
        </Pressable>
      ))}
    </View>
  );
}

// ─── Grid card — web (hover-reveal overlay) ────────────────────────────────

function WebGridCard({ log, theme, heading, onPress }: { log: MovieLog; theme: any; heading?: string; onPress: () => void }) {
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPress(); }
  }
  return (
    <div className="tapc gridcard lift" role="button" tabIndex={0} onClick={onPress} onKeyDown={onKey}>
      <LogPoster log={log} style={{ aspectRatio: "2/3" }}>
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)",
          borderRadius: 6, padding: "2px 7px", fontSize: fontSizes.xs, color: "#fff",
          display: "flex", alignItems: "center", gap: 3,
        } as React.CSSProperties}>
          <Icon name="star" weight="fill" size={11} color={theme.accent} />
          {(log.rating ?? 0).toFixed(1)}
        </div>
        <div className="ov" style={{ padding: 12 } as React.CSSProperties}>
          <div style={{ fontFamily: heading, fontSize: fontSizes.md, color: "#fff" } as React.CSSProperties}>{log.movie}</div>
          <div style={{ fontSize: fontSizes.xs, color: "rgba(255,255,255,.7)" } as React.CSSProperties}>
            {log.theater ?? "—"} · {fmtLogDate(log)}
          </div>
        </div>
      </LogPoster>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 } as React.CSSProperties}>
        {/* .ov (above) is always visible below tablet width / without hover
            — see designCss.ts's `(hover: none), (max-width: 767px)` rule —
            and already carries the title, so repeating it here would show
            it twice. Both spans always render; the CSS shows exactly one
            depending on viewport/pointer, matching the native card's own
            below-poster row (format tag only, no repeated title/date). */}
        <span className="lib-card-title" style={{ fontSize: fontSizes.sm, fontFamily: heading } as React.CSSProperties}>{log.movie}</span>
        <span className="lib-card-date text-muted" style={{ fontSize: fontSizes.xs } as React.CSSProperties}>{fmtLogDate(log)}</span>
        {log.format ? (
          <span className="tag tag-neutral" style={{ fontSize: fontSizes.xs, padding: "1px 6px" } as React.CSSProperties}>{log.format}</span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Grid card — native (always-visible overlay, the touch treatment) ─────

function NativeGridCard({ log, theme, heading, width, onPress }: { log: MovieLog; theme: any; heading?: string; width: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: width as any }}>
      <LogPoster log={log} style={{ width: "100%", aspectRatio: 2 / 3 }}>
        <View style={{
          position: "absolute", top: 8, right: 8,
          backgroundColor: "rgba(0,0,0,.45)", borderRadius: 6,
          paddingHorizontal: 7, paddingVertical: 2,
          flexDirection: "row", alignItems: "center", gap: 3,
        }}>
          <Icon name="star" weight="fill" size={11} color={theme.accent} />
          <Text style={{ fontSize: fontSizes.xs, color: "#fff" }}>{(log.rating ?? 0).toFixed(1)}</Text>
        </View>
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end", padding: 10 }}
        >
          <Text numberOfLines={2} style={{ fontFamily: heading, fontSize: fontSizes.lg, lineHeight: 17.6, color: "#fff" }}>{log.movie}</Text>
          <Text style={{ fontSize: fontSizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
            {log.theater ?? "—"} · {fmtLogDate(log)}
          </Text>
        </LinearGradient>
      </LogPoster>
      {log.format ? (
        <View style={{ flexDirection: "row", marginTop: 7 }}>
          <Tag variant="neutral" size="sm" label={log.format} />
        </View>
      ) : null}
    </Pressable>
  );
}

function EmptyState({ theme, muted, onLog }: { theme: any; muted: string; onLog: () => void }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 60 }}>
      <Icon name="film-slate" size={44} color={theme.accent} />
      <Text style={{ fontSize: fontSizes.lg, color: theme.text, marginTop: 12 }}>No films yet</Text>
      <Text style={{ fontSize: fontSizes.sm, color: muted, marginTop: 4 }}>
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
        <Text style={{ color: theme.accent, fontSize: fontSizes.base }}>Log a screening</Text>
      </Pressable>
    </View>
  );
}

// Previously: an API failure fell through to `logs = []` (useMovieLogs's
// default) and rendered EmptyState — "No films yet" is a confident wrong
// answer when the real story is "couldn't reach the server."
function ErrorState({ theme, muted, onRetry }: { theme: any; muted: string; onRetry: () => void }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 60 }}>
      <Icon name="warning-circle" size={44} color={theme.error} />
      <Text style={{ fontSize: fontSizes.lg, color: theme.text, marginTop: 12 }}>Couldn't load your library</Text>
      <Text style={{ fontSize: fontSizes.sm, color: muted, marginTop: 4 }}>Check your connection and try again.</Text>
      <Pressable
        onPress={onRetry}
        style={{
          flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18,
          paddingVertical: 8, paddingHorizontal: 14,
          borderWidth: 1, borderColor: theme.divider, borderRadius: 8,
        }}
      >
        <Icon name="arrow-clockwise" size={16} color={theme.text} />
        <Text style={{ color: theme.text, fontSize: fontSizes.base }}>Retry</Text>
      </Pressable>
    </View>
  );
}
