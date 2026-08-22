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
import { Icon, type IconName } from "./Icon";

type TagVariant = "accent" | "outline" | "neutral";
/** "sm" — dense contexts (a poster-grid card footer, a library list row)
 * where the standard 11px/10px-padding pill reads too big next to a 10px
 * title/date. Same colors either way, just tighter type + padding. */
type TagSize = "sm" | "md";

interface TagProps {
  label: string;
  variant?: TagVariant;
  size?: TagSize;
  /** Small leading glyph (e.g. a filled star on a "Favorite" pill) — same
   * icon, both platforms, colored to match the pill's own text color. */
  icon?: IconName;
  style?: ViewStyle | any;
}

export function Tag({ label, variant = "neutral", size = "md", icon, style }: TagProps) {
  const { theme } = useTheme();

  const color =
    variant === "accent"  ? theme.accent100  :
    variant === "outline" ? theme.accent     :
    theme.neutral100;
  const fontSize = size === "sm" ? 10 : 11;

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <span
        className={`tag tag-${variant}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          ...(size === "sm" ? { fontSize: 10, padding: "2px 7px" } : {}),
          ...(style as object),
        } as React.CSSProperties}
      >
        {icon && <Icon name={icon} size={fontSize} weight="fill" color={color} />}
        {label}
      </span>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  const bg =
    variant === "accent"  ? theme.accent800  :
    variant === "outline" ? "transparent"    :
    theme.neutral800;

  const border = variant === "outline" ? theme.accent : "transparent";
  const isNeutral = variant === "neutral";

  return (
    <View style={[styles.tag, size === "sm" && styles.tagSm, { backgroundColor: bg, borderColor: border }, style]}>
      {icon && <Icon name={icon} size={fontSize} weight="fill" color={color} />}
      <Text style={[
        styles.label,
        { color, fontSize },
        isNeutral && styles.mono,
      ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag:   { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: "transparent", alignSelf: "flex-start" },
  tagSm: { paddingVertical: 2, paddingHorizontal: 7 },
  label: { fontSize: 11, letterSpacing: 0.22 },
  mono:  { fontFamily: "JetBrainsMono" },
});
