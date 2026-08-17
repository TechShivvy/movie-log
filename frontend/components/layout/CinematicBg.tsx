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
export function CinematicBg() {
  const { theme } = useTheme();

  if (Platform.OS === "web") {
    return <div className="cine-bg" />;
  }

  return <NativeCinematicBg accent={theme.accent} />;
}

function NativeCinematicBg({ accent }: { accent: string }) {
  // clgDrift: 0% none → 50% translate(-4%,-3%) scale(1.06) → 100% none, over 18s
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 9000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * -16 }, // ≈ -4% of the oversized layer
      { translateY: progress.value * -12 }, // ≈ -3%
      { scale: 1 + progress.value * 0.06 },
    ],
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
