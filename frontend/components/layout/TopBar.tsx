import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { styles } from "./TopBar.styles";

export function TopBar() {
  const { theme } = useTheme();
  const router = useRouter();
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    (window as any).addEventListener("beforeinstallprompt", handler);
    return () => (window as any).removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <View style={[styles.bar, { backgroundColor: `${theme.surface}ee`, borderBottomColor: theme.divider }]}>
      {/* Search bar shortcut */}
      <Pressable
        onPress={() => router.push("/(app)/search")}
        style={[styles.searchWrap, { backgroundColor: theme.surfaceHigh, borderColor: theme.divider }]}
      >
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={[styles.searchPlaceholder, { color: `${theme.text}55` }]}>
          Search movies, people…
        </Text>
      </Pressable>

      {/* PWA install button (web only, shown when installable) */}
      {Platform.OS === "web" && installPrompt && (
        <Pressable
          onPress={handleInstall}
          style={[styles.installBtn, { borderColor: theme.divider, backgroundColor: theme.surfaceHigh }]}
        >
          <Text style={[styles.installText, { color: theme.text }]}>⬇ Install App</Text>
        </Pressable>
      )}
    </View>
  );
}
