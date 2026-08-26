/**
 * ScopedLogGrid — the "Your logs / Following / Public" tab pattern shared
 * by MovieDetailScreen, VenueDetailScreen, and ScreenDetailScreen. Each of
 * the three log lists is fetched by its own caller (different hooks per
 * screen — useMovieLogs/useFeed/useMovieReviews for a movie, the theatre-
 * or screen-scoped equivalents for the other two) and handed in here
 * ready-made, so this component only owns the tab UI + grid rendering,
 * never the fetching itself.
 */
import React, { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { PosterCard } from "./PosterCard";
import { SectionLoader } from "./Spinner";
import type { MovieLog } from "../../types";
import { type as fontSizes } from "../../constants/fonts";

export type LogScope = "mine" | "following" | "public";

interface ScopeTab {
  id: LogScope;
  label: string;
  logs: MovieLog[] | undefined;
  loading: boolean;
  /** Shown when this scope has no logs and isn't loading — differs per
   * screen (a movie's "no public reviews yet" reads differently from a
   * theatre's), so the caller supplies it rather than one generic string. */
  emptyText: string;
  /** Following/Public require sign-in to even ask for (useFeed 401s
   * logged out; reviews technically don't, but showing a follow feed to
   * a logged-out visitor makes no sense either) — shown instead of the
   * empty grid when true. */
  signedOutText?: string;
}

export function ScopedLogGrid({ tabs, onLogPress, isSignedIn }: {
  tabs: ScopeTab[];
  onLogPress: (log: MovieLog) => void;
  isSignedIn: boolean;
}) {
  const { theme } = useTheme();
  const [active, setActive] = useState<LogScope>(tabs[0]?.id ?? "mine");
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  const TabRow = Platform.OS === "web" ? (
    <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${theme.divider}`, marginBottom: 20 } as React.CSSProperties}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setActive(t.id)}
          style={{
            padding: "10px 16px", fontSize: fontSizes.base, fontWeight: 600,
            color: active === t.id ? theme.accent : `${theme.text}66`,
            background: "none", border: "none", cursor: "pointer",
            borderBottom: active === t.id ? `2px solid ${theme.accent}` : "2px solid transparent",
            marginBottom: -1,
          } as React.CSSProperties}
        >
          {t.label}{t.logs?.length ? ` (${t.logs.length})` : ""}
        </button>
      ))}
    </div>
  ) : (
    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.divider, marginBottom: 16 }}>
      {tabs.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => setActive(t.id)}
          style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: active === t.id ? theme.accent : "transparent", marginBottom: -1 }}
        >
          <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: active === t.id ? theme.accent : `${theme.text}66` }}>
            {t.label}{t.logs?.length ? ` (${t.logs.length})` : ""}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (!current) return null;

  const showSignedOut = current.signedOutText && !isSignedIn;
  const isEmpty = !current.loading && !showSignedOut && (current.logs?.length ?? 0) === 0;

  const body = current.loading ? (
    <SectionLoader />
  ) : showSignedOut ? (
    Platform.OS === "web"
      ? <div style={{ textAlign: "center", padding: 40, color: `${theme.text}55`, fontSize: fontSizes.base } as React.CSSProperties}>{current.signedOutText}</div>
      : <Text style={{ textAlign: "center", padding: 40, color: `${theme.text}55`, fontSize: fontSizes.base }}>{current.signedOutText}</Text>
  ) : isEmpty ? (
    Platform.OS === "web"
      ? <div style={{ textAlign: "center", padding: 40, color: `${theme.text}44`, fontSize: fontSizes.base } as React.CSSProperties}>{current.emptyText}</div>
      : <Text style={{ textAlign: "center", padding: 40, color: `${theme.text}44`, fontSize: fontSizes.base }}>{current.emptyText}</Text>
  ) : Platform.OS === "web" ? (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 14 } as React.CSSProperties}>
      {/* showOwner only off "mine" — these logs mix multiple authors
          (Following/Public), unlike a caller's own-logs grid where every
          card would trivially say the viewer's own name. */}
      {current.logs!.map((log) => (
        <PosterCard key={log.id} log={log} onPress={() => onLogPress(log)} showOwner={current.id !== "mine"} />
      ))}
    </div>
  ) : (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {current.logs!.map((log) => (
        <View key={log.id} style={{ width: "30%" }}>
          <PosterCard log={log} width={100} onPress={() => onLogPress(log)} showOwner={current.id !== "mine"} />
        </View>
      ))}
    </View>
  );

  return (
    <>
      {TabRow}
      {body}
    </>
  );
}
