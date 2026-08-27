import React from "react";
import { Redirect, Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { useMyProfile } from "../../hooks/useProfile";
import { useTheme } from "../../hooks/useTheme";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { FilmGrain } from "../../components/layout/FilmGrain";
import { Sidebar } from "../../components/layout/Sidebar";
import { TabBar } from "../../components/layout/TabBar";
import { TopBar } from "../../components/layout/TopBar";
import { ScreenLoader } from "../../components/ui/Spinner";
import { CustomThemeEditor } from "../../components/ui/CustomThemeEditor";
import type { RawTheme } from "../../constants/themes";

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
        {/* absolute + inset:0 against .mainscroll's own position:relative —
            not display:flex/grid tuning (both tried, both left <Tabs>'s
            content in a 0px box; the flex-grow chain through
            react-navigation's own nested flex:1 views never resolved
            reliably here). This is the same trick <Tabs> uses internally
            for its own screens (StyleSheet.absoluteFill against a
            positioned ancestor) — sidesteps the whole flex-chain
            question by sizing directly off the nearest positioned
            ancestor's padding box, which .mainscroll's own confirmed
            1204x838 computed size already guarantees. <Tabs> renders
            every screen as position:absolute internally, with nothing
            in that chain contributing to a plain block/flex ancestor's
            auto-size — that's what collapsed to 0px under the old flat
            <Stack>-free setup; every tab's content was always fully
            correct in the DOM the whole time (confirmed via computed
            styles + outerHTML), just rendering into a collapsed box. */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" } as React.CSSProperties}>
          {children}
        </div>
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
  // right under it. `insets.bottom` used to be applied here too, wrapping
  // a hand-placed <TabBar/> — now that TabBar is rendered internally by
  // <Tabs> itself (via its `tabBar` render prop, passed BottomTabBarProps
  // including `insets`), TabBar applies its own bottom inset directly; see
  // its own file for why. The old zIndex-stacking fix for the FAB dome
  // poking up out of the bar (documented at length in TabBar.tsx's own
  // header comment) doesn't apply here any more either — the bar is no
  // longer a hand-placed sibling of this screen-content View fighting it
  // for paint order, it's laid out internally by Tabs' own BottomTabView,
  // which already paints the tab bar after (i.e. above) the active
  // screen. Re-verify the dome's overlap if this ever regresses.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.mobileRoot, { backgroundColor: theme.bg }]}>
      {/* Only .grain is app-wide. .cine-bg is NOT a shell layer — in the design
          it appears solely on the mobile login screen and as the Library
          header's 280px band, so rendering it here tinted every screen. */}
      <FilmGrain />

      <View style={[styles.mobileContent, { paddingTop: insets.top }]}>{children}</View>
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
  const {
    theme, setTheme,
    customThemeEditorVisible, closeCustomThemeEditor,
  } = useTheme();
  const { isMobile } = useBreakpoint();
  // Single global mount for the whole authenticated shell — regardless of
  // which layout is actually on screen (SidebarShellLayout on desktop/
  // tablet, MobileLayout below mobile width). This used to live inside
  // Sidebar.tsx on the theory that Sidebar was "always part of the
  // authenticated shell" — true on desktop/tablet, false at mobile width,
  // where AppLayout renders MobileLayout instead and Sidebar (and its
  // sole <CustomThemeEditor>) never mounts at all. openCustomThemeEditor()
  // from Settings' theme grid still flipped ThemeContext's boolean in that
  // case, just with nothing left listening to render the modal — the
  // editor silently never appeared on mobile web or native. Hoisting the
  // one instance here, above the isMobile branch, keeps the single-
  // source-of-truth visibility state from ThemeContext (no reintroducing
  // the old duplicate-instance bug this same lift was meant to fix) while
  // guaranteeing it's mounted no matter which shell is active.
  const customThemeSeed: RawTheme = {
    key: "custom", label: "Custom",
    bg: theme.bg, surface: theme.surface, text: theme.text, accent: theme.accent,
  };
  const customThemeEditor = (
    <CustomThemeEditor
      visible={customThemeEditorVisible}
      initial={customThemeSeed}
      onApply={(raw) => { setTheme(raw); closeCustomThemeEditor(); }}
      onCancel={closeCustomThemeEditor}
    />
  );

  if (loading || (session && profileLoading)) return <ScreenLoader />;

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

  // A real <Tabs> navigator, not a flat <Stack> with TabBar hand-simulating
  // tab switches by pushing new stack entries — that meant no real per-tab
  // back-stack (switching Library -> Feed -> Library pushed a THIRD Library
  // screen rather than resuming the first one) and TabBar had to hand-
  // compute "which tab owns this path" via path-prefix arrays. Each group
  // below ((library), (feed), (search), (profile)) is its own nested Stack
  // (see each group's own _layout.tsx) with a real, independent back-stack;
  // switching tabs suspends/resumes state instead of pushing.
  //
  // TabBar is only rendered as the actual visual tab bar at mobile width —
  // desktop/tablet keeps using Sidebar for navigation, same as before — but
  // BOTH layouts now sit on top of this same real per-tab-stack machinery
  // rather than Sidebar's router.push calls and TabBar's router.push calls
  // both fighting over one flat Stack.
  const tabs = (
    <Tabs
      tabBar={(props) => (isMobile ? <TabBar {...props} /> : null)}
      // sceneStyle:{overflow:"auto"} — <Tabs> renders every screen inside
      // a container that's `flex:1, overflow:'hidden'` internally (a
      // react-navigation/bottom-tabs constant, not something these
      // screenOptions can remove) — without this, a screen taller than
      // the space it's given is clipped rather than scrollable, where it
      // used to rely on .mainscroll's own page-level scroll. This alone
      // produced a real rendering artifact first try: a pale rectangular
      // gap partway down scrolled content. Root cause, confirmed live —
      // not guessed: react-navigation's own Screen wrapper defaults to a
      // light background (rgb(242,242,242), visible in this app's own
      // DOM even with headerShown:false) sized independently of this
      // app's actual (dark, auto-height) content div nested inside it;
      // once that wrapper became a real scrollable box the size mismatch
      // between the two showed as exactly that pale gap. backgroundColor
      // here closes it — the scene's own box now matches this app's
      // background regardless of any height rounding between it and its
      // content. Kept global (not per-screen) on purpose: it's the one
      // piece <Tabs> itself owns that these screenOptions actually reach.
      // scrollbarGutter:"stable" (web-only CSS, harmless no-op on native)
      // — designCss.ts already has this exact rule on .mainscroll, but
      // .mainscroll stopped being the real scrolling element the moment
      // sceneStyle's own overflow:auto (above) took over that job; the
      // existing rule became dead code. Without it, a tab whose content
      // is taller than the viewport gets a real scrollbar (reserving
      // ~8px) and one that isn't (an empty-state tab) doesn't — every
      // screen in this app centers its content column via alignSelf/
      // margin:auto against that same, now-inconsistent available
      // width, so the whole column visibly shifts a few px sideways
      // switching between a tall and a short screen. Reserving the
      // gutter unconditionally here, the one place these screenOptions
      // already reach every screen's real scroll box, fixes it globally
      // instead of per-screen.
      screenOptions={{ headerShown: false, sceneStyle: { overflow: "auto", scrollbarGutter: "stable", backgroundColor: theme.bg } as any }}
    >
      <Tabs.Screen name="(library)" />
      <Tabs.Screen name="(feed)" />
      <Tabs.Screen name="(search)" />
      <Tabs.Screen name="(profile)" />
    </Tabs>
  );

  // Width-driven on every platform now, not gated to web — a real iPad
  // used to always get the phone shell regardless of how wide its
  // viewport actually was, since this used to also require
  // Platform.OS === "web". isMobile is false for anything tablet-width
  // and up, so an iPad (portrait or landscape) now gets the Sidebar
  // shell — collapsed by default at tablet width via Sidebar's own
  // breakpoint check, same as web.
  if (!isMobile) {
    return (
      <>
        <SidebarShellLayout>{tabs}</SidebarShellLayout>
        {customThemeEditor}
      </>
    );
  }

  return (
    <>
      <MobileLayout>{tabs}</MobileLayout>
      {customThemeEditor}
    </>
  );
}

const styles = StyleSheet.create({
  mobileRoot:    { flex: 1, position: "relative" },
  mobileContent: { flex: 1, zIndex: 1 },
});
