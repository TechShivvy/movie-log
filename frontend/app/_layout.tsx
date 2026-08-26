import { Stack } from "expo-router";
import { IconContext } from "phosphor-react-native";
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
import { relativeLuminance } from "../constants/themes";

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
  // Was a hardcoded <StatusBar style="light"/> — correct for this app's
  // dark themes, wrong for its light ones (Champagne, and any custom
  // theme a user picks with a light background — see the theme picker):
  // "light" means light (white) system-bar icons, which don't contrast
  // against a light app background near the top of the screen. Picking
  // from the theme's own background luminance (the same WCAG math
  // Theme's own onAccent token already uses) instead of a fixed guess
  // means this stays correct for every current and future theme,
  // built-in or custom, with no per-theme special case to maintain.
  const statusBarStyle = relativeLuminance(theme.bg) < 0.5 ? "light" : "dark";
  return (
    // phosphor-react-native's IconBase falls back to a hardcoded '#000'
    // whenever a <Icon> is rendered with no explicit color prop (see
    // node_modules/phosphor-react-native/src/lib/icon-base.tsx) — not
    // currentColor, not theme-aware, just permanently black. Every icon
    // call site across the app that forgot to pass its own color (the
    // Follow button, Settings/Edit profile buttons, more likely still
    // out there) rendered as a hard-to-see black glyph on every dark
    // theme. Providing a theme-aware default here fixes all of them at
    // once, present and future, instead of hunting down each call site —
    // an icon that DOES pass its own color prop is untouched either way,
    // since IconBase only falls back to this when color is omitted.
    <IconContext.Provider value={{ color: theme.text }}>
      <StatusBar style={statusBarStyle} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        {/* /auth/callback — OAuth redirect handler (web + native deep-link) */}
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        {/* Signed in, but no username set yet — see (app)/_layout.tsx's
            redirect gate. Deliberately a sibling of (app), not nested
            inside it, so it renders full-screen without the Sidebar/
            TabBar shell. */}
        <Stack.Screen name="onboarding" />
      </Stack>
    </IconContext.Provider>
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
