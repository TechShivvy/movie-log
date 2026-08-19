/**
 * TabBar — mobile bottom nav.
 *
 * Redesigned from the original literal port of docs/design/CineLog
 * Mobile.dc.html (lines 558-568): that spec's `box-shadow:0 6px 20px
 * accent@45%` glow around the centre FAB is a real soft-blurred CSS
 * shadow on web, but React Native has no way to render it — shadow*
 * props are iOS-only and Android's `elevation` is a flat grey drop
 * shadow with no colour or blur at all. The original fabGlow worked
 * around that with a flat 35%-opacity accent circle sitting behind the
 * button — which doesn't fade, so it reads as a second hard-edged ring
 * around the FAB rather than a glow (confirmed on a real device). Now
 * built as a true radial gradient (react-native-svg) that fades to
 * fully transparent at its edge, so there's no ring to see, on every
 * renderer this runs on.
 *
 * Also: flat theme.surface + a 1px top line didn't share any visual
 * language with the rest of the app (Sidebar's rounded, elevated cards
 * and `accent@13%` active-pill treatment) — the bar is now an elevated
 * surfaceHigh panel with rounded top corners and the same active-pill
 * pattern Sidebar uses for its nav items.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";
import { useTheme } from "../../hooks/useTheme";
import { Icon, type IconName } from "../ui/Icon";

const TABS: { icon: IconName; label: string; href: string; owns?: string[] }[] = [
  { icon: "film-strip",       label: "Library", href: "/(app)",         owns: ["/log/", "/movie", "/venue", "/stats"] },
  { icon: "rss",              label: "Feed",    href: "/(app)/feed" },
  { icon: "magnifying-glass", label: "Search",  href: "/(app)/search" },
  { icon: "user",             label: "Profile", href: "/(app)/profile", owns: ["/settings", "/notifications"] },
];

const FAB_SIZE = 62;   // was 54 — "make the plus bigger than other sections"
const FAB_ICON = 30;   // was 26
const GLOW_SIZE = 108; // fully-faded radius well past the button's edge

export function TabBar() {
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  // No Platform.OS guard: the parent layout (app/(app)/_layout.tsx) now
  // decides whether to mount TabBar at all, based on viewport width, not
  // platform. Pressable/Icon both already render fine on web through
  // react-native-web.
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
        {/* Same accent@13% active-pill Sidebar uses for its nav items —
            the one piece of shared visual language the old flat-icon
            tabs had none of. */}
        <View style={[styles.tabPill, active && { backgroundColor: `${theme.accent}21` }]}>
          <Icon name={t.icon} size={22} color={active ? theme.accent : inactive} />
        </View>
        <Text style={{ fontSize: 10, color: active ? theme.accent : inactive }}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { backgroundColor: theme.surfaceHigh, shadowColor: "#000" }]}>
      {left.map(renderTab)}

      <View style={styles.fabWrap}>
        <Svg
          pointerEvents="none"
          width={GLOW_SIZE}
          height={GLOW_SIZE}
          style={{ position: "absolute", top: (FAB_SIZE - GLOW_SIZE) / 2, left: (FAB_SIZE - GLOW_SIZE) / 2 }}
        >
          <Defs>
            <RadialGradient id="fabGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={theme.accent} stopOpacity={0.5} />
              <Stop offset="45%" stopColor={theme.accent} stopOpacity={0.22} />
              <Stop offset="100%" stopColor={theme.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#fabGlow)" />
        </Svg>
        <Pressable
          onPress={() => router.push("/(app)/log/new" as any)}
          style={[
            styles.fab,
            { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, backgroundColor: theme.accent, shadowColor: theme.accent },
          ]}
        >
          <Icon name="plus" weight="bold" size={FAB_ICON} color={theme.bg} />
        </Pressable>
      </View>

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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // Elevated panel, floating over content, instead of a hairline top
    // border — matches the --shadow-md card language used everywhere
    // else (Sidebar cards, dialogs), just cast upward since this sits
    // at the bottom edge of the screen.
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 12,
  },
  tab: { alignItems: "center", gap: 3, paddingVertical: 2, paddingHorizontal: 6 },
  tabPill: {
    width: 38, height: 30, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  fabWrap: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    marginTop: -(FAB_SIZE / 2 + 6),
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
});
