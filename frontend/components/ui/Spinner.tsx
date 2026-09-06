/**
 * Spinner — the one way to say "this is loading".
 *
 * Before this file, three incompatible idioms coexisted: a `◌` glyph in
 * a `<span className="spin">` (web only, ~13 sites, 4 different sizes),
 * `<Icon name="circle-notch">` (Button's own loading prop, a separate
 * code path with the same CSS animation), and bare `<ActivityIndicator>`
 * (native, but also several "platform-agnostic" files with no
 * Platform.OS branch at all, rendering a third, unrelated visual style
 * through react-native-web). Sizes and colors were inconsistent
 * everywhere. This replaces all three.
 *
 * Web reuses the Phosphor circle-notch glyph, which designCss.ts already
 * spins via `.ph-circle-notch, .spin { animation: clgSpin 1s linear
 * infinite; }` — no new CSS needed.
 *
 * Native falls back to ActivityIndicator, which only renders at "small"
 * (~20px) or "large" (~36px) — real sizes, and they differ slightly
 * between iOS and Android. `scaleToSize` opts into an exact-pixel
 * transform for the few slots (upload badges) where the spinner
 * replaces a fixed-size icon and the container has no room to grow;
 * everywhere else the token→native mapping below was chosen so every
 * *existing* native rendering stays byte-identical — the whole visual
 * fix from this file is web-side, which is where the actual
 * inconsistency lived.
 */
import React from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { Icon } from "./Icon";

export type SpinnerSize = "sm" | "md" | "lg";

// Derived from what's actually in use across the app, not invented
// round numbers: 16 = Button's own inline icon size, 24 = the most
// common section-loader size, 28 = the most common full-screen size.
const PX: Record<SpinnerSize, number> = { sm: 16, md: 24, lg: 28 };

// ActivityIndicator's "small" renders ~20px.
const NATIVE_SMALL_PX = 20;

export interface SpinnerProps {
  /** Token, or a raw pixel number for exact icon-replacement parity. */
  size?: SpinnerSize | number;
  /** Defaults to theme.accent. Pass theme.onAccent on accent-filled surfaces — Spinner does NOT inherit color from a colored parent the way the old inline `<span className="spin">` sometimes did. */
  color?: string;
  /**
   * Native only. Scales ActivityIndicator to hit `size` exactly, for
   * slots where the spinner replaces a fixed-size icon inside a
   * container that must not reshape (e.g. an upload badge). Off by
   * default — scaling costs a transform and softens the stroke
   * slightly, worth it only in a tight fixed box.
   */
  scaleToSize?: boolean;
  style?: any;
}

export function Spinner({ size = "md", color, scaleToSize, style }: SpinnerProps) {
  const { theme } = useTheme();
  const px = typeof size === "number" ? size : PX[size];
  const c = color ?? theme.accent;

  if (Platform.OS === "web") {
    return <Icon name="circle-notch" size={px} color={c} style={style} />;
  }

  const nativeSize = px >= 22 ? "large" : "small";

  if (scaleToSize && nativeSize === "small" && px !== NATIVE_SMALL_PX) {
    return (
      <View style={[{ width: px, height: px, alignItems: "center", justifyContent: "center" }, style]}>
        <ActivityIndicator color={c} size="small" style={{ transform: [{ scale: px / NATIVE_SMALL_PX }] }} />
      </View>
    );
  }

  return <ActivityIndicator color={c} size={nativeSize} style={style} />;
}

/** A whole route/screen still fetching its primary data. Bakes in
 * theme.bg so a new call site can't reintroduce the flash-of-wrong-
 * background bug two full-screen loaders had before this file. */
export function ScreenLoader({ size = "lg", color }: { size?: SpinnerSize | number; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
      <Spinner size={size} color={color} />
    </View>
  );
}

/** One list/tab/panel loading inside an already-rendered screen.
 * `padding` overrides the default for tighter contexts (dialogs, cards). */
export function SectionLoader({ size = "md", color, padding = 40 }: {
  size?: SpinnerSize | number;
  color?: string;
  padding?: number;
}) {
  return (
    <View style={{ paddingVertical: padding, alignItems: "center", justifyContent: "center" }}>
      <Spinner size={size} color={color} />
    </View>
  );
}
