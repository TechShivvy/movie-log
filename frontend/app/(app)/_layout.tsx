import React from "react";
import { Redirect, Stack } from "expo-router";
import { Platform, StyleSheet, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { useMyProfile } from "../../hooks/useProfile";
import { useTheme } from "../../hooks/useTheme";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { FilmGrain } from "../../components/layout/FilmGrain";
import { Sidebar } from "../../components/layout/Sidebar";
import { TabBar } from "../../components/layout/TabBar";
import { TopBar } from "../../components/layout/TopBar";

/**
 * Sidebar shell — the desktop/tablet layout (Sidebar + TopBar), not just a
 * web layout: previously gated to `Platform.OS === "web"` at the call site,
 * so a real iPad (`app.json` claims `supportsTablet: true`) always got the
 * plain phone shell regardless of its actual width. Sidebar and TopBar each
 * already have their own native branches (View-based, never reached before
 * this), so the only thing this wrapper needs is a Platform-safe main-
 * column container — web keeps the real `.mainscroll` div (scrollbar
 * styling, clg-scroll classes, etc. only mean anything as real CSS); native
 * gets a plain `View` with the same flex/1 role.
 *
 *   .app-shell (position:relative, display:flex, height:100vh, overflow:hidden)
 *     ├── .cine-bg  (position:absolute, animated gradient backdrop)
 *     ├── .grain    (position:fixed, film grain)
 *     ├── .sidebar  (236px → 68px collapsed, breakpoint-driven — see Sidebar.tsx)
 *     └── main column (flex:1, display:flex, flex-direction:column)
 *           ├── .topbar (height:62px)
 *           └── .mainscroll .clg-scroll (flex:1, overflow-y:auto)
 *
 * The Sidebar component owns the app-shell div and the bg layers on web.
 */
function SidebarShellLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const mainColumn =
    Platform.OS === "web" ? (
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
    ) : (
      <View style={{ flex: 1 }}>{children}</View>
    );
  return (
    // Sidebar renders the full app-shell div (with bg layers) on web, or
    // a plain flex row on native — either way it owns the outer wrapper.
    <Sidebar>
      <TopBar />
      {mainColumn}
    </Sidebar>
  );
}

function MobileLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  // Real device insets (notch/status bar height, gesture-nav/home-indicator
  // height) — see app/_layout.tsx's SafeAreaProvider comment. `insets.top`
  // pads every screen below the status bar/notch instead of them starting
  // right under it; `insets.bottom` sits under TabBar's own fixed 22px
  // bottom padding so the tab bar (and the FAB poking up out of it) clears
  // the gesture bar/home indicator rather than sitting behind it.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.mobileRoot, { backgroundColor: theme.bg }]}>
      {/* Only .grain is app-wide. .cine-bg is NOT a shell layer — in the design
          it appears solely on the mobile login screen and as the Library
          header's 280px band, so rendering it here tinted every screen. */}
      <FilmGrain />

      <View style={[styles.mobileContent, { paddingTop: insets.top }]}>{children}</View>

      {/* zIndex above mobileContent's — without it, mobileContent's own
          zIndex:1 (see styles below) outranked this wrapper's implicit
          0/auto, so the scrollable content behind the bar painted OVER
          it despite being earlier in the JSX: CSS stacking order is
          decided by zIndex first, DOM order only as a tiebreak among
          equal zIndex. TabBar's FAB pokes up out of the bar into the
          content area's own space via a negative offset — with the
          content on top, that entire popped-up portion of the FAB was
          invisible, painted over by whatever was behind it (confirmed:
          the circle rendered as a flat-topped half-circle, cut exactly
          at the bar's own boundary). This wrapper now outranks it, so
          the bar (and the FAB) correctly sits above the content it
          overlaps, not under it. */}
      <View style={{ backgroundColor: theme.surface, paddingBottom: insets.bottom, zIndex: 2 }}>
        <TabBar />
      </View>
    </View>
  );
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  // Called unconditionally (rules of hooks) even before we know there's
  // a session — enabled only checks DEMO_MODE, and an unauthenticated
  // call just 401s, which useMyProfile's own try/catch already turns
  // into `null` rather than an error state.
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();

  if (loading || (session && profileLoading)) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)" />;
  }

  // Mandatory-username onboarding gate — profile is only ever null here
  // if the fetch genuinely failed (network hiccup, backend down), not
  // "loading" (that's handled above) — redirecting on a failed fetch
  // would trap a returning user with a real username in a loop the
  // moment their connection blips, so this only fires once we've
  // gotten a real response back and it confirms there's genuinely no
  // username set.
  if (profile && !profile.username) {
    return <Redirect href="/onboarding" />;
  }

  // contentStyle is required — see the comment on ThemedStack in app/_layout.tsx.
  // Every screen under (app) (Settings, Feed, Profile, …) is a separate
  // Stack.Screen; without this each one painted its own opaque white
  // background over MobileLayout's dark theme.bg.
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
  );

  // Width-driven on every platform now, not gated to web — a real iPad
  // used to always get the phone shell regardless of how wide its
  // viewport actually was, since this used to also require
  // Platform.OS === "web". isMobile is false for anything tablet-width
  // and up, so an iPad (portrait or landscape) now gets the Sidebar
  // shell — collapsed by default at tablet width via Sidebar's own
  // breakpoint check, same as web.
  if (!isMobile) {
    return <SidebarShellLayout>{stack}</SidebarShellLayout>;
  }

  return <MobileLayout>{stack}</MobileLayout>;
}

const styles = StyleSheet.create({
  loader:        { flex: 1, alignItems: "center", justifyContent: "center" },
  mobileRoot:    { flex: 1, position: "relative" },
  mobileContent: { flex: 1, zIndex: 1 },
});
