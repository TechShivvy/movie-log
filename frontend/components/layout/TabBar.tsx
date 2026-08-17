/**
 * TabBar — ported from docs/design/CineLog Mobile.dc.html (lines 558-568).
 *
 *   bar     flex; align-items:center; justify-content:space-around;
 *           padding:8px 6px 22px; border-top:1px solid divider
 *   tab     column; gap:3px; padding:4px 10px
 *           icon 22px, label 10px
 *           colour = accent when active, else text at 45%
 *   centre  54x54 circle, margin-top:-24px, accent bg, bg-coloured
 *           ph-bold ph-plus @26px,
 *           box-shadow 0 6px 20px accent 45%
 *
 * Active mapping mirrors tabColor():
 *   library ← detail | movie | venue | stats
 *   profile ← settings | notifications
 */
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { Icon, type IconName } from "../ui/Icon";

const TABS: { icon: IconName; label: string; href: string; owns?: string[] }[] = [
  { icon: "film-strip",       label: "Library", href: "/(app)",         owns: ["/log/", "/movie", "/venue", "/stats"] },
  { icon: "rss",              label: "Feed",    href: "/(app)/feed" },
  { icon: "magnifying-glass", label: "Search",  href: "/(app)/search" },
  { icon: "user",             label: "Profile", href: "/(app)/profile", owns: ["/settings", "/notifications"] },
];

export function TabBar() {
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  if (Platform.OS === "web") return null;

  const inactive = `${theme.text}73`; // text 45%

  function isActive(t: (typeof TABS)[number]) {
    const seg = t.href.replace("/(app)", "");
    if (seg === "") {
      return ["/", "", "/(app)", "/index"].includes(pathname)
        || (t.owns ?? []).some((o) => pathname.startsWith(o));
    }
    return pathname.startsWith(seg) || (t.owns ?? []).some((o) => pathname.startsWith(o));
  }

  // Split so the centre FAB sits between Feed and Search, as in the design
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  const renderTab = (t: (typeof TABS)[number]) => {
    const active = isActive(t);
    return (
      <Pressable key={t.href} onPress={() => router.push(t.href as any)} style={styles.tab}>
        <Icon name={t.icon} size={22} color={active ? theme.accent : inactive} />
        <Text style={{ fontSize: 10, color: active ? theme.accent : inactive }}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { borderTopColor: theme.divider, backgroundColor: theme.surface }]}>
      {left.map(renderTab)}

      <Pressable
        onPress={() => router.push("/(app)/log/new" as any)}
        style={[
          styles.fab,
          {
            backgroundColor: theme.accent,
            shadowColor: theme.accent,
          },
        ]}
      >
        <Icon name="plus" weight="bold" size={26} color={theme.bg} />
      </Pressable>

      {right.map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
    paddingHorizontal: 6,
    paddingBottom: 22,
    borderTopWidth: 1,
  },
  tab: { alignItems: "center", gap: 3, paddingVertical: 4, paddingHorizontal: 10 },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginTop: -24,
    alignItems: "center",
    justifyContent: "center",
    // box-shadow: 0 6px 20px accent 45%
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
});
