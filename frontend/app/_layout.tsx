import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet } from "react-native";
import { useFonts } from "expo-font";
import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
} from "@expo-google-fonts/sora";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { ThemeProvider } from "../context/ThemeContext";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import { useTheme } from "../hooks/useTheme";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/**
 * react-native-screens gives every Stack.Screen its own opaque background
 * (white by default) unless contentStyle says otherwise. Without this, each
 * pushed screen painted over our dark theme.bg, and the light theme.text
 * used throughout the app read as near-invisible on that white ground —
 * visible as "washed out" headings/labels on every screen except the very
 * first one rendered. Needs useTheme(), so it has to live inside ThemeProvider.
 */
function ThemedStack() {
  const { theme } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      {/* /auth/callback — OAuth redirect handler (web + native deep-link) */}
      <Stack.Screen name="auth" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Native has no webfonts — the TTFs bundled by @expo-google-fonts must be
  // registered explicitly or every fontFamily lookup silently falls back to
  // the platform system font. Web loads the same families via @import in
  // lib/designCss.ts, so this is skipped there.
  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // Hold the first paint until faces are registered so text doesn't flash in
  // the fallback font and reflow. Web never blocks (fonts arrive via CSS).
  if (!fontsLoaded && Platform.OS !== "web") return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* Provides the actual device insets (notch/status bar, home
          indicator / gesture nav bar) that useSafeAreaInsets() reads.
          react-native-safe-area-context was already a dependency but had
          no provider anywhere in the tree, and every screen imported
          SafeAreaView from plain "react-native" instead — that built-in
          component is iOS-only and even there considered legacy; on
          Android it's a no-op. Content sat under the status bar/notch and
          behind the gesture nav bar as a result. */}
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <ToastProvider>
                <StatusBar style="light" />
                <ThemedStack />
              </ToastProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
