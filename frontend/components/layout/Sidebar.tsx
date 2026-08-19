/**
 * Sidebar — ported from docs/design/CineLog Web.dc.html (lines 55-79).
 *
 *   .sidebar  flex:none; border-right:1px solid divider; column;
 *             padding:18px 14px; gap:4px; overflow:hidden
 *             width 236px → 68px when .collapsed (CSS transition)
 *   brandrow  gap:9px; padding:4px 8px 18px
 *             32x32 radius 9, 1px accent border, fill film-slate @18px
 *             19px heading, letter-spacing -.01em, flex:1
 *             ph-sidebar-simple toggle @20px (muted)
 *   navitems  FIRST, then the CTA — icons @19px; badge pill is
 *             accent bg / bg-coloured text, 10px, radius 999, padding 1px 6px
 *   CTA       btn-primary btn-block, ph-plus-circle, margin-top:12px
 *   bottom    margin-top:auto; gap:12px
 *             ├ "Palette · <theme>" 10px uppercase opacity .45, pl 4, mb 7
 *             │ swatches 22x22 radius 6, 2px border (accent when active),
 *             │   background linear-gradient(135deg, bg 45%, accent 45%)
 *             ├ offline card: 1px divider border, radius md, padding 8,
 *             │   gap 7, 11px muted, ph-wifi-slash
 *             └ user row: padding 6px 4px; gap 9
 *                 avatar 32x32 radius 10, gradient accent→accent-700, #fff
 *                 name 13px heading + @handle 11px muted
 *                 ph-gear-six @17px → settings
 *
 * Note the sidebar has no background of its own — only a right border.
 */
import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../hooks/useAuth";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { THEMES } from "../../constants/themes";
import { Icon, type IconName } from "../ui/Icon";
import { ThemeSwatch } from "../ui/ThemeSwatch";
import { fontFamily } from "../../constants/fonts";

// `badge` was a hardcoded `3` here regardless of any real unread count —
// every account, forever, saw "3 new notifications." No notifications
// endpoint is wired anywhere in hooks/ yet (NotificationsScreen renders a
// fixed DEMO_NOTIFS array), so there's no real count to show. Once that
// screen gets its own pass, wire a real unread count through here instead
// of restoring a fixed number.
const NAV: { icon: IconName; label: string; href: string; badge?: number }[] = [
  { icon: "film-strip",       label: "Library",       href: "/(app)" },
  { icon: "rss",              label: "Feed",          href: "/(app)/feed" },
  { icon: "magnifying-glass", label: "Search",        href: "/(app)/search" },
  { icon: "bell",             label: "Notifications", href: "/(app)/notifications" },
  { icon: "chart-bar",        label: "Stats",         href: "/(app)/stats" },
  { icon: "user",             label: "Profile",       href: "/(app)/profile" },
];

export function Sidebar({ children }: { children: React.ReactNode }) {
  // Tablet width (768-1119px) used to get the full 236px sidebar — the
  // same width as desktop — squeezing whatever content was left into a
  // cramped remainder. Defaulting to collapsed (68px, icon rail only) at
  // tablet width gives that room back; desktop still opens expanded. A
  // manual click still freely toggles either way — the effect below only
  // resets to the breakpoint's own default when isTablet itself flips
  // (i.e. an actual boundary crossing), not on every render, so it never
  // fights a click made while sitting still at one width.
  const { isTablet } = useBreakpoint();
  const [collapsed, setCollapsed] = useState(isTablet);
  useEffect(() => { setCollapsed(isTablet); }, [isTablet]);
  const { theme, setTheme, fontConfig } = useTheme();
  const { signOut, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const headingFamily = fontFamily(fontConfig, "heading", 600);
  const muted = `${theme.text}8c`;

  // This card used to render unconditionally, every session, claiming
  // "Offline-ready · installed as PWA" — false on both counts (dist/ ships
  // no manifest and no service worker; nothing was actually installed).
  // Only show it, and only the part that's actually checkable, when the
  // page is genuinely running in an installed/standalone window.
  const [isStandalone, setIsStandalone] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const mq = (window as any).matchMedia?.("(display-mode: standalone)");
    if (!mq) return;
    setIsStandalone(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // activeFor(): library also owns detail/log; profile also owns settings
  function isActive(href: string) {
    const seg = href.replace("/(app)", "");
    if (seg === "") {
      return ["/", "", "/(app)", "/index"].includes(pathname)
        || pathname.startsWith("/log") || pathname.startsWith("/movie");
    }
    if (seg === "/profile") return pathname.startsWith("/profile") || pathname.startsWith("/settings");
    return pathname.startsWith(seg);
  }

  const displayName =
    (session?.user?.user_metadata?.full_name as string | undefined)
    ?? session?.user?.email?.split("@")[0]
    ?? "Guest";
  const handle = session?.user?.email?.split("@")[0] ?? "guest";
  const initial = displayName[0]?.toUpperCase() ?? "U";

  // ── Web ─────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div className="app-shell">
        {/* .grain sits at shell level in the design; .cine-bg does NOT —
            it belongs to the Library header only (see LibraryScreen). */}
        <div className="grain" style={{ position: "absolute" } as React.CSSProperties} />

        <div
          className={collapsed ? "sidebar collapsed" : "sidebar"}
          style={{
            flex: "none",
            borderRight: `1px solid ${theme.divider}`,
            display: "flex",
            flexDirection: "column",
            padding: "18px 14px",
            gap: 4,
            overflow: "hidden",
          } as React.CSSProperties}
        >
          {/* Brand row */}
          <div
            className="brandrow"
            style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 8px 18px" } as React.CSSProperties}
          >
            <div
              className="lbl"
              style={{
                width: 32, height: 32, borderRadius: 9, flex: "none",
                display: "grid", placeItems: "center",
                border: `1px solid ${theme.accent}`, color: theme.accent,
              } as React.CSSProperties}
            >
              <Icon name="film-slate" weight="fill" size={18} />
            </div>
            <div
              className="lbl"
              style={{ fontFamily: headingFamily, fontSize: 19, letterSpacing: "-.01em", flex: 1 } as React.CSSProperties}
            >
              CineLog
            </div>
            <Icon
              name="sidebar-simple"
              size={20}
              className="tapc text-muted"
              style={{ cursor: "pointer" }}
              onClick={() => setCollapsed((c) => !c)}
            />
          </div>

          {/* Nav items — before the CTA, per the design */}
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <div
                key={n.href}
                className={active ? "navitem active" : "navitem"}
                onClick={() => router.push(n.href as any)}
              >
                <Icon name={n.icon} size={19} />
                <span className="lbl" style={{ flex: 1 } as React.CSSProperties}>{n.label}</span>
                {n.badge ? (
                  <span
                    className="lbl"
                    style={{
                      background: theme.accent, color: theme.bg, fontSize: 10,
                      borderRadius: 999, padding: "1px 6px",
                    } as React.CSSProperties}
                  >
                    {n.badge}
                  </span>
                ) : null}
              </div>
            );
          })}

          {/* CTA */}
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 12 } as React.CSSProperties}
            onClick={() => router.push("/(app)/log/new" as any)}
          >
            <Icon name="plus-circle" size={16} />
            <span className="lbl">Log a screening</span>
          </button>

          {/* Bottom block */}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 } as React.CSSProperties}>
            <div className="lbl">
              <div
                style={{
                  fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase",
                  opacity: 0.45, marginBottom: 7, paddingLeft: 4,
                } as React.CSSProperties}
              >
                Palette · {THEMES.find((t) => t.key === theme.key)?.label ?? ""}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 } as React.CSSProperties}>
                {THEMES.map((t) => (
                  <ThemeSwatch
                    key={t.key}
                    bg={t.bg}
                    accent={t.accent}
                    active={t.key === theme.key}
                    activeColor={theme.accent}
                    onPress={() => setTheme(t.key)}
                    title={t.label}
                  />
                ))}
              </div>
            </div>

            {isStandalone ? (
              <div
                className="lbl"
                style={{
                  display: "flex", alignItems: "center", gap: 7, fontSize: 11,
                  color: muted, padding: 8,
                  border: `1px solid ${theme.divider}`, borderRadius: 8,
                } as React.CSSProperties}
              >
                <Icon name="wifi-slash" size={14} />
                Installed as PWA
              </div>
            ) : null}

            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 4px" } as React.CSSProperties}>
              <div
                style={{
                  width: 32, height: 32, flex: "none", borderRadius: 10,
                  background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent700})`,
                  display: "grid", placeItems: "center", color: "#fff",
                  fontFamily: headingFamily, fontSize: 14,
                } as React.CSSProperties}
              >
                {initial}
              </div>
              <div className="lbl" style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
                <div style={{ fontSize: 13, fontFamily: headingFamily, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as React.CSSProperties}>
                  {displayName}
                </div>
                <div className="text-muted" style={{ fontSize: 11 } as React.CSSProperties}>@{handle}</div>
              </div>
              <Icon
                name="gear-six"
                size={17}
                className="tapc text-muted lbl"
                style={{ cursor: "pointer" }}
                onClick={() => router.push("/(app)/settings" as any)}
              />
            </div>
          </div>
        </div>

        {/* Main column */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } as React.CSSProperties}>
          {children}
        </div>
      </div>
    );
  }

  // ── Native ──────────────────────────────────────────────────────────────────
  // The sidebar is a web-only affordance; mobile navigates via TabBar. This
  // branch exists for tablet/landscape use and mirrors the same measurements.
  const width = collapsed ? 68 : 236;
  return (
    <View style={styles.root}>
      <View style={[styles.sidebar, { width, borderRightColor: theme.divider }]}>
        <View style={[styles.brandRow, collapsed && styles.centered]}>
          <View style={[styles.brandTile, { borderColor: theme.accent }]}>
            <Icon name="film-slate" weight="fill" size={18} color={theme.accent} />
          </View>
          {!collapsed && (
            <Text style={{ fontFamily: headingFamily, fontSize: 19, letterSpacing: -0.19, flex: 1, color: theme.text }}>
              CineLog
            </Text>
          )}
          <Pressable onPress={() => setCollapsed((c) => !c)} hitSlop={8}>
            <Icon name="sidebar-simple" size={20} color={muted} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Pressable
                key={n.href}
                onPress={() => router.push(n.href as any)}
                style={[
                  styles.navItem,
                  collapsed && styles.navItemCollapsed,
                  active && { backgroundColor: `${theme.accent}21` }, // 13%
                ]}
              >
                <Icon name={n.icon} size={19} color={active ? theme.accent : `${theme.text}9e`} />
                {!collapsed && (
                  <Text style={{ flex: 1, fontSize: 14, color: active ? theme.accent : `${theme.text}9e` }}>
                    {n.label}
                  </Text>
                )}
                {!collapsed && n.badge ? (
                  <View style={{ backgroundColor: theme.accent, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 10, color: theme.bg }}>{n.badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => router.push("/(app)/log/new" as any)}
            style={[styles.cta, { borderColor: theme.accent }, collapsed && styles.centered]}
          >
            <Icon name="plus-circle" size={16} color={theme.accent} />
            {!collapsed && (
              <Text style={{ fontFamily: headingFamily, fontSize: 14, color: theme.accent }}>Log a screening</Text>
            )}
          </Pressable>
        </ScrollView>

        <View style={{ gap: 12 }}>
          {!collapsed && (
            <View>
              <Text style={styles.paletteLabel}>
                PALETTE · {(THEMES.find((t) => t.key === theme.key)?.label ?? "").toUpperCase()}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                {THEMES.map((t) => (
                  <ThemeSwatch
                    key={t.key}
                    bg={t.bg}
                    accent={t.accent}
                    active={t.key === theme.key}
                    activeColor={theme.accent}
                    onPress={() => setTheme(t.key)}
                  />
                ))}
              </View>
            </View>
          )}

          <Pressable
            onPress={() => router.push("/(app)/settings" as any)}
            style={[styles.userRow, collapsed && styles.centered]}
          >
            <LinearGradient
              colors={[theme.accent, theme.accent700]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={{ color: "#fff", fontFamily: headingFamily, fontSize: 14 }}>{initial}</Text>
            </LinearGradient>
            {!collapsed && (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: headingFamily, color: theme.text }}>
                  {displayName}
                </Text>
                <Text style={{ fontSize: 11, color: muted }}>@{handle}</Text>
              </View>
            )}
            {!collapsed && <Icon name="gear-six" size={17} color={muted} />}
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row" },
  sidebar: {
    flexShrink: 0, borderRightWidth: 1,
    paddingVertical: 18, paddingHorizontal: 14, gap: 4, overflow: "hidden",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingTop: 4, paddingHorizontal: 8, paddingBottom: 18 },
  brandTile: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  centered: { justifyContent: "center" },
  navItem: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8 },
  navItemCollapsed: { justifyContent: "center", paddingHorizontal: 0 },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 12, borderWidth: 1, borderRadius: 8, paddingVertical: 5.6, paddingHorizontal: 10,
  },
  paletteLabel: { fontSize: 10, letterSpacing: 1, opacity: 0.45, marginBottom: 7, paddingLeft: 4 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 6, paddingHorizontal: 4 },
  avatar: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
