import React from "react";
import { Redirect, Stack } from "expo-router";
import { Platform, SafeAreaView, StyleSheet, View, ActivityIndicator } from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
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
  return (
    <View style={[styles.mobileRoot, { backgroundColor: theme.bg }]}>
      {/* Only .grain is app-wide. .cine-bg is NOT a shell layer — in the design
          it appears solely on the mobile login screen and as the Library
          header's 280px band, so rendering it here tinted every screen. */}
      <FilmGrain />

      <View style={styles.mobileContent}>{children}</View>

      <SafeAreaView style={{ backgroundColor: theme.surface }}>
        <TabBar />
      </SafeAreaView>
    </View>
  );
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  const { theme } = useTheme();

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

  const stack = <Stack screenOptions={{ headerShown: false }} />;

  if (Platform.OS === "web") {
    return <WebLayout>{stack}</WebLayout>;
  }

  return <MobileLayout>{stack}</MobileLayout>;
}

const styles = StyleSheet.create({
  loader:        { flex: 1, alignItems: "center", justifyContent: "center" },
  mobileRoot:    { flex: 1, position: "relative" },
  mobileContent: { flex: 1, zIndex: 1 },
});
