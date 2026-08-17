import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
 * Cinematic radial-gradient backdrop with slow drift animation.
 *
 * Web    → <div className="cine-bg"> which uses the design-system CSS class:
 *           two radial-gradient blobs, filter:blur(60px), clgDrift 18s keyframe.
 * Native → Two LinearGradient overlays approximating the radial blobs,
 *           animated with react-native-reanimated (18 s loop matching design).
 */
export function CinematicBg() {
  const { theme } = useTheme();

  if (Platform.OS === "web") {
    return <div className="cine-bg" />;
  }

  return <NativeCinematicBg accent={theme.accent} bg={theme.bg} />;
}

function hexToRgba(hex: string, alpha: number) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parseInt(m[0], 16)},${parseInt(m[1], 16)},${parseInt(m[2], 16)},${alpha})`;
}

function NativeCinematicBg({ accent, bg }: { accent: string; bg: string }) {
  // Mimics the 18 s clgDrift keyframe: translate(-4%,-3%) scale(1.06) at 50%
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => {
    const tx = progress.value * -0.04 * 100; // -4% of 100 (arbitrary unit)
    const ty = progress.value * -0.03 * 100;
    const sc = 1 + progress.value * 0.06;
    return { transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] };
  });

  const blob1 = hexToRgba(accent, 0.26);
  const blob2 = hexToRgba(accent, 0.16);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.container, animStyle]}
    >
      {/* Top-left radial blob — circle at 28% 30% */}
      <LinearGradient
        colors={[blob1, "transparent"]}
        style={[StyleSheet.absoluteFill, styles.blob1]}
        start={{ x: 0.0, y: 0.0 }}
        end={{ x: 1.0, y: 1.0 }}
      />
      {/* Bottom-right radial blob — circle at 78% 62% */}
      <LinearGradient
        colors={[blob2, "transparent"]}
        style={[StyleSheet.absoluteFill, styles.blob2]}
        start={{ x: 1.0, y: 1.0 }}
        end={{ x: 0.0, y: 0.0 }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 0,
  },
  blob1: {
    opacity: 1,
  },
  blob2: {
    opacity: 1,
  },
});
