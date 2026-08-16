import React from "react";
import { Text, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { styles } from "./Tag.styles";

type TagVariant = "accent" | "outline" | "neutral";

interface TagProps {
  label: string;
  variant?: TagVariant;
  style?: ViewStyle;
}

export function Tag({ label, variant = "neutral", style }: TagProps) {
  const { theme } = useTheme();

  const bg = variant === "accent" ? `${theme.accent}22` : variant === "outline" ? "transparent" : theme.neutral;
  const border = variant === "outline" ? theme.divider : "transparent";
  const color = variant === "accent" ? theme.accent : theme.text;

  return (
    <View style={[styles.tag, { backgroundColor: bg, borderColor: border }, style]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

