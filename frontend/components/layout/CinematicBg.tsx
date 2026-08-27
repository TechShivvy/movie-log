import React, { useEffect } from "react";
import { Platform, StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "../../hooks/useTheme";

/**
 * Cinematic backdrop — ported from the .cine-bg rule in
 * docs/design/CineLog Web.dc.html:
 *
 *   position:absolute; inset:-30%; z-index:0; filter:blur(60px);
 *   animation: clgDrift 18s ease-in-out infinite;
 *   background:
 *     radial-gradient(circle at 28% 30%, accent 26%, transparent 48%),
 *     radial-gradient(circle at 78% 62%, accent 16%, transparent 54%);
 *
 * Web    → the .cine-bg class (injected by lib/designCss.ts).
 * Native → real SVG radial gradients at the same centres/stops. react-native-svg
 *          supports gradients (it does NOT support filter primitives such as
 *          feGaussianBlur/feTurbulence), and a radial gradient is inherently
 *          soft, so the blur(60px) is approximated by the gradient falloff.
 *          The inset:-30% and the 18s clgDrift transform are reproduced exactly.
 */
interface CinematicBgProps {
  /**
   * Web-only style override applied directly to the .cine-bg element.
   * Pass the design's own overrides here — e.g. Library's header band uses
   * { zIndex: -1, height: 280, top: -60, left: -60, right: -60, bottom: "auto" }.
   * Never wrap this component in an overflow:hidden container: the class's
   * filter:blur(60px) is what softens its edges, and clipping it turns the
   * glow into a hard-edged rectangle.
   */
  style?: React.CSSProperties;
  /**
   * "default" (unchanged everywhere it's already used) is the single soft
   * glow this component has always been. "aurora" is LoginScreen-only: a
   * broader, slower-shifting wash, closer in spirit to a reference the
   * login page was compared against (a fixed 4-hue diagonal gradient,
   * animated via background-position over 15s) — but deliberately
   * subtler (lower opacity, slower cycle) and, unlike that reference,
   * genuinely theme-adaptive: every stop is one of this theme's own
   * accent shades (already live CSS custom properties, updated on every
   * theme change — see ThemeContext.tsx), plus a slow hue-rotate drift
   * derived from the same single accent rather than hand-picked unrelated
   * hues, so it never clashes with whichever theme is active.
   */
  variant?: "default" | "aurora";
}

export function CinematicBg({ style, variant = "default" }: CinematicBgProps = {}) {
  const { theme } = useTheme();

  if (Platform.OS === "web") {
    // .cine-bg-aurora is fully self-contained (position/inset/z-index/
    // background/animation), not an addition on top of .cine-bg —
    // combining both classes on one element would just have every
    // .cine-bg-aurora declaration win the cascade for the same
    // properties (later rule, equal specificity), leaving nothing of
    // .cine-bg's own look actually visible. One class, not two.
    return <div className={variant === "aurora" ? "cine-bg-aurora" : "cine-bg"} style={style} />;
  }

  return <NativeCinematicBg accent={theme.accent} accent700={theme.accent700} aurora={variant === "aurora"} />;
}

function NativeCinematicBg({ accent, accent700, aurora }: { accent: string; accent700: string; aurora: boolean }) {
  // clgDrift: 0% none → 50% translate(-4%,-3%) scale(1.06) → 100% none, over 18s
  const progress = useSharedValue(0);
  // Aurora-only: a third blob (accent700 — a genuinely different, richer
  // shade of the same accent, not a second unrelated hue) breathes its
  // own opacity in and out on a slower, independent cycle. Same spirit
  // as the web variant's hue-rotate drift — a second tone shifting in
  // and out of prominence over time — without needing per-frame SVG
  // gradient-stop color interpolation, which react-native-svg's
  // gradients aren't set up for the way a plain animated opacity is.
  const auroraProgress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 9000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    if (aurora) {
      auroraProgress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 17000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 17000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
    // aurora is a mount-time prop (LoginScreen always passes the same
    // literal), not something that toggles mid-render — safe to leave
    // out of the deps list the same way accent/accent700 already are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aurora]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * -16 }, // ≈ -4% of the oversized layer
      { translateY: progress.value * -12 }, // ≈ -3%
      { scale: 1 + progress.value * 0.06 },
    ],
  }));

  const auroraStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + auroraProgress.value * 0.22,
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.layer, animStyle]}>
      <Svg width="100%" height="100%">
        <Defs>
          {/* circle at 28% 30%, accent @26% → transparent at 48% */}
          <RadialGradient id="clgBlob1" cx="28%" cy="30%" r="48%">
            <Stop offset="0" stopColor={accent} stopOpacity={0.26} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
          {/* circle at 78% 62%, accent @16% → transparent at 54% */}
          <RadialGradient id="clgBlob2" cx="78%" cy="62%" r="54%">
            <Stop offset="0" stopColor={accent} stopOpacity={0.16} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#clgBlob1)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#clgBlob2)" />
      </Svg>
      {aurora && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, auroraStyle]}>
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="clgBlob3" cx="50%" cy="88%" r="62%">
                <Stop offset="0" stopColor={accent700} stopOpacity={0.4} />
                <Stop offset="1" stopColor={accent700} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#clgBlob3)" />
          </Svg>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // inset:-30% — the layer is oversized so the drift never exposes an edge
  layer: {
    position: "absolute",
    top: "-30%",
    left: "-30%",
    right: "-30%",
    bottom: "-30%",
    zIndex: 0,
  },
});
