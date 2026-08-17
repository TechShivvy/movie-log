/**
 * Tag — matches design-system .tag classes exactly.
 *
 * Design spec (.tag):
 *   font-size:11px; letter-spacing:0.02em; padding:3px 10px; border-radius:6px
 *
 * .tag-accent  → background:accent-800; color:accent-100
 * .tag-neutral → background:neutral-800; color:neutral-100; font-family:mono
 * .tag-outline → border:1px solid accent; color:accent
 */
import React from "react";
import { Platform, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";

type TagVariant = "accent" | "outline" | "neutral";

interface TagProps {
  label: string;
  variant?: TagVariant;
  style?: ViewStyle | any;
}

export function Tag({ label, variant = "neutral", style }: TagProps) {
  const { theme } = useTheme();

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <span className={`tag tag-${variant}`} style={style as React.CSSProperties}>
        {label}
      </span>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  const bg =
    variant === "accent"  ? theme.accent800  :
    variant === "outline" ? "transparent"    :
    theme.neutral800;

  const color =
    variant === "accent"  ? theme.accent100  :
    variant === "outline" ? theme.accent     :
    theme.neutral100;

  const border = variant === "outline" ? theme.accent : "transparent";
  const isNeutral = variant === "neutral";

  return (
    <View style={[styles.tag, { backgroundColor: bg, borderColor: border }, style]}>
      <Text style={[
        styles.label,
        { color },
        isNeutral && styles.mono,
      ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag:   { flexDirection: "row", alignItems: "center", paddingVertical: 3, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: "transparent", alignSelf: "flex-start" },
  label: { fontSize: 11, letterSpacing: 0.22 },
  mono:  { fontFamily: "JetBrainsMono" },
});
