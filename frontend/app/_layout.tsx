import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { Provider } from "react-redux";
import { ToastHost } from "../src/components/ToastHost";
import { SessionProvider } from "../src/providers/SessionProvider";
import { store } from "../src/store";
import { ThemeProvider, useTheme } from "../src/theme/ThemeContext";

function AppShell() {
  const colors = useTheme();
  return (
    <>
      <StatusBar style="auto" />
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
        <ToastHost />
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <SessionProvider>
          <AppShell />
        </SessionProvider>
      </ThemeProvider>
    </Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
