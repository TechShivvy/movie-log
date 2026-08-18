/**
 * Button — matches design-system .btn classes exactly.
 *
 * Web:    className="btn btn-{variant}" (CSS handles all hover/active/focus states)
 * Native: StyleSheet with design-system measurements.
 *
 * Design spec (.btn):
 *   padding: 5.6px 10px; border-radius:8px; font-size:14px; gap:6px
 *   .btn-primary  → color:accent; border-color:accent
 *   .btn-secondary → border-color:divider
 *   .btn-ghost    → color:accent; no border; padding-inline:2.8px
 *   .btn-icon     → 36×36px; padding:0
 *   .btn-block    → width:100%
 */
import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";

type Variant = "primary" | "secondary" | "ghost" | "icon";

interface ButtonProps {
  onPress?: () => void;
  label?: string;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  style?: ViewStyle | any;
  children?: React.ReactNode;
  /**
   * Web only. A bare <button> defaults to type="submit" when it's inside a
   * <form> — every Button rendered in a form would trigger that form's
   * onSubmit on click, not just the one meant to. Defaults to "button" so
   * opting into submit is explicit.
   */
  type?: "button" | "submit";
}

export function Button({
  onPress, label, variant = "primary", loading, disabled, block, style, children, type = "button",
}: ButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    const classes = ["btn", `btn-${variant}`, block ? "btn-block" : ""].filter(Boolean).join(" ");
    return (
      <button
        type={type}
        className={classes}
        onClick={onPress}
        disabled={isDisabled}
        style={style as React.CSSProperties}
      >
        {loading
          ? <span className="spin">◌</span>
          : children ?? (label && <span>{label}</span>)}
      </button>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  const nativeColor = variant === "primary" || variant === "ghost" ? theme.accent : theme.text;
  const nativeBorder = variant === "primary"   ? theme.accent
                     : variant === "secondary" ? theme.divider
                     : "transparent";
  const nativeBg = "transparent";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "icon"  && styles.iconBtn,
        variant === "ghost" && styles.ghostPad,
        block && styles.block,
        {
          borderColor:     nativeBorder,
          opacity: (pressed || isDisabled) ? 0.6 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={nativeColor} size="small" />
      ) : children ?? (
        <Text style={[styles.label, { color: nativeColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 5.6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  iconBtn: {
    width: 36,
    height: 36,
    padding: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  ghostPad: {
    paddingHorizontal: 2.8,
    borderWidth: 0,
  },
  block: {
    width: "100%",
    marginTop: 5.6,
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 16.8,
  },
});
