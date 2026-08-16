import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../hooks/useAuth";

const NAV = [
  { label: "Library", icon: "🎬", href: "/(app)" },
  { label: "Feed", icon: "📡", href: "/(app)/feed" },
  { label: "Search", icon: "🔍", href: "/(app)/search" },
  { label: "Profile", icon: "👤", href: "/(app)/profile" },
  { label: "Stats", icon: "📊", href: "/(app)/stats" },
  { label: "Notifications", icon: "🔔", href: "/(app)/notifications" },
  { label: "Settings", icon: "⚙️", href: "/(app)/settings" },
];

export function Sidebar({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme } = useTheme();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const width = collapsed ? 68 : 236;

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      <View
        style={[
          styles.sidebar,
          {
            width,
            backgroundColor: `${theme.surface}ee`,
            borderRightColor: theme.divider,
          },
        ]}
      >
        {/* Logo */}
        <View style={[styles.logoRow, { justifyContent: collapsed ? "center" : "space-between" }]}>
          {!collapsed && (
            <Text style={[styles.logoText, { color: theme.accent }]}>CineLog</Text>
          )}
          <Pressable onPress={() => setCollapsed((c) => !c)} style={styles.collapseBtn}>
            <Text style={{ color: theme.text, fontSize: 16 }}>{collapsed ? "▶" : "◀"}</Text>
          </Pressable>
        </View>

        {/* Nav items */}
        <View style={styles.nav}>
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/(app)" && pathname.startsWith(item.href));
            return (
              <Pressable
                key={item.href}
                onPress={() => router.push(item.href as any)}
                style={[
                  styles.navItem,
                  {
                    backgroundColor: active ? `${theme.accent}22` : "transparent",
                    justifyContent: collapsed ? "center" : "flex-start",
                  },
                ]}
              >
                <Text style={styles.navIcon}>{item.icon}</Text>
                {!collapsed && (
                  <Text style={[styles.navLabel, { color: active ? theme.accent : `${theme.text}88` }]}>
                    {item.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Log FAB */}
        <Pressable
          onPress={() => router.push("/(app)/log/new")}
          style={[styles.fab, { backgroundColor: theme.accent, alignSelf: collapsed ? "center" : "stretch" }]}
        >
          <Text style={styles.fabText}>{collapsed ? "+" : "+ Log Film"}</Text>
        </Pressable>

        {/* Sign out */}
        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={{ color: `${theme.text}55`, fontSize: 12 }}>{collapsed ? "↩" : "Sign out"}</Text>
        </Pressable>
      </View>

      {/* Main content */}
      <View style={styles.main}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row" },
  sidebar: {
    borderRightWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 4,
    ...(Platform.OS === "web" ? { transition: "width 0.2s" } as any : {}),
  },
  logoRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, marginBottom: 16 },
  logoText: { fontSize: 18, fontWeight: "800" },
  collapseBtn: { padding: 4 },
  nav: { flex: 1, gap: 2 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    ...(Platform.OS === "web" ? { cursor: "pointer" } as any : {}),
  },
  navIcon: { fontSize: 18 },
  navLabel: { fontSize: 14, fontWeight: "500" },
  fab: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
    marginHorizontal: 4,
    ...(Platform.OS === "web" ? { cursor: "pointer" } as any : {}),
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  signOut: { alignItems: "center", paddingVertical: 8, marginTop: 4 },
});
