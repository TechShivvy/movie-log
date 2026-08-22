/**
 * TopBar — ported from docs/design/CineLog Web.dc.html (lines 84-92).
 *
 *   height:62px; flex:none; border-bottom:1px solid divider;
 *   display:flex; align-items:center; gap:16px; padding:0 26px
 *     search wrap  position:relative; flex:1; max-width:560px
 *       icon       ph-magnifying-glass, absolute left:12px, centred,
 *                  colour ACCENT, 16px
 *       input      .input with padding-left:34px,
 *                  placeholder "Search films, theatres, people…"
 *     right        margin-left:auto; gap:10px
 *       btn-secondary  ph-download-simple  "Install app"
 *       btn-icon btn-secondary  ph-bell @18px + 7px accent dot at top:7 right:8
 *
 * Mobile uses TabBar instead; the native branch here is a compact fallback.
 */
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { Icon } from "../ui/Icon";
import { type as fontSizes } from "../../constants/fonts";

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

  if (Platform.OS === "web") {
    return (
      // className="topbar" (not inline styles) is what actually lets
      // designCss.ts's `@media (max-width: 1119px) { .topbar { padding:
      // 0 16px } }` reach this element — the inline padding this div used
      // to carry always wins over a class rule regardless of any media
      // query, so the tablet-width padding shrink was dead CSS: it fired
      // its selector but had zero effect. gap is still inline (16px, wider
      // than .topbar's own 8px) since this bar wants more breathing room
      // between the search field and the right-hand icons than a plain
      // .topbar consumer needs by default.
      <div
        className="topbar"
        style={{ borderBottom: `1px solid ${theme.divider}`, gap: 16 } as React.CSSProperties}
      >
        <div style={{ position: "relative", flex: 1, maxWidth: 560 } as React.CSSProperties}>
          <Icon
            name="magnifying-glass"
            size={16}
            color={theme.accent}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <input
            className="input"
            style={{ paddingLeft: 34 } as React.CSSProperties}
            placeholder="Search films, theatres, people…"
            // autoComplete off stops the browser's own unstyled suggestion
            // dropdown from appearing over the app's UI.
            autoComplete="off"
            onFocus={() => router.push("/(app)/search" as any)}
          />
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties}>
          {installPrompt && (
            <button className="btn btn-secondary" onClick={handleInstall}>
              <Icon name="download-simple" size={16} />
              Install app
            </button>
          )}
          {/* The unread dot used to render unconditionally — see the same
              note on Sidebar.tsx's NAV `badge`. No unread-notifications data
              source exists yet, so show none rather than a fake one. */}
          <button
            className="btn btn-icon btn-secondary"
            style={{ position: "relative" } as React.CSSProperties}
            onClick={() => router.push("/(app)/notifications" as any)}
          >
            <Icon name="bell" size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <View style={[styles.bar, { borderBottomColor: theme.divider }]}>
      <Pressable
        onPress={() => router.push("/(app)/search" as any)}
        style={[styles.searchTap, { backgroundColor: theme.surface, borderColor: theme.divider }]}
      >
        <Icon name="magnifying-glass" size={16} color={theme.accent} />
        <Text style={{ fontSize: fontSizes.base, color: `${theme.text}55` }}>Search films, theatres, people…</Text>
      </Pressable>

      <Pressable onPress={() => router.push("/(app)/notifications" as any)} style={styles.bellBtn}>
        <Icon name="bell" size={20} color={theme.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 62, flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, borderBottomWidth: 1 },
  searchTap: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    minHeight: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1,
  },
  bellBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
