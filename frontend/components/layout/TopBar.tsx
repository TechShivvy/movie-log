/**
 * TopBar — matches CineLog Web.dc.html exactly.
 *
 * Design spec: height:62px, border-bottom:1px divider, padding:0 26px
 *   ← search input (max-width:560px, .input class) | install btn + bell btn-icon →
 *
 * Web:    HTML elements with design-system CSS classes.
 * Native: (not shown on mobile — TabBar replaces it) — renders a minimal header.
 */
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, MagnifyingGlass, ArrowDown } from "phosphor-react-native";
import { useTheme } from "../../hooks/useTheme";

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

  // ── Web ──────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div
        className="topbar"
        style={{ position: "relative" } as React.CSSProperties}
      >
        {/* Search input — grows to max 560px */}
        <div
          style={{
            flex: 1,
            maxWidth: 560,
            position: "relative",
            display: "flex",
            alignItems: "center",
          } as React.CSSProperties}
        >
          <div style={{ position: "absolute", left: 10, pointerEvents: "none" } as React.CSSProperties}>
            <MagnifyingGlass size={16} color={`${theme.text}55`} />
          </div>
          <input
            className="input"
            placeholder="Search movies, people, venues…"
            onClick={() => router.push("/(app)/search" as any)}
            readOnly
            style={{
              paddingLeft: 34,
              cursor: "pointer",
              width: "100%",
            } as React.CSSProperties}
          />
        </div>

        {/* Right side controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" } as React.CSSProperties}>
          {installPrompt && (
            <button className="btn btn-secondary" onClick={handleInstall}>
              <ArrowDown size={14} color={theme.text} />
              Install app
            </button>
          )}

          {/* Bell with notification dot */}
          <div style={{ position: "relative" } as React.CSSProperties}>
            <button
              className="btn btn-icon btn-secondary"
              onClick={() => router.push("/(app)/notifications" as any)}
            >
              <Bell size={18} color={theme.text} />
            </button>
            {/* Notification dot */}
            <div style={{
              position: "absolute", top: 6, right: 6,
              width: 7, height: 7, borderRadius: "50%",
              backgroundColor: theme.accent,
              border: `1.5px solid ${theme.surface}`,
            } as React.CSSProperties} />
          </div>
        </div>
      </div>
    );
  }

  // ── Native (minimal — used only if shown) ────────────────────────────────────
  return (
    <View style={[styles.bar, { backgroundColor: theme.surface, borderBottomColor: theme.divider }]}>
      <Pressable
        onPress={() => router.push("/(app)/search" as any)}
        style={[styles.searchTap, { backgroundColor: theme.neutral800, borderColor: theme.divider }]}
      >
        <MagnifyingGlass size={15} color={`${theme.text}55`} />
        <Text style={[styles.placeholder, { color: `${theme.text}55` }]}>
          Search movies, people…
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(app)/notifications" as any)}
        style={styles.bellBtn}
      >
        <Bell size={20} color={theme.text} />
        <View style={[styles.dot, { backgroundColor: theme.accent }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 62,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  searchTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  placeholder: { fontSize: 14 },
  bellBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: 4 },
});
