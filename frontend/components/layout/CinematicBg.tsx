import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";

/**
 * Animated cinematic radial-gradient backdrop.
 * On web: CSS keyframe animation via inline style.
 * On native: Animated API slow-drifting color interpolation.
 */
export function CinematicBg() {
  const { theme } = useTheme();

  if (Platform.OS === "web") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: `radial-gradient(ellipse at 30% 40%, ${theme.accent}22 0%, transparent 60%),
                        radial-gradient(ellipse at 70% 60%, ${theme.accentDim} 0%, transparent 50%),
                        ${theme.bg}`,
          animation: "cinematicBgDrift 18s ease-in-out infinite alternate",
        }}
      />
    );
  }

  return <NativeCinematicBg />;
}

function NativeCinematicBg() {
  const { theme } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 9000, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 9000, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]} pointerEvents="none" />
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
});
