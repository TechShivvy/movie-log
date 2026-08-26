/**
 * TabBar — mobile bottom nav.
 *
 * The centre action is a dome, not a floating circle: rounded top,
 * flat bottom anchored flush with the bar's own BOTTOM edge — the
 * whole shape rises from the bottom of the bar, straight sides and
 * all, rather than being a shallow bump tucked just inside its top. A
 * full circle popping up fully above the bar (what this looked like
 * originally) read as a separate, disconnected element hovering over
 * the bar rather than something that belongs to it — this asks to
 * look like a bump built into the bar's own surface instead, bigger
 * than the other four tabs but still clearly *part of* the same bar,
 * not a floating button that happens to overlap it.
 *
 * Structural history, kept because the same mistakes are easy to
 * reintroduce:
 *  1. The centre action used to be a normal flex child of the bar's
 *     row (justifyContent:"space-around"), popping up via a negative
 *     marginTop. That makes its on-screen position dependent on how
 *     the row's flex algorithm lays out ITS SIBLINGS — on a narrow
 *     phone width, a later tab (Search) painting after it in JSX order
 *     could end up overlapping/covering part of its edge if there
 *     wasn't quite enough row width to go around. It's an
 *     absolutely-positioned overlay on top of the bar instead,
 *     centered independently of the tabs' own layout.
 *  2. It was rendering as a flat-topped half-circle on real devices —
 *     traced to app/(app)/_layout.tsx's mobileContent having
 *     zIndex:1 while this bar's own wrapper had none: CSS stacking is
 *     decided by zIndex first and DOM order only as a tiebreak among
 *     equals, so the scrollable content behind the bar (despite being
 *     earlier in the JSX) painted OVER the portion of this button that
 *     pokes up past the bar's own boundary into the content area's
 *     space. Fixed there, not here — that wrapper now carries a higher
 *     zIndex than the content it needs to sit above.
 *  3. The glow used to be a react-native-svg RadialGradient — removed
 *     outright (not just patched) after the shape bugs above: one
 *     fewer exotic native-rendering dependency for this button to go
 *     wrong on, never independently confirmed clean on a real Android
 *     device. A flat dome doesn't really call for a soft radial glow
 *     the way a floating circle did anyway.
 *
 * Also: flat theme.surface + a 1px top line didn't share any visual
 * language with the rest of the app (Sidebar's rounded, elevated cards
 * and `accent@13%` active-pill treatment) — the bar is now an elevated
 * surfaceHigh panel with rounded top corners and the same active-pill
 * pattern Sidebar uses for its nav items.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../../hooks/useTheme";
import { Icon, type IconName } from "../ui/Icon";
import { type as fontSizes } from "../../constants/fonts";

// routeName matches the (app)/_layout.tsx <Tabs.Screen name="..."> value,
// which in turn is the route-group folder name (parens included — that's
// how expo-router/React Navigation identify a group route, even though
// the parens themselves never appear in the actual URL). Real tab-scoped
// route groups now encode "which tab owns this path" — log/movie/venue/
// stats live inside (library)/, settings/notifications inside (profile)/
// — so there's no hand-maintained path-prefix list to keep in sync here
// any more (the old `owns` arrays this file used to carry).
//
// defaultScreen names the file, within that group, this tab should land
// on when pressed with no prior state. (library)/(feed)/(search) each
// have an unambiguous single/index screen, so this is really only load-
// bearing for (profile) — confirmed live that leaving it implicit (a
// bare navigate("(profile)") with no screen) rendered the right screen
// ("profile") but left window.location on "/notifications" (the group's
// alphabetically-first file) regardless of a Stack-level
// initialRouteName or the group's own unstable_settings.initialRouteName
// — neither one drives the URL expo-router derives from a bare group
// navigate. Passing the target screen explicitly here sidesteps that
// default-resolution path entirely instead of fighting it.
const TABS: { icon: IconName; label: string; routeName: string; defaultScreen: string }[] = [
  { icon: "film-strip",       label: "Library", routeName: "(library)", defaultScreen: "index" },
  { icon: "rss",              label: "Feed",    routeName: "(feed)",    defaultScreen: "feed" },
  { icon: "magnifying-glass", label: "Search",  routeName: "(search)",  defaultScreen: "search" },
  { icon: "user",             label: "Profile", routeName: "(profile)", defaultScreen: "profile" },
];

// Wide relative to its height on purpose — 76px read as a tall,
// narrow capsule ("thumb/fingerprint scanner," not a dome bulging out
// of the bar); 100px was the other direction's overshoot ("too big").
// 84 landed close but still ran a bit large — trimmed once more.
const DOME_WIDTH = 74;
// Tall enough that its flat bottom reaches the very bottom of the bar
// (anchored there via `bottom:0`, not tucked a little way into the
// bar's top like the first version was) while its rounded top still
// pokes up past the bar's own top edge — "coming from the bottom of
// the screen like a dome," not a small bump near the bar's top.
const DOME_HEIGHT = 74;
const FAB_ICON = 26;

export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { theme } = useTheme();
  const router = useRouter();

  // No Platform.OS guard: the parent layout (app/(app)/_layout.tsx) now
  // decides whether to mount TabBar at all, based on viewport width, not
  // platform. Pressable/Icon both already render fine on web through
  // react-native-web.
  const inactive = `${theme.text}73`; // text 45%

  // Split so the centre action sits between Feed and Search, as in the design
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  const renderTab = (t: (typeof TABS)[number]) => {
    const routeIndex = state.routes.findIndex((r) => r.name === t.routeName);
    const active = state.index === routeIndex;
    const onPress = () => {
      const route = state.routes[routeIndex];
      if (!route) return;
      // Standard React Navigation custom-tab-bar dance: emit tabPress
      // first so screens can intercept it (none do today, but this is
      // the contract every tab bar is expected to follow), only
      // navigate if nothing called preventDefault. navigate() on an
      // already-mounted tab resumes its existing stack rather than
      // resetting it — the whole point of this being a real Tabs
      // navigator instead of the old flat Stack + router.push.
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (active || event.defaultPrevented) return;
      // route.state only exists once this tab's own nested stack has
      // been entered at least once — before that, a bare
      // navigate(route.name) renders the right default screen but
      // (confirmed live) leaves the URL pointing at whichever file in
      // that group sorts first, not the one actually shown. Passing the
      // target screen explicitly only on this FIRST entry sidesteps
      // that; every later press finds real state already there and
      // resumes it untouched; explicitly re-specifying the default
      // screen on a re-press would reset the tab's stack instead of
      // resuming it, which is the one thing this whole migration was
      // for.
      if (route.state) {
        navigation.navigate(route.name);
      } else {
        navigation.navigate(route.name, { screen: t.defaultScreen } as never);
      }
    };
    return (
      <Pressable key={t.routeName} onPress={onPress} style={styles.tab}>
        {/* Same accent@13% active-pill Sidebar uses for its nav items —
            the one piece of shared visual language the old flat-icon
            tabs had none of. */}
        <View style={[styles.tabPill, active && { backgroundColor: `${theme.accent}21` }]}>
          <Icon name={t.icon} size={22} color={active ? theme.accent : inactive} />
        </View>
        <Text style={{ fontSize: fontSizes.xs, color: active ? theme.accent : inactive }}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { backgroundColor: theme.surfaceHigh, shadowColor: "#000", paddingBottom: 8 + insets.bottom }]}>
      {left.map(renderTab)}
      {/* Reserves the dome's own width in the row's flex flow so the 4
          tabs still space themselves apart the same as before — the
          dome itself is no longer one of these flex children (see
          below), just this empty placeholder matching its footprint. */}
      <View style={{ width: DOME_WIDTH }} />
      {right.map(renderTab)}

      {/* Absolutely positioned over the bar, centered independently of
          the tabs' own flex layout — see the file-level comment for
          why. Anchored to the bar's own BOTTOM edge (not its top) so
          the dome's flat base sits flush with the very bottom of the
          bar — the whole shape rises from there, rather than being a
          shallow bump tucked just inside the bar's top.

          Centering: previously `left:"50%"` + `marginLeft:-(width/2)`.
          That math checks out in isolation, but still measured
          reliably left-of-center on a real device while looking fine
          in Chrome's device emulation on the exact same build — a
          `left:50%` + negative-margin offset only comes out exactly
          centered if the width used for the margin calc matches the
          width the browser/engine actually renders at that pixel
          density; any rounding difference between environments (very
          plausible between a real device's DPI and Chrome's emulated
          one) shows up as exactly this kind of small, consistent,
          hard-to-reproduce-elsewhere shift. Switched to a full-width
          `left:0; right:0` wrapper with `alignItems:"center"` instead —
          flexbox centering doesn't need to know or compute a width to
          subtract, so it can't develop this class of off-by-a-few-
          pixels asymmetry regardless of density/rounding differences
          between environments. */}
      {/* bottom: insets.bottom, not styles.domeWrap's own bottom:0 — an
          absolutely-positioned child's `bottom` is relative to this
          bar's BORDER box, not its padding box, so it doesn't move on
          its own when paddingBottom below grows to make room for the
          safe area. Without this override the dome stays anchored to
          the bar's outer (post-inset) edge instead of its visible
          (pre-inset) content, sinking further down — mostly behind the
          safe-area strip — the taller that inset is (a real ~48dp on
          Android's 3-button nav, confirmed via a device screenshot;
          always 0 in this app's own web-only test environment, which
          is why this went unnoticed until a real device). */}
      <View style={[styles.domeWrap, { bottom: insets.bottom }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.push("/(app)/log/new" as any)}
          style={[
            styles.dome,
            {
              width: DOME_WIDTH,
              height: DOME_HEIGHT,
              borderTopLeftRadius: DOME_WIDTH / 2,
              borderTopRightRadius: DOME_WIDTH / 2,
              backgroundColor: theme.accent,
            },
          ]}
        >
          <Icon name="plus" weight="bold" size={FAB_ICON} color={theme.bg} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    // Anchors the dome's position:"absolute" below to this bar, not to
    // whatever further ancestor happens to be positioned otherwise.
    position: "relative",
    paddingTop: 8,
    paddingHorizontal: 6,
    // paddingBottom is set inline at render (8 + insets.bottom) — the
    // bar's own internal breathing room (matched to paddingTop's 8, same
    // reasoning as before: a lopsided 22-vs-8 gap read as "more space at
    // the bottom" even before device inset) plus real safe-area/home-
    // indicator clearance, now computed here directly from the `insets`
    // BottomTabBarProps already hands this component, rather than by a
    // wrapping View one level up guessing the bar's own padding.
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // Elevated panel, floating over content, instead of a hairline top
    // border — matches the --shadow-md card language used everywhere
    // else (Sidebar cards, dialogs), just cast upward since this sits
    // at the bottom edge of the screen. iOS-only shadow* props, no
    // `elevation` — Android's elevation shadow is computed from the
    // view's rectangular layout bounds, not its borderRadius, so a
    // wide, mostly-rectangular panel like this bar rendered as a
    // visibly square halo poking out past its own rounded top corners
    // (confirmed on a real device). Dropping elevation here means no
    // shadow at all on Android, but that's the safer trade against a
    // shadow shaped nothing like the panel it's supposedly cast by.
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  tab: { alignItems: "center", gap: 3, paddingVertical: 2, paddingHorizontal: 6 },
  tabPill: {
    width: 38, height: 30, borderRadius: 10, overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  // Full-width, non-interactive except where the dome itself is —
  // box-none lets touches pass through the empty left/right strips to
  // whatever's underneath instead of this wrapper eating them.
  domeWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    zIndex: 10,
  },
  dome: {
    // flush with the bar's own bottom edge — see file comment
    alignItems: "center",
    // The dome is much taller than its rounded cap alone (it reaches
    // all the way down to the bar's bottom edge) — centering on the
    // full box would bury the icon down in the straight-sided "stem"
    // well below the visible cap. Pin it near the top instead, roughly
    // where the cap's own visual center is.
    justifyContent: "flex-start",
    paddingTop: 26,
    // No `elevation` — same reasoning as `bar` above. iOS keeps a soft
    // shadow via shadow*; Android renders a flat dome with none, which
    // is the safer trade against a shadow shaped nothing like the
    // dome casting it.
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
});
