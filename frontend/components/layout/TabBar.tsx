import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { Badge } from "../ui/Badge";
import { styles } from "./TabBar.styles";

interface TabItem {
  label: string;
  icon: string;
  href: string;
  badge?: number;
}

interface TabBarProps {
  unreadNotifications?: number;
}

export function TabBar({ unreadNotifications = 0 }: TabBarProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const LEFT_TABS: TabItem[] = [
    { label: "Library", icon: "🎬", href: "/(app)" },
    { label: "Feed", icon: "📡", href: "/(app)/feed" },
  ];

  const RIGHT_TABS: TabItem[] = [
    { label: "Search", icon: "🔍", href: "/(app)/search" },
    { label: "Profile", icon: "👤", href: "/(app)/profile" },
  ];

  const isActive = (href: string) =>
    href === "/(app)" ? pathname === "/" || pathname === "/(app)" || pathname === "/index"
    : pathname.startsWith(href.replace("/(app)", ""));

  const renderTab = (item: TabItem) => {
    const active = isActive(item.href);
    return (
      <Pressable
        key={item.href}
        onPress={() => router.push(item.href as any)}
        style={styles.tab}
      >
        <View>
          <Text style={{ fontSize: 22 }}>{item.icon}</Text>
          {item.badge != null && item.badge > 0 && (
            <View style={styles.badgeWrap}>
              <Badge count={item.badge} />
            </View>
          )}
        </View>
        <Text style={[styles.tabLabel, { color: active ? theme.accent : `${theme.text}66` }]}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.tabBar, { backgroundColor: `${theme.surface}f0`, borderTopColor: theme.divider }]}>
      {LEFT_TABS.map(renderTab)}

      {/* Center FAB */}
      <View style={styles.fabWrap}>
        <Pressable
          onPress={() => router.push("/(app)/log/new")}
          style={[styles.fab, { backgroundColor: theme.accent }]}
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      </View>

      {RIGHT_TABS.map((item) =>
        renderTab(item.href === "/(app)/profile"
          ? { ...item, badge: undefined }
          : item.href === "/(app)/notifications"
          ? { ...item, badge: unreadNotifications }
          : item
        )
      )}
    </View>
  );
}
