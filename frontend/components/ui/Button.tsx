import React from "react";
import { ActivityIndicator, Pressable, Text, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { styles } from "./Button.styles";

type Variant = "primary" | "secondary" | "ghost" | "icon";

interface ButtonProps {
  onPress?: () => void;
  label?: string;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export function Button({ onPress, label, variant = "primary", loading, disabled, style, children }: ButtonProps) {
  const { theme } = useTheme();

  const bg = variant === "primary"
    ? theme.accent
    : variant === "secondary"
    ? theme.surfaceHigh
    : "transparent";

  const textColor = variant === "primary" ? "#fff" : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === "icon" && styles.icon,
        { backgroundColor: bg, borderColor: variant === "secondary" ? theme.divider : "transparent", opacity: pressed || disabled ? 0.7 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : children ? (
        children
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

