import { Redirect, Stack } from "expo-router";
import { Platform, View, ActivityIndicator } from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { CinematicBg } from "../../components/layout/CinematicBg";
import { FilmGrain } from "../../components/layout/FilmGrain";
import { Sidebar } from "../../components/layout/Sidebar";

function WebLayout({ children }: { children: React.ReactNode }) {
  return (
    <Sidebar>
      <View style={{ flex: 1 }}>{children}</View>
    </Sidebar>
  );
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)" />;
  }

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <CinematicBg />
        <FilmGrain />
        <WebLayout>
          <Stack screenOptions={{ headerShown: false }} />
        </WebLayout>
      </View>
    );
  }

  // Mobile: Stack navigation (tabs will be added in Phase 2)
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <CinematicBg />
      <FilmGrain />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
