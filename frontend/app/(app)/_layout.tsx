import React from "react";
import { Redirect, Stack } from "expo-router";
import { Platform, StyleSheet, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { FilmGrain } from "../../components/layout/FilmGrain";
import { Sidebar } from "../../components/layout/Sidebar";
import { TabBar } from "../../components/layout/TabBar";
import { TopBar } from "../../components/layout/TopBar";

/**
 * Web layout:
 *   .app-shell (position:relative, display:flex, height:100vh, overflow:hidden)
 *     ├── .cine-bg  (position:absolute, animated gradient backdrop)
 *     ├── .grain    (position:fixed, film grain)
 *     ├── .sidebar  (236px → 68px collapsed)
 *     └── main column (flex:1, display:flex, flex-direction:column)
 *           ├── .topbar (height:62px)
 *           └── .mainscroll .clg-scroll (flex:1, overflow-y:auto)
 *
 * The Sidebar component owns the app-shell div and the bg layers on web.
 */
function WebLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    // On web, Sidebar renders the full app-shell div including bg layers.
    // We pass TopBar + main content as children.
    <Sidebar>
      <TopBar />
      <div
        className="clg-scroll mainscroll"
        style={{
          flex: 1,
          overflowY: "auto",
          position: "relative",
          zIndex: 1,
        } as React.CSSProperties}
      >
        {children}
      </div>
    </Sidebar>
  );
}

function MobileLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  // Real device insets (notch/status bar height, gesture-nav/home-indicator
  // height) — see app/_layout.tsx's SafeAreaProvider comment. `insets.top`
  // pads every screen below the status bar/notch instead of them starting
  // right under it; `insets.bottom` sits under TabBar's own fixed 22px
  // bottom padding so the tab bar (and the FAB poking up out of it) clears
  // the gesture bar/home indicator rather than sitting behind it.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.mobileRoot, { backgroundColor: theme.bg }]}>
      {/* Only .grain is app-wide. .cine-bg is NOT a shell layer — in the design
          it appears solely on the mobile login screen and as the Library
          header's 280px band, so rendering it here tinted every screen. */}
      <FilmGrain />

      <View style={[styles.mobileContent, { paddingTop: insets.top }]}>{children}</View>

      <View style={{ backgroundColor: theme.surface, paddingBottom: insets.bottom }}>
        <TabBar />
      </View>
    </View>
  );
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)" />;
  }

  // contentStyle is required — see the comment on ThemedStack in app/_layout.tsx.
  // Every screen under (app) (Settings, Feed, Profile, …) is a separate
  // Stack.Screen; without this each one painted its own opaque white
  // background over MobileLayout's dark theme.bg.
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
  );

  // Native always gets the phone shell (tablet/landscape is a later pass —
  // see useBreakpoint's doc comment). Web switches on viewport width: the
  // 236px Sidebar only fits comfortably at tablet width and up. Below that,
  // web gets the same TabBar shell native uses, instead of the desktop
  // sidebar overflowing a phone-width viewport.
  if (Platform.OS === "web" && !isMobile) {
    return <WebLayout>{stack}</WebLayout>;
  }

  return <MobileLayout>{stack}</MobileLayout>;
}

const styles = StyleSheet.create({
  loader:        { flex: 1, alignItems: "center", justifyContent: "center" },
  mobileRoot:    { flex: 1, position: "relative" },
  mobileContent: { flex: 1, zIndex: 1 },
});
