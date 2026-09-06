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
 * Mobile (native, and mobile-WIDTH web/PWA) renders the compact native-
 * styled branch below instead — this bar is now actually mounted there
 * too (app/(app)/_layout.tsx's MobileLayout), which is the one thing
 * that kept this "fallback" branch dead code for however long: bare
 * `Platform.OS === "web"` doesn't exclude a phone-width browser tab, so
 * without the `!isMobile` check below, a PWA/mobile-web session would
 * have still gotten the desktop-sized bar (full search field + "Install
 * app" button) rather than this compact one, and the notifications bell
 * had nowhere to render at all before TopBar was mounted in
 * MobileLayout in the first place — see this session's own
 * run-frontend skill note on this exact bug class.
 */
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useUnreadNotificationCount } from "../../hooks/useNotifications";
import { Icon } from "../ui/Icon";
import { type as fontSizes } from "../../constants/fonts";

export function TopBar() {
  const { theme } = useTheme();
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const unreadCount = useUnreadNotificationCount();
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

  if (Platform.OS === "web" && !isMobile) {
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
        {/* A styled trigger, not a real <input> — it used to be a genuine,
            uncontrolled text field (no value/onChange, navigating on
            onFocus) that happily accepted typing which went precisely
            nowhere: nothing forwarded it, nothing cleared it, and
            refocusing it while already on /search re-fired the same
            navigation. Matches what the native branch below already did
            correctly: a button styled to look like the field, tapping it
            is the entire interaction. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => router.push("/(app)/search" as any)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push("/(app)/search" as any); } }}
          className="input"
          style={{
            position: "relative", flex: 1, maxWidth: 560, paddingLeft: 34,
            display: "flex", alignItems: "center", cursor: "pointer",
          } as React.CSSProperties}
        >
          <Icon
            name="magnifying-glass"
            size={16}
            color={theme.accent}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <span style={{ color: `${theme.text}88`, fontSize: 14 } as React.CSSProperties}>Search films, theatres, people…</span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties}>
          {installPrompt && (
            <button className="btn btn-secondary" onClick={handleInstall}>
              <Icon name="download-simple" size={16} />
              Install app
            </button>
          )}
          {/* The unread dot used to render unconditionally — see the same
              note on Sidebar.tsx's NAV `badge`, now resolved the same way:
              useUnreadNotificationCount() is a real derived value (GET
              /notifications?unread_only=true's list length), not a guess. */}
          <button
            className="btn btn-icon btn-secondary"
            style={{ position: "relative" } as React.CSSProperties}
            onClick={() => router.push("/(app)/notifications" as any)}
            title="Notifications"
            aria-label="Notifications"
          >
            <Icon name="bell" size={18} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 7, right: 8, width: 7, height: 7,
                borderRadius: 4, background: theme.accent,
              } as React.CSSProperties} />
            )}
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

      <Pressable
        onPress={() => router.push("/(app)/notifications" as any)}
        style={styles.bellBtn}
        accessibilityLabel="Notifications"
      >
        <Icon name="bell" size={20} color={theme.text} />
        {unreadCount > 0 && <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />}
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
  unreadDot: { position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 4 },
});
