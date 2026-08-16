import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../hooks/useAuth";
import { Badge } from "../ui/Badge";
import { styles } from "./Sidebar.styles";

const NAV = [
  { label: "Library",       icon: "🎬", href: "/(app)" },
  { label: "Feed",          icon: "📡", href: "/(app)/feed" },
  { label: "Search",        icon: "🔍", href: "/(app)/search" },
  { label: "Profile",       icon: "👤", href: "/(app)/profile" },
  { label: "Stats",         icon: "📊", href: "/(app)/stats" },
  { label: "Notifications", icon: "🔔", href: "/(app)/notifications" },
  { label: "Settings",      icon: "⚙️",  href: "/(app)/settings" },
];

interface SidebarProps {
  children: React.ReactNode;
  unreadNotifications?: number;
}

export function Sidebar({ children, unreadNotifications = 0 }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme } = useTheme();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const width = collapsed ? 68 : 236;

  const isActive = (href: string) =>
    href === "/(app)"
      ? pathname === "/" || pathname === "/(app)" || pathname === "/index"
      : pathname.startsWith(href.replace("/(app)", ""));

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
            const active = isActive(item.href);
            const badge = item.href === "/(app)/notifications" ? unreadNotifications : 0;
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
                {!collapsed && badge > 0 && (
                  <View style={styles.badgeWrap}>
                    <Badge count={badge} />
                  </View>
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
          <Text style={{ color: `${theme.text}55`, fontSize: 12 }}>
            {collapsed ? "↩" : "Sign out"}
          </Text>
        </Pressable>
      </View>

      {/* Main content */}
      <View style={styles.main}>{children}</View>
    </View>
  );
}
