/**
 * Card — matches design-system .card class exactly.
 *
 * Design spec (.card):
 *   display:flex; flex-direction:column; gap:5.6px
 *   padding:8.4px; border-radius:8px; background:var(--color-surface)
 *
 * glass variant uses .glass:
 *   background:surface@72% + backdrop-filter:blur(16px)
 */
import React from "react";
import { Platform, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../hooks/useTheme";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | any;
  glass?: boolean;
  /** elevation variant: sm | md | lg */
  elev?: "sm" | "md" | "lg";
}

export function Card({ children, style, glass = false, elev }: CardProps) {
  const { theme } = useTheme();

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    const classes = ["card", glass ? "glass" : "", elev ? `elev-${elev}` : ""].filter(Boolean).join(" ");
    return (
      <div className={classes} style={style as React.CSSProperties}>
        {children}
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  if (glass) {
    return (
      <BlurView
        intensity={40}
        tint="dark"
        style={[
          styles.card,
          { borderWidth: 1, borderColor: theme.divider },
          style,
        ]}
      >
        <View style={{ padding: 2 }}>{children}</View>
      </BlurView>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "column",
    gap: 5.6,
    padding: 8.4,
    borderRadius: 8,
  },
});
