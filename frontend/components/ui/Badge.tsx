import React from "react";
import { Text, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { styles } from "./Badge.styles";

interface BadgeProps {
  count?: number;
  dot?: boolean;
  style?: ViewStyle;
}

export function Badge({ count, dot, style }: BadgeProps) {
  const { theme } = useTheme();

  if (dot) {
    return <View style={[styles.dot, { backgroundColor: theme.accent }, style]} />;
  }

  if (!count || count <= 0) return null;

  return (
    <View style={[styles.badge, { backgroundColor: theme.accent }, style]}>
      <Text style={styles.label}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}
