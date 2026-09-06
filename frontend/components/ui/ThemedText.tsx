/**
 * ThemedText — the shared entry point for the type scale in constants/
 * fonts.ts's `type` object, so new text doesn't hand-pick a fresh
 * fontSize the way most of the app's existing ~448 raw fontSize sites do.
 * Not a migration of those sites (see that file's own comment) — this is
 * the component future code and incremental migrations should reach for.
 */
import React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { type, type TypeScaleKey, type FontWeightKey, fontStyle } from "../../constants/fonts";

interface ThemedTextProps extends TextProps {
  /** Step on the type scale — see constants/fonts.ts. */
  size?: TypeScaleKey;
  /** Which font family role this text plays — heading (Sora/etc, per the
   * active typeface) or body (Plus Jakarta Sans/etc). Defaults to "body";
   * most running text is body copy, headings are the minority case.
   * Named `fontRole`, not `role` — RN's own accessibility `role` prop
   * (TextProps) already owns that name. */
  fontRole?: "heading" | "body";
  weight?: FontWeightKey;
  /** Defaults to theme.text; pass to override (e.g. theme.error). */
  color?: string;
}

export function ThemedText({ size = "base", fontRole = "body", weight = 400, color, style, ...rest }: ThemedTextProps) {
  const { theme, fontConfig } = useTheme();
  const family = fontStyle(fontConfig, fontRole, weight);

  const computed: TextStyle = {
    fontSize: type[size],
    color: color ?? theme.text,
    ...family,
  };

  return <Text style={[computed, style]} {...rest} />;
}
