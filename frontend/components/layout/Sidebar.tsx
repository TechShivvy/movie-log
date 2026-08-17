/**
 * Sidebar component — matches CineLog Web.dc.html exactly.
 *
 * Web:    Uses design-system CSS classes (sidebar, navitem, navitem.active,
 *         btn btn-primary btn-block, lbl, brandrow) via className prop.
 *         Width transition handled by CSS cubic-bezier.
 * Native: StyleSheet with exact design-system measurements.
 */
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import {
  Bell,
  CaretLeft,
  CaretRight,
  ChartBar,
  FilmSlate,
  FilmStrip,
  MagnifyingGlass,
  Plus,
  Rss,
  SignOut,
  User,
  Palette,
} from "phosphor-react-native";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../hooks/useAuth";
import { THEMES } from "../../constants/themes";
import { CinematicBg } from "./CinematicBg";
import { FilmGrain } from "./FilmGrain";

const NAV = [
  { label: "Library",       icon: FilmStrip,       href: "/(app)" },
  { label: "Feed",          icon: Rss,             href: "/(app)/feed" },
  { label: "Search",        icon: MagnifyingGlass, href: "/(app)/search" },
  { label: "Notifications", icon: Bell,            href: "/(app)/notifications", badge: 3 },
  { label: "Stats",         icon: ChartBar,        href: "/(app)/stats" },
  { label: "Profile",       icon: User,            href: "/(app)/profile" },
] as const;

interface SidebarProps {
  children: React.ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme } = useTheme();
  const { signOut, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isWeb = Platform.OS === "web";

  function isActive(href: string) {
    if (href === "/(app)") {
      return pathname === "/" || pathname === "/(app)" || pathname === "/index" || pathname === "";
    }
    const seg = href.replace("/(app)", "");
    return pathname.startsWith(seg);
  }

  // ── Web render (uses CSS classes) ────────────────────────────────────────────
  if (isWeb) {
    return (
      <div
        className={"app-shell"}
        style={{ position: "relative", flex: 1, display: "flex" } as React.CSSProperties}
      >
        {/* Background layers */}
        <CinematicBg />
        <FilmGrain />

        {/* Sidebar */}
        <div className={collapsed ? "sidebar collapsed" : "sidebar"}>

          {/* Brand row */}
          <div
            className="brandrow"
            style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingInline: 4 } as React.CSSProperties}
          >
            <div style={{
              width: 32, height: 32, border: `1px solid ${theme.accent}`,
              borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            } as React.CSSProperties}>
              <FilmSlate size={16} color={theme.accent} weight="fill" />
            </div>
            <span
              className="lbl"
              style={{ fontSize: 19, fontWeight: "700", letterSpacing: -0.4, color: theme.text, flex: 1 } as React.CSSProperties}
            >
              CineLog
            </span>
            <button
              onClick={() => setCollapsed((c) => !c)}
              style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, padding: 2 } as React.CSSProperties}
            >
              {collapsed
                ? <CaretRight size={14} color={theme.text} />
                : <CaretLeft  size={14} color={theme.text} />}
            </button>
          </div>

          {/* Log a screening CTA */}
          <button
            className="btn btn-primary btn-block"
            onClick={() => router.push("/(app)/log/new" as any)}
            style={{ marginBottom: 8 } as React.CSSProperties}
          >
            <Plus size={14} color={theme.accent} />
            <span className="lbl">Log a screening</span>
          </button>

          {/* Nav items */}
          {NAV.map(({ label, icon: Icon, href, badge }: any) => {
            const active = isActive(href);
            return (
              <button
                key={href}
                className={active ? "navitem active" : "navitem"}
                onClick={() => router.push(href as any)}
                style={{ background: "none", border: "none", width: "100%", textAlign: "left" } as React.CSSProperties}
              >
                <Icon size={18} color={active ? theme.accent : `${theme.text}99`} weight={active ? "fill" : "regular"} />
                <span className="lbl" style={{ flex: 1 } as React.CSSProperties}>{label}</span>
                {badge > 0 && (
                  <span style={{
                    fontSize: 11, background: theme.accent, color: "#fff",
                    borderRadius: 10, padding: "1px 6px", fontWeight: 700,
                  } as React.CSSProperties}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Theme palette swatches */}
          <div style={{ display: "flex", gap: 5, paddingInline: 4, marginBottom: 8, flexWrap: "wrap" } as React.CSSProperties}>
            {THEMES.slice(0, 6).map((t) => (
              <div
                key={t.key}
                title={t.label}
                style={{
                  width: 13, height: 13, borderRadius: 3,
                  background: t.accent, flexShrink: 0,
                  cursor: "pointer", opacity: 0.8,
                } as React.CSSProperties}
              />
            ))}
          </div>

          {/* Offline-ready card */}
          {!collapsed && (
            <div className="card" style={{ marginBottom: 8, padding: "8px 10px" } as React.CSSProperties}>
              <span style={{ fontSize: 11, opacity: 0.55, color: theme.text } as React.CSSProperties}>
                Offline-ready · installed as PWA
              </span>
            </div>
          )}

          {/* User row */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8, paddingInline: 4,
              paddingTop: 8, borderTop: `1px solid ${theme.divider}`,
            } as React.CSSProperties}
          >
            {/* Avatar */}
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: `linear-gradient(135deg, ${theme.accent800}, ${theme.accent900})`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: theme.text,
            } as React.CSSProperties}>
              {session?.user?.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            {!collapsed && (
              <span style={{ flex: 1, fontSize: 13, color: theme.text, opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties}>
                {session?.user?.email ?? "Guest"}
              </span>
            )}
            <button
              onClick={signOut}
              title="Sign out"
              style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, padding: 2 } as React.CSSProperties}
            >
              <SignOut size={16} color={theme.text} />
            </button>
          </div>
        </div>

        {/* Main content area */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } as React.CSSProperties}>
          {children}
        </div>
      </div>
    );
  }

  // ── Native render (React Native StyleSheet) ───────────────────────────────────
  const w = collapsed ? 68 : 236;
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.sidebar,
          {
            width: w,
            backgroundColor: theme.surface,
            borderRightColor: theme.divider,
          },
        ]}
      >
        {/* Brand row */}
        <View style={[styles.brandRow, collapsed && styles.brandRowCollapsed]}>
          <View style={[styles.brandIcon, { borderColor: theme.accent }]}>
            <FilmSlate size={14} color={theme.accent} weight="fill" />
          </View>
          {!collapsed && (
            <Text style={[styles.brandText, { color: theme.text }]}>CineLog</Text>
          )}
          <Pressable onPress={() => setCollapsed((c) => !c)} style={styles.toggleBtn}>
            {collapsed
              ? <CaretRight size={12} color={theme.text} />
              : <CaretLeft  size={12} color={theme.text} />}
          </Pressable>
        </View>

        {/* Log CTA */}
        <Pressable
          onPress={() => router.push("/(app)/log/new" as any)}
          style={[
            styles.logBtn,
            {
              borderColor: theme.accent,
              justifyContent: collapsed ? "center" : "flex-start",
            },
          ]}
        >
          <Plus size={14} color={theme.accent} />
          {!collapsed && <Text style={[styles.logBtnText, { color: theme.accent }]}>Log a screening</Text>}
        </Pressable>

        {/* Nav items */}
        <View style={styles.nav}>
          {NAV.map(({ label, icon: Icon, href, badge }: any) => {
            const active = isActive(href);
            return (
              <Pressable
                key={href}
                onPress={() => router.push(href as any)}
                style={[
                  styles.navItem,
                  {
                    backgroundColor: active ? theme.accent900 : "transparent",
                    justifyContent: collapsed ? "center" : "flex-start",
                    paddingLeft: collapsed ? 0 : 12,
                    paddingRight: collapsed ? 0 : 12,
                  },
                ]}
              >
                <Icon
                  size={18}
                  color={active ? theme.accent : `${theme.text}99`}
                  weight={active ? "fill" : "regular"}
                />
                {!collapsed && (
                  <Text style={[styles.navLabel, { color: active ? theme.accent : `${theme.text}99` }]}>
                    {label}
                  </Text>
                )}
                {!collapsed && (badge ?? 0) > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Theme swatches */}
        <View style={[styles.swatches, collapsed && styles.swatchesCollapsed]}>
          {THEMES.slice(0, collapsed ? 3 : 6).map((t) => (
            <View key={t.key} style={[styles.swatch, { backgroundColor: t.accent }]} />
          ))}
        </View>

        {/* User row */}
        <View style={[styles.userRow, { borderTopColor: theme.divider }]}>
          <View style={[styles.avatar, { backgroundColor: theme.accent800 }]}>
            <Text style={[styles.avatarText, { color: theme.accent }]}>
              {session?.user?.email?.[0]?.toUpperCase() ?? "U"}
            </Text>
          </View>
          {!collapsed && (
            <Text style={[styles.userEmail, { color: `${theme.text}88` }]} numberOfLines={1}>
              {session?.user?.email ?? "Guest"}
            </Text>
          )}
          <Pressable onPress={signOut} style={styles.signOutBtn}>
            <SignOut size={15} color={`${theme.text}55`} />
          </Pressable>
        </View>
      </View>

      {/* Main content */}
      <View style={styles.main}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, flexDirection: "row" },
  sidebar: {
    flexShrink: 0,
    borderRightWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 14,
    gap: 4,
    overflow: "hidden",
    flexDirection: "column",
  },

  // Brand
  brandRow:          { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16, paddingHorizontal: 4 },
  brandRowCollapsed: { justifyContent: "center" },
  brandIcon:         { width: 32, height: 32, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  brandText:         { flex: 1, fontSize: 19, fontWeight: "700", letterSpacing: -0.4 },
  toggleBtn:         { marginLeft: "auto", padding: 4, opacity: 0.5 },

  // Log CTA button
  logBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10,
    marginBottom: 8,
  },
  logBtnText: { fontSize: 14, fontWeight: "500" },

  // Nav
  nav:      { gap: 2 },
  navItem:  { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 9, borderRadius: 8 },
  navLabel: { fontSize: 14, fontWeight: "500" },
  badge:    { marginLeft: "auto", minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeText:{ fontSize: 10, color: "#fff", fontWeight: "700" },

  // Swatches
  swatches:         { flexDirection: "row", flexWrap: "wrap", gap: 5, paddingHorizontal: 4, marginBottom: 8 },
  swatchesCollapsed:{ justifyContent: "center" },
  swatch:           { width: 13, height: 13, borderRadius: 3 },

  // User row
  userRow:   { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingTop: 8, borderTopWidth: 1 },
  avatar:    { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  avatarText:{ fontSize: 13, fontWeight: "700" },
  userEmail: { flex: 1, fontSize: 12 },
  signOutBtn:{ padding: 4 },

  main:      { flex: 1, minWidth: 0 },
});
