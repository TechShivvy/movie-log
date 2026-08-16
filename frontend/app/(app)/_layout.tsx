import React from "react";
import { Redirect, Stack } from "expo-router";
import { Platform, SafeAreaView, StyleSheet, View, ActivityIndicator } from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { CinematicBg } from "../../components/layout/CinematicBg";
import { FilmGrain } from "../../components/layout/FilmGrain";
import { Sidebar } from "../../components/layout/Sidebar";
import { TabBar } from "../../components/layout/TabBar";
import { TopBar } from "../../components/layout/TopBar";

function WebLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.webRoot, { backgroundColor: theme.bg }]}>
      <CinematicBg />
      <FilmGrain />
      <Sidebar>
        <View style={styles.webMain}>
          <TopBar />
          <View style={styles.webContent}>{children}</View>
        </View>
      </Sidebar>
    </View>
  );
}

function MobileLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.mobileRoot, { backgroundColor: theme.bg }]}>
      <CinematicBg />
      <FilmGrain />
      <View style={styles.mobileContent}>{children}</View>
      <SafeAreaView style={{ backgroundColor: `${theme.surface}f0` }}>
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
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  webRoot: { flex: 1 },
  webMain: { flex: 1, flexDirection: "column" },
  webContent: { flex: 1 },
  mobileRoot: { flex: 1 },
  mobileContent: { flex: 1 },
});
